using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Electrical;

namespace PanelScheduleSync;

/// <summary>
/// Extract data panel + circuit dari model Revit.
/// Grouping circuit diasumsikan sudah dikerjakan manual di Revit —
/// extractor tinggal baca electrical systems per panel.
/// </summary>
public class PanelExtractor(Document doc)
{
    private const double DefaultPowerFactor = 0.8;

    /// <summary>
    /// Tegangan L-L standar — dipakai buat membulatkan hasil L-N × √3
    /// (220 × 1.732 = 381 → 380, bukan 381).
    /// </summary>
    private static readonly double[] StandardLineVoltages =
        [208, 220, 240, 380, 400, 415, 440, 480, 690];

    public List<PanelData> ExtractAll()
    {
        var result = new List<PanelData>();

        var equipments = new FilteredElementCollector(doc)
            .OfCategory(BuiltInCategory.OST_ElectricalEquipment)
            .WhereElementIsNotElementType()
            .OfClass(typeof(FamilyInstance))
            .Cast<FamilyInstance>();

        foreach (FamilyInstance eq in equipments)
        {
            MEPModel? mep = eq.MEPModel;
            ISet<ElectricalSystem>? assigned = mep?.GetAssignedElectricalSystems();
            if (assigned is null || assigned.Count == 0)
                continue; // bukan panel (tidak feed circuit apa pun)

            // supply circuit = system di mana equipment ini BUKAN base equipment
            ElectricalSystem? supply = mep!.GetElectricalSystems()?
                .FirstOrDefault(s => s.BaseEquipment is null || s.BaseEquipment.Id != eq.Id);

            // Urutan HARUS deterministik dan sama dengan panel schedule Revit:
            // GetAssignedElectricalSystems() itu ISet (urutannya acak), jadi
            // sortir dulu per nomor circuit sebelum dipakai/dinomori ulang.
            List<ElectricalSystem> systems = [.. assigned
                .OrderBy(CircuitSortKey)
                .ThenBy(cs => cs.CircuitNumber ?? "", StringComparer.OrdinalIgnoreCase)];

            // Fase/wire panel dari breaker supply-nya: 1–2 pole = 1 fase,
            // ≥3 pole = 3 fase. Panel tanpa supply circuit (paling atas)
            // dianggap 3 fase seperti default sebelumnya.
            bool is3Phase = supply is null || SafePoles(supply) >= 3;
            double powerFactor = DerivePowerFactor(systems);

            var panel = new PanelData
            {
                PanelCode = ParamString(eq, BuiltInParameter.RBS_ELEC_PANEL_NAME) ?? eq.Name,
                // "Location" panel schedule Revit dulu (parameter di family/
                // project), fallback ke nama level tempat panelnya berada.
                Location = ParamStringOrNull(eq.LookupParameter("Location"))
                    ?? (doc.GetElement(eq.LevelId) as Level)?.Name,
                BoxType = "BOX PANEL",
                SourcePanel = supply?.BaseEquipment is { } src
                    ? $"FROM {ParamString(src, BuiltInParameter.RBS_ELEC_PANEL_NAME) ?? src.Name}"
                    : null,
                MainBreakerType = supply is not null ? $"MCB {supply.PolesNumber}P" : null,
                // Prioritas: parameter "MCB Rating" di family panel itu sendiri
                // (custom/project parameter, apa adanya sesuai tampilan Revit).
                // Fallback: Rating circuit supply kalau parameter itu tidak ada.
                MainBreakerRating = eq.LookupParameter("MCB Rating")?.AsValueString()
                    ?? (supply is not null ? $"{supply.Rating:0.00} A" : null),
                IncomingCable = supply?.LookupParameter("Wire Size")?.AsString(),
                Phase = is3Phase ? "3PH" : "1PH",
                Wire = is3Phase ? "4W" : "2W",
                PowerFactor = powerFactor,
            };

            // Voltage & cos φ diambil dari model, bukan default 400V/0.8 —
            // kalau tidak ketemu, default di PanelData yang dipakai.
            if (DeriveVoltage(systems, is3Phase) is { } volts)
                panel.Voltage = volts;

            foreach (ElectricalSystem cs in systems)
            {
                panel.Circuits.Add(ExtractCircuit(cs, powerFactor));
            }

            // Kolom NO. di schedule = nomor urut rapat 1..N, bukan nomor slot
            // Revit. Nomor slot sering loncat (…42, 43, 46, 47, 50, 53…) karena
            // circuit multi-pole memakan beberapa slot sekaligus dan ada slot
            // kosong. Nomor Revit yang asli tetap terbawa di RevitCircuitNumber
            // dan ikut tampil di FUNCTION ("LIGHTING (D)/4").
            for (int i = 0; i < panel.Circuits.Count; i++)
                panel.Circuits[i].CircuitNo = i + 1;

            if (panel.Circuits.Count > 0)
                result.Add(panel);
        }

        return result;
    }

    private static int CircuitSortKey(ElectricalSystem cs)
    {
        int n = ParseCircuitNumber(cs.CircuitNumber);
        return n > 0 ? n : int.MaxValue;
    }

    /// <summary>
    /// Nomor circuit Revit bisa berupa "7", "1,3,5" (multi-pole), pakai prefix
    /// panel — "(D)/7", "DB-FG/7", "L1-7" tergantung setting Circuit Naming di
    /// Electrical Settings — atau kosong (spare/space).
    /// Ambil nomor slot pertama; 0 kalau tidak ada angka sama sekali.
    /// </summary>
    private static int ParseCircuitNumber(string? circuitNumber)
    {
        if (string.IsNullOrWhiteSpace(circuitNumber)) return 0;
        string s = circuitNumber!.Trim();

        // Buang prefix: potong tepat setelah karakter terakhir yang bukan
        // angka/koma ("(D)/1,3,5" -> "1,3,5"), lalu ambil angka pertama =
        // slot pertama circuit itu. Kalau sisanya tidak ada angka (mis. "1A"),
        // jatuh ke angka pertama dari string aslinya.
        int cut = -1;
        for (int i = 0; i < s.Length; i++)
        {
            if (!char.IsDigit(s[i]) && s[i] != ',') cut = i;
        }

        int n = FirstNumber(s.Substring(cut + 1));
        return n > 0 ? n : FirstNumber(s);
    }

    /// <summary>Angka pertama di dalam string; 0 kalau tidak ada.</summary>
    private static int FirstNumber(string s)
    {
        int i = 0;
        while (i < s.Length && !char.IsDigit(s[i])) i++;
        int start = i;
        while (i < s.Length && char.IsDigit(s[i])) i++;
        return i > start && int.TryParse(s.Substring(start, i - start), out int n) ? n : 0;
    }

    private CircuitData ExtractCircuit(ElectricalSystem cs, double powerFactor)
    {
        // Space (slot dicadangkan, belum ada load) diperlakukan seperti spare:
        // tidak ada watt/fixture, tapi tetap punya circuit_no sendiri.
        bool isSpare = cs.CircuitType == CircuitType.Spare;
        bool isSpace = cs.CircuitType == CircuitType.Space;
        bool isEmpty = isSpare || isSpace;
        int poles = SafePoles(cs);

        int circuitNo = ParseCircuitNumber(cs.CircuitNumber);

        // load (watt): pakai True Load, fallback Apparent Load x pf
        double watt = ParamDouble(cs, BuiltInParameter.RBS_ELEC_TRUE_LOAD, UnitTypeId.Watts)
                      ?? (ParamDouble(cs, BuiltInParameter.RBS_ELEC_APPARENT_LOAD, UnitTypeId.VoltAmperes) ?? 0) * powerFactor;

        var circuit = new CircuitData
        {
            // CircuitNo (nomor urut tampilan) diisi belakangan di ExtractAll
            RevitCircuitNumber = string.IsNullOrWhiteSpace(cs.CircuitNumber)
                ? null
                : cs.CircuitNumber.Trim(),
            // TODO: kalau ada shared parameter "Breaker Type" (RCBO/MCCB), itu yang dipakai
            BreakerType = cs.LookupParameter("Breaker Type")?.AsString()
                          ?? $"MCB {poles}P",
            BreakerRating = $"{cs.Rating:0}A",
            OutgoingCable = cs.LookupParameter("Wire Size")?.AsString(),
            IsSpare = isEmpty,
        };

        if (!isEmpty)
            circuit.Fixtures = ExtractFixtures(cs);

        // FUNCTION = jenis fixture yang terhubung + nomor circuit Revit apa
        // adanya, mis. "LIGHTING (D)/4" atau "RECEPTACLE (D)/42".
        circuit.FunctionName = isSpare ? "SPARE"
            : isSpace ? "SPACE"
            : BuildFunctionName(cs, circuit.RevitCircuitNumber) ?? cs.LoadName;

        if (!isEmpty && watt > 0)
        {
            double[] share = PhaseShare(cs, poles, circuitNo);
            circuit.PhaseR = Math.Round(watt * share[0], 1);
            circuit.PhaseS = Math.Round(watt * share[1], 1);
            circuit.PhaseT = Math.Round(watt * share[2], 1);
        }

        return circuit;
    }

    /// <summary>
    /// Porsi beban tiap fase (R/S/T), totalnya 1.0.
    /// Utama: dibaca dari beban per fase milik circuit itu di Revit (parameter
    /// Apparent Load Phase A/B/C) supaya kolom R/S/T di web sama dengan kolom
    /// A/B/C di panel schedule Revit — termasuk circuit 2 pole dan 3 pole yang
    /// tidak balance.
    /// Fallback (parameter tidak ada / nol / tidak konsisten dengan jumlah pole):
    /// 3 pole dibagi rata, 1 pole diperkirakan dari nomor slot (1,2,3 → R,S,T).
    /// </summary>
    private static double[] PhaseShare(ElectricalSystem cs, int poles, int circuitNo)
    {
        double a = ParamDouble(cs, BuiltInParameter.RBS_ELEC_APPARENT_LOAD_PHASEA, UnitTypeId.VoltAmperes) ?? 0;
        double b = ParamDouble(cs, BuiltInParameter.RBS_ELEC_APPARENT_LOAD_PHASEB, UnitTypeId.VoltAmperes) ?? 0;
        double c = ParamDouble(cs, BuiltInParameter.RBS_ELEC_APPARENT_LOAD_PHASEC, UnitTypeId.VoltAmperes) ?? 0;

        double sum = a + b + c;
        int used = (a > 0 ? 1 : 0) + (b > 0 ? 1 : 0) + (c > 0 ? 1 : 0);
        // 1 pole harus kena 1 fase, 2 pole 2 fase, 3 pole 3 fase — kalau tidak
        // cocok berarti parameternya tidak bisa dipercaya, pakai fallback.
        if (sum > 0 && used == Math.Min(poles, 3))
            return [a / sum, b / sum, c / sum];

        if (poles >= 3) return [1 / 3.0, 1 / 3.0, 1 / 3.0];

        return (circuitNo > 0 ? (circuitNo - 1) % 3 : 0) switch
        {
            0 => [1, 0, 0],
            1 => [0, 1, 0],
            _ => [0, 0, 1],
        };
    }

    /// <summary>
    /// cos φ panel = Σ True Load / Σ Apparent Load semua circuit-nya, supaya
    /// TOTAL VA di web sama dengan total VA panel schedule Revit (bukan selalu
    /// dibagi 0.8). Dibatasi 0.5–1.0; default kalau datanya tidak ada.
    /// </summary>
    private static double DerivePowerFactor(List<ElectricalSystem> systems)
    {
        double watt = 0, va = 0;
        foreach (ElectricalSystem cs in systems)
        {
            double? w = ParamDouble(cs, BuiltInParameter.RBS_ELEC_TRUE_LOAD, UnitTypeId.Watts);
            double? a = ParamDouble(cs, BuiltInParameter.RBS_ELEC_APPARENT_LOAD, UnitTypeId.VoltAmperes);
            if (w > 0 && a > 0)
            {
                watt += w!.Value;
                va += a!.Value;
            }
        }

        if (va <= 0) return DefaultPowerFactor;
        return Math.Round(Math.Min(1.0, Math.Max(0.5, watt / va)), 3);
    }

    /// <summary>
    /// Voltage panel dari circuit-nya (parameter Voltage), format seperti
    /// "Volts" di panel schedule Revit: "220/380V" (L-N/L-L) atau "380V".
    /// Circuit 1 pole = L-N, ≥2 pole = L-L. Kalau di panel cuma ada circuit
    /// 1 pole, L-L dihitung L-N × √3 lalu dibulatkan ke tegangan standar
    /// terdekat. Null = tidak ketemu (pakai default PanelData).
    /// </summary>
    private static string? DeriveVoltage(List<ElectricalSystem> systems, bool is3Phase)
    {
        double lineToNeutral = 0, lineToLine = 0;
        foreach (ElectricalSystem cs in systems)
        {
            double v = ParamDouble(cs, BuiltInParameter.RBS_ELEC_VOLTAGE, UnitTypeId.Volts) ?? 0;
            if (v <= 0) continue;

            if (SafePoles(cs) >= 2)
                lineToLine = lineToLine == 0 ? v : Math.Min(lineToLine, v);
            else
                lineToNeutral = lineToNeutral == 0 ? v : Math.Min(lineToNeutral, v);
        }

        if (lineToNeutral <= 0 && lineToLine <= 0) return null;
        if (!is3Phase) return $"{(lineToNeutral > 0 ? lineToNeutral : lineToLine):0}V";
        if (lineToLine <= 0) lineToLine = SnapToStandardVoltage(lineToNeutral * Math.Sqrt(3));

        return lineToNeutral > 0 && Math.Abs(lineToLine - lineToNeutral) >= 1
            ? $"{lineToNeutral:0}/{lineToLine:0}V"
            : $"{lineToLine:0}V";
    }

    private static double SnapToStandardVoltage(double volts)
    {
        foreach (double std in StandardLineVoltages)
        {
            if (Math.Abs(std - volts) / volts <= 0.03) return std;
        }
        return Math.Round(volts);
    }

    /// <summary>
    /// Jenis beban menurut kategori Revit family yang terhubung. Semua family
    /// di kategori Lighting Fixtures jadi "LIGHTING", semua yang di Electrical
    /// Fixtures jadi "RECEPTACLE" — nama family-nya sendiri (mis.
    /// "ACT_E_HIGHBAY_BY698P", "ACT_E_RECEPTACLE INDUSTRIAL") tidak dipakai di
    /// FUNCTION, tapi tetap jadi kolom FIXTURE tersendiri di tabel schedule.
    /// </summary>
    /// Dikunci pakai ElementId (bukan Category.BuiltInCategory) supaya sama-sama
    /// valid di API Revit 2023 dan 2025.
    private static readonly Dictionary<ElementId, string> LoadKindByCategory = new()
    {
        [new ElementId(BuiltInCategory.OST_LightingFixtures)] = "LIGHTING",
        [new ElementId(BuiltInCategory.OST_LightingDevices)] = "LIGHTING",
        [new ElementId(BuiltInCategory.OST_ElectricalFixtures)] = "RECEPTACLE",
        [new ElementId(BuiltInCategory.OST_ElectricalEquipment)] = "EQUIPMENT",
        [new ElementId(BuiltInCategory.OST_MechanicalEquipment)] = "MECHANICAL",
        [new ElementId(BuiltInCategory.OST_PlumbingFixtures)] = "PLUMBING",
        [new ElementId(BuiltInCategory.OST_DataDevices)] = "DATA",
        [new ElementId(BuiltInCategory.OST_CommunicationDevices)] = "COMMUNICATION",
        [new ElementId(BuiltInCategory.OST_FireAlarmDevices)] = "FIRE ALARM",
        [new ElementId(BuiltInCategory.OST_SecurityDevices)] = "SECURITY",
        [new ElementId(BuiltInCategory.OST_TelephoneDevices)] = "TELEPHONE",
        [new ElementId(BuiltInCategory.OST_NurseCallDevices)] = "NURSE CALL",
        [new ElementId(BuiltInCategory.OST_SpecialityEquipment)] = "SPECIALITY EQUIPMENT",
    };

    /// <summary>
    /// Jenis beban satu element. Kategori di luar daftar dipakai nama
    /// kategorinya; null kalau element tidak punya kategori sama sekali.
    /// </summary>
    private static string? LoadKindOf(Element el)
    {
        Category? cat = el.Category;
        if (cat is null) return null;

        if (LoadKindByCategory.TryGetValue(cat.Id, out string? kind)) return kind;

        return string.IsNullOrWhiteSpace(cat.Name) ? null : cat.Name.ToUpperInvariant();
    }

    /// <summary>
    /// FUNCTION = jenis fixture + nomor circuit Revit apa adanya, mengikuti
    /// format panel schedule yang dipakai di gambar: "LIGHTING (D)/4",
    /// "RECEPTACLE (D)/42". Circuit yang isinya campuran digabung " + "
    /// ("LIGHTING + RECEPTACLE (D)/7"). Null kalau tidak ada yang bisa dipakai
    /// (pemanggil jatuh ke Load Name bawaan Revit).
    /// </summary>
    private static string? BuildFunctionName(ElectricalSystem cs, string? circuitNumber)
    {
        var kinds = new List<string>();
        foreach (Element el in cs.Elements)
        {
            string? kind = LoadKindOf(el);
            if (kind is not null && !kinds.Contains(kind)) kinds.Add(kind);
        }

        string label = string.Join(" + ", kinds);
        if (label.Length == 0)
            return string.IsNullOrWhiteSpace(circuitNumber) ? null : circuitNumber;

        return string.IsNullOrWhiteSpace(circuitNumber) ? label : $"{label} {circuitNumber}";
    }

    /// <summary>Group element di circuit per family + type (= type family Revit).</summary>
    private List<FixtureData> ExtractFixtures(ElectricalSystem cs)
    {
        var groups = new Dictionary<string, FixtureData>();

        foreach (Element el in cs.Elements)
        {
            var elType = doc.GetElement(el.GetTypeId()) as ElementType;
            string family = elType?.FamilyName ?? el.Category?.Name ?? "UNKNOWN";
            string? label = elType?.Name;
            string key = $"{family}|{label}";

            if (!groups.TryGetValue(key, out FixtureData? fx))
            {
                fx = new FixtureData
                {
                    FixtureType = family.ToUpperInvariant(),
                    FixtureLabel = label?.ToUpperInvariant(),
                    WattPerUnit = ParamDouble(elType, "Wattage", UnitTypeId.Watts),
                };
                groups[key] = fx;
            }

            fx.Quantity++;
        }

        return [.. groups.Values];
    }

    private static int SafePoles(ElectricalSystem cs)
    {
        try
        {
            return Math.Max(1, cs.PolesNumber);
        }
        catch
        {
            return 1;
        }
    }

    private static string? ParamString(Element el, BuiltInParameter bip) =>
        ParamStringOrNull(el.get_Parameter(bip));

    /// <summary>Isi parameter sebagai teks (AsString, fallback AsValueString); null kalau kosong.</summary>
    private static string? ParamStringOrNull(Parameter? p)
    {
        string? v = p?.AsString();
        if (string.IsNullOrWhiteSpace(v)) v = p?.AsValueString();
        return string.IsNullOrWhiteSpace(v) ? null : v;
    }

    private static double? ParamDouble(Element? el, BuiltInParameter bip, ForgeTypeId unit)
    {
        Parameter? p = el?.get_Parameter(bip);
        if (p is null || !p.HasValue) return null;
        return UnitUtils.ConvertFromInternalUnits(p.AsDouble(), unit);
    }

    private static double? ParamDouble(Element? el, string name, ForgeTypeId unit)
    {
        Parameter? p = el?.LookupParameter(name);
        if (p is null || !p.HasValue || p.StorageType != StorageType.Double) return null;
        double v = UnitUtils.ConvertFromInternalUnits(p.AsDouble(), unit);
        return v > 0 ? v : null;
    }
}
