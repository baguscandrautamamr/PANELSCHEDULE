using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace PanelScheduleSync;

/// <summary>Tombol "Push to Website": extract semua panel lalu push ke Supabase.</summary>
[Transaction(TransactionMode.ReadOnly)]
public class PushCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
    {
        Document doc = commandData.Application.ActiveUIDocument.Document;

        try
        {
            var extractor = new PanelExtractor(doc);
            List<PanelData> panels = extractor.ExtractAll();

            if (panels.Count == 0)
            {
                TaskDialog.Show("Panel Schedule Sync",
                    "Tidak ada panel (electrical equipment dengan assigned circuits) di model ini.");
                return Result.Cancelled;
            }

            string projectName = string.IsNullOrWhiteSpace(doc.ProjectInformation?.Name)
                ? doc.Title
                : doc.ProjectInformation!.Name;

            var confirm = new TaskDialog("Panel Schedule Sync")
            {
                MainInstruction = $"Push {panels.Count} panel ke website?",
                MainContent = string.Join("\n", panels.Select(p => $"• {p.PanelCode} ({p.Circuits.Count} circuit)")),
                CommonButtons = TaskDialogCommonButtons.Yes | TaskDialogCommonButtons.No,
                DefaultButton = TaskDialogResult.Yes,
            };
            if (confirm.Show() != TaskDialogResult.Yes)
                return Result.Cancelled;

            var client = new SupabaseClient();
            string summary = Task.Run(() => client.PushAsync(projectName, panels))
                .GetAwaiter().GetResult();

            TaskDialog.Show("Panel Schedule Sync", $"Berhasil push:\n\n{summary}");
            return Result.Succeeded;
        }
        catch (Exception ex)
        {
            message = ex.Message;
            TaskDialog.Show("Panel Schedule Sync — Error", ex.ToString());
            return Result.Failed;
        }
    }
}
