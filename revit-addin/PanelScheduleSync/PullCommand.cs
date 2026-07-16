using System.Text;
using System.Text.RegularExpressions;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Electrical;
using Autodesk.Revit.UI;

namespace PanelScheduleSync;

/// <summary>
/// Tombol "Pull from Website": tarik perubahan yang diedit di website
/// kembali ke model Revit — rating circuit, "Breaker Type", "Wire Size",
/// dan FUNCTION (Load Name / Circuit Description) kalau parameternya ada
/// dan tidak read-only.
/// </summary>
[Transaction(TransactionMode.Manual)]
public partial class PullCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
    {
        Document doc = commandData.Application.ActiveUIDocument.Document;
        var client = new SupabaseClient();
        var report = new StringBuilder();
        int updated = 0, skippedCable = 0, skippedFunction = 0;
        int disconnected = 0, failedDisconnect = 0;

        try
        {
            var equipments = new FilteredElementCollector(doc)
                .OfCategory(BuiltInCategory.OST_ElectricalEquipment)
                .WhereElementIsNotElementType()
                .OfClass(typeof(FamilyInstance))
                .Cast<FamilyInstance>()
                .ToList();

            using var tx = new Transaction(doc, "Pull Panel Schedule dari Website");
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
                    report.AppendLine($"{panelCode}: tidak ada di website — dilewati");
                    continue;
                }

                var byNo = rows
                    .GroupBy(r => r.CircuitNo)
                    .ToDictionary(g => g.Key, g => g.First());

                int panelUpdated = 0;
                foreach (ElectricalSystem cs in assigned)
                {
                    int no = ParseFirstNumber(cs.CircuitNumber);
                    if (no <= 0 || !byNo.TryGetValue(no, out CircuitData? row)) continue;

                    bool changed = false;

                    // rating breaker ("20A" -> 20 A)
                    double? amp = ParseAmpere(row.BreakerRating);
                    if (amp is not null)
                    {
                        Parameter? p = cs.get_Parameter(BuiltInParameter.RBS_ELEC_CIRCUIT_RATING_PARAM);
                        if (p is { IsReadOnly: false })
                        {
                            double internalVal = UnitUtils.ConvertToInternalUnits(amp.Value, UnitTypeId.Amperes);
                            if (Math.Abs(p.AsDouble() - internalVal) > 1e-6)
                            {
                                p.Set(internalVal);
                                changed = true;
                            }
                        }
                    }

                    // breaker type -> shared param "Breaker Type" (kalau ada)
                    changed |= TrySetText(cs, "Breaker Type", row.BreakerType);

                    // kabel -> param "Wire Size" (di banyak project read-only karena
                    // dihitung dari wire type — kalau begitu dilewati)
                    bool cableSet = TrySetText(cs, "Wire Size", row.OutgoingCable);
                    if (!cableSet && !string.IsNullOrWhiteSpace(row.OutgoingCable)) skippedCable++;
                    changed |= cableSet;

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
                List<(string Id, int No)> deletedRows =
                    Task.Run(() => client.GetDeletedCircuitsByPanelCodeAsync(panelCode))
                        .GetAwaiter().GetResult();
                foreach ((string rowId, int no) in deletedRows)
                {
                    ElectricalSystem? cs = assigned
                        .FirstOrDefault(s => ParseFirstNumber(s.CircuitNumber) == no);
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
                    // baris tombstone tinggal dibersihkan
                    Task.Run(() => client.DeleteCircuitAsync(rowId)).GetAwaiter().GetResult();
                }

                report.AppendLine(
                    $"{panelCode}: {panelUpdated} circuit diupdate"
                    + (panelDisconnected > 0 ? $", {panelDisconnected} di-disconnect" : ""));
            }

            tx.Commit();

            TaskDialog.Show("Panel Schedule Sync — Pull",
                $"Selesai. {updated} circuit diupdate.\n"
                + $"{disconnected} circuit di-disconnect dari panel (dihapus lewat website).\n"
                + (failedDisconnect > 0
                    ? $"{failedDisconnect} circuit GAGAL di-disconnect — coba Pull lagi.\n"
                    : "")
                + $"{skippedCable} nilai kabel dilewati (param 'Wire Size' read-only).\n"
                + $"{skippedFunction} nilai function dilewati (param 'Load Name'/'Circuit Description' "
                + "tidak ada atau read-only).\n\n"
                + report);
            return Result.Succeeded;
        }
        catch (Exception ex)
        {
            message = ex.Message;
            TaskDialog.Show("Panel Schedule Sync — Error", ex.ToString());
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

    private static int ParseFirstNumber(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return 0;
        string digits = new(s.Trim().TakeWhile(char.IsDigit).ToArray());
        return int.TryParse(digits, out int n) ? n : 0;
    }

    /// <summary>"20A", "20 A", "20" -> 20.0</summary>
    private static double? ParseAmpere(string? rating)
    {
        if (string.IsNullOrWhiteSpace(rating)) return null;
        Match m = AmpereRegex().Match(rating);
        return m.Success && double.TryParse(m.Value, out double v) ? v : null;
    }

    [GeneratedRegex(@"\d+(\.\d+)?")]
    private static partial Regex AmpereRegex();
}
