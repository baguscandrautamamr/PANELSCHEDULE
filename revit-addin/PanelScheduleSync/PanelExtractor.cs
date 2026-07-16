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

            var panel = new PanelData
            {
                PanelCode = ParamString(eq, BuiltInParameter.RBS_ELEC_PANEL_NAME) ?? eq.Name,
                Location = (doc.GetElement(eq.LevelId) as Level)?.Name,
                BoxType = "BOX PANEL",
                SourcePanel = supply?.BaseEquipment is { } src
                    ? $"FROM {ParamString(src, BuiltInParameter.RBS_ELEC_PANEL_NAME) ?? src.Name}"
                    : null,
                MainBreakerType = supply is not null ? $"MCB {supply.PolesNumber}P" : null,
                MainBreakerRating = supply is not null ? $"{supply.Rating:0}A" : null,
                IncomingCable = supply?.LookupParameter("Wire Size")?.AsString(),
                // TODO: ambil voltage/phase/wire dari Distribution System kalau perlu
            };

            foreach (ElectricalSystem cs in assigned.OrderBy(CircuitSortKey))
            {
                panel.Circuits.Add(ExtractCircuit(cs, panel.PowerFactor));
            }

            RenumberDuplicates(panel.Circuits);

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
    /// Nomor circuit Revit bisa berupa "7", "1,3,5" (multi-pole), atau kosong
    /// (spare/space) — ambil angka pertama; 0 kalau tidak ada.
    /// </summary>
    private static int ParseCircuitNumber(string? circuitNumber)
    {
        if (string.IsNullOrWhiteSpace(circuitNumber)) return 0;
        string digits = new(circuitNumber.Trim().TakeWhile(char.IsDigit).ToArray());
        return int.TryParse(digits, out int n) ? n : 0;
    }

    /// <summary>
    /// circuit_no wajib unik per panel (constraint di database).
    /// Nomor 0 / duplikat diganti nomor kosong berikutnya.
    /// </summary>
    private static void RenumberDuplicates(List<CircuitData> circuits)
    {
        var used = new HashSet<int>();
        int next = 1;
        foreach (CircuitData c in circuits)
        {
            if (c.CircuitNo > 0 && used.Add(c.CircuitNo))
                continue;
            while (used.Contains(next)) next++;
            c.CircuitNo = next;
            used.Add(next);
        }
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
            CircuitNo = circuitNo,
            // TODO: kalau ada shared parameter "Breaker Type" (RCBO/MCCB), itu yang dipakai
            BreakerType = cs.LookupParameter("Breaker Type")?.AsString()
                          ?? $"MCB {poles}P",
            BreakerRating = $"{cs.Rating:0}A",
            OutgoingCable = cs.LookupParameter("Wire Size")?.AsString(),
            IsSpare = isEmpty,
        };

        if (!isEmpty)
            circuit.Fixtures = ExtractFixtures(cs);

        // FUNCTION sync dengan family Revit: nama diambil dari family
        // fixture yang terhubung di circuit (bukan load classification).
        circuit.FunctionName = isSpare ? "SPARE"
            : isSpace ? "SPACE"
            : BuildFunctionName(circuit.Fixtures) ?? cs.LoadName;

        if (!isEmpty && watt > 0)
        {
            if (poles >= 3)
            {
                // 3PH: balance R/S/T
                double perPhase = Math.Round(watt / 3.0, 1);
                circuit.PhaseR = perPhase;
                circuit.PhaseS = perPhase;
                circuit.PhaseT = perPhase;
            }
            else
            {
                // 1PH (termasuk RCBO 2P = phase + neutral): isi satu kolom fase.
                // Aproksimasi fase dari nomor circuit (1,2,3 -> R,S,T bergilir).
                // TODO: sesuaikan dengan arrangement slot panel kalau perlu presisi.
                int phaseIndex = circuitNo > 0 ? (circuitNo - 1) % 3 : 0;
                double w = Math.Round(watt, 1);
                if (phaseIndex == 0) circuit.PhaseR = w;
                else if (phaseIndex == 1) circuit.PhaseS = w;
                else circuit.PhaseT = w;
            }
        }

        return circuit;
    }

    /// <summary>
    /// Nama function dari family Revit yang terhubung di circuit —
    /// distinct family name, digabung " + " kalau campuran.
    /// </summary>
    private static string? BuildFunctionName(List<FixtureData> fixtures)
    {
        if (fixtures.Count == 0) return null;
        var families = fixtures
            .Select(f => f.FixtureType)
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Distinct()
            .ToList();
        return families.Count == 0 ? null : string.Join(" + ", families);
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

    private static string? ParamString(Element el, BuiltInParameter bip)
    {
        string? v = el.get_Parameter(bip)?.AsString();
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
