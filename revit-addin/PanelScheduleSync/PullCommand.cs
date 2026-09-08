using System.Text;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Electrical;
using Autodesk.Revit.UI;

namespace PanelScheduleSync;

/// <summary>
/// Tombol "Pull from Website": tarik perubahan yang diedit di website
/// kembali ke model Revit — FUNCTION (Load Name / Circuit Description) kalau
/// parameternya ada dan tidak read-only, plus disconnect circuit yang dihapus
/// lewat website. Breaker & kabel TIDAK ikut: keduanya hasil hitungan website
/// dari beban circuit, bukan data yang disimpan per circuit.
/// </summary>
[Transaction(TransactionMode.Manual)]
public class PullCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
    {
        Document doc = commandData.Application.ActiveUIDocument.Document;
        var client = new SupabaseClient();
        var report = new StringBuilder();
        int updated = 0, skippedFunction = 0;
        int disconnected = 0, failedDisconnect = 0;

        // Baris tombstone yang sudah beres di model — baru dibersihkan dari
        // database SETELAH transaksi Revit commit, supaya kalau commit gagal
        // niat hapusnya tidak ikut hilang dan bisa dicoba lagi di Pull berikutnya.
        var tombstonesToClear = new List<string>();

        try
        {
            var equipments = new FilteredElementCollector(doc)
                .OfCategory(BuiltInCategory.OST_ElectricalEquipment)
                .WhereElementIsNotElementType()
                .OfClass(typeof(FamilyInstance))
                .Cast<FamilyInstance>()
                .ToList();

            using var tx = new Transaction(doc, L.T(
                "Pull Panel Schedule dari Website", "Pull Panel Schedule from Website"));
            tx.Start();

            foreach (FamilyInstance eq in equipments)
            {
                ISet<ElectricalSystem>? assigned = eq.MEPModel?.GetAssignedElectricalSystems();
                if (assigned is null || assigned.Count == 0) continue;

                string panelCode =
                    eq.get_Parameter(BuiltInParameter.RBS_ELEC_PANEL_NAME)?.AsString() is { Length: > 0 } n
                        ? n
                        : eq.Name;

                List<CircuitData>? rows = Task.Run(() => client.GetCircuitsByPanelCodeAsync(panelCode))
                    .GetAwaiter().GetResult();
                if (rows is null)
                {
                    report.AppendLine(L.T(
                        $"{panelCode}: tidak ada di website — dilewati",
                        $"{panelCode}: not on the website — skipped"));
                    continue;
                }

                int panelUpdated = 0;
                foreach (ElectricalSystem cs in assigned)
                {
                    CircuitData? row = MatchRow(rows, cs);
                    if (row is null) continue;

                    bool changed = false;

                    // FUNCTION -> "Load Name" / "Circuit Description" (nama beda-beda
                    // tiap versi Revit/family) — kalau tidak ada param yang cocok dan
                    // bisa ditulis, dilewati (berarti read-only, dihitung ke user).
                    bool functionSet = TrySetFunctionName(cs, row.FunctionName);
                    if (!functionSet && !string.IsNullOrWhiteSpace(row.FunctionName)) skippedFunction++;
                    changed |= functionSet;

                    if (changed)
                    {
                        updated++;
                        panelUpdated++;
                    }
                }

                // circuit yang dihapus lewat website (tombstone circuit_no
                // negatif): disconnect dari panel, lalu bersihkan barisnya
                int panelDisconnected = 0;
                List<DeletedCircuit> deletedRows =
                    Task.Run(() => client.GetDeletedCircuitsByPanelCodeAsync(panelCode))
                        .GetAwaiter().GetResult();
                foreach (DeletedCircuit del in deletedRows)
                {
                    ElectricalSystem? cs = MatchSystem(assigned, del.RevitCircuitNumber, del.No);
                    if (cs is not null)
                    {
                        try
                        {
                            cs.DisconnectPanel();
                            disconnected++;
                            panelDisconnected++;
                        }
                        catch
                        {
                            // gagal disconnect — biarkan tombstone di database
                            // supaya bisa dicoba lagi di Pull berikutnya
                            failedDisconnect++;
                            continue;
                        }
                    }
                    // circuit tidak ada di model (atau sudah ter-disconnect):
                    // baris tombstone tinggal dibersihkan setelah commit
                    tombstonesToClear.Add(del.Id);
                }

                report.AppendLine(
                    L.T($"{panelCode}: {panelUpdated} circuit diupdate",
                        $"{panelCode}: {panelUpdated} circuits updated")
                    + (panelDisconnected > 0
                        ? L.T($", {panelDisconnected} di-disconnect",
                              $", {panelDisconnected} disconnected")
                        : ""));
            }

            tx.Commit();

            // Model sudah tersimpan — baru sekarang tombstone-nya dibuang dari
            // database. Kalau salah satu gagal, barisnya tetap ada dan Pull
            // berikutnya tinggal mengulang (disconnect-nya idempoten).
            foreach (string rowId in tombstonesToClear)
            {
                try
                {
                    Task.Run(() => client.DeleteCircuitAsync(rowId)).GetAwaiter().GetResult();
                }
                catch
                {
                    // dibiarkan buat Pull berikutnya
                }
            }

            TaskDialog.Show($"{L.DialogTitle} — Pull",
                L.T(
                    $"Selesai. {updated} circuit diupdate.\n"
                    + $"{disconnected} circuit di-disconnect dari panel (dihapus lewat website).\n"
                    + (failedDisconnect > 0
                        ? $"{failedDisconnect} circuit GAGAL di-disconnect — coba Pull lagi.\n"
                        : "")
                    + $"{skippedFunction} nilai function dilewati (param 'Load Name'/'Circuit Description' "
                    + "tidak ada atau read-only).",
                    $"Done. {updated} circuits updated.\n"
                    + $"{disconnected} circuits disconnected from their panel (deleted on the website).\n"
                    + (failedDisconnect > 0
                        ? $"{failedDisconnect} circuits FAILED to disconnect — run Pull again.\n"
                        : "")
                    + $"{skippedFunction} function values skipped ('Load Name'/'Circuit Description' "
                    + "parameter missing or read-only).")
                + $"\n\n{report}");
            return Result.Succeeded;
        }
        catch (Exception ex)
        {
            message = ex.Message;
            TaskDialog.Show($"{L.DialogTitle} — Error", ex.ToString());
            return Result.Failed;
        }
    }

    private static bool TrySetText(Element el, string paramName, string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return false;
        Parameter? p = el.LookupParameter(paramName);
        if (p is null || p.IsReadOnly || p.StorageType != StorageType.String) return false;
        if (p.AsString() == value) return false;
        return p.Set(value);
    }

    /// <summary>
    /// FUNCTION di website biasanya di-generate dari family fixture, jadi di
    /// Revit tidak ada satu nama parameter baku — coba beberapa kandidat yang
    /// umum dipakai buat override nama load di panel schedule.
    /// </summary>
    private static bool TrySetFunctionName(ElectricalSystem cs, string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return false;
        foreach (string candidate in new[] { "Load Name", "Circuit Description", "Comments" })
        {
            if (TrySetText(cs, candidate, value)) return true;
        }
        return false;
    }

    /// <summary>
    /// Cari baris website yang mewakili circuit ini. Kunci utamanya
    /// "Circuit Number" Revit apa adanya ("(D)/4", "DB-FG/42", "1,3,5") —
    /// dicocokkan sebagai teks, jadi prefix panel apa pun tetap kena.
    /// </summary>
    private static CircuitData? MatchRow(List<CircuitData> rows, ElectricalSystem cs)
    {
        string number = (cs.CircuitNumber ?? "").Trim();
        if (number.Length == 0) return null;

        return rows.FirstOrDefault(
            r => string.Equals(r.RevitCircuitNumber?.Trim(), number, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>
    /// Kebalikan <see cref="MatchRow"/>: cari circuit di model untuk satu baris
    /// website. Baris lama (dibuat sebelum kolom revit_circuit_number ada) tidak
    /// punya nomor asli — untuk itu saja dipakai fallback nomor urut lama.
    /// </summary>
    private static ElectricalSystem? MatchSystem(
        ISet<ElectricalSystem> systems, string? revitCircuitNumber, int legacyNo)
    {
        string number = (revitCircuitNumber ?? "").Trim();
        if (number.Length > 0)
        {
            return systems.FirstOrDefault(
                s => string.Equals((s.CircuitNumber ?? "").Trim(), number, StringComparison.OrdinalIgnoreCase));
        }

        return legacyNo > 0
            ? systems.FirstOrDefault(s => ParseLeadingNumber(s.CircuitNumber) == legacyNo)
            : null;
    }

    /// <summary>Angka di awal string ("42/A" -> 42); 0 kalau tidak diawali angka.</summary>
    private static int ParseLeadingNumber(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return 0;
        string digits = new(s!.Trim().TakeWhile(char.IsDigit).ToArray());
        return int.TryParse(digits, out int n) ? n : 0;
    }
}
