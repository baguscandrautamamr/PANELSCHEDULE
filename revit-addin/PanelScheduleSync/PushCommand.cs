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

            string defaultProject = string.IsNullOrWhiteSpace(doc.ProjectInformation?.Name)
                ? doc.Title
                : doc.ProjectInformation!.Name;

            var client = new SupabaseClient();

            List<string> existingProjects;
            try
            {
                existingProjects = Task.Run(client.GetProjectNamesAsync).GetAwaiter().GetResult();
            }
            catch
            {
                existingProjects = []; // offline / gagal fetch — tetap bisa ketik manual
            }

            string panelSummary = string.Join("\n",
                panels.Select(p => $"• {p.PanelCode} ({p.Circuits.Count} circuit)"));

            var picker = new ProjectPickerWindow(existingProjects, defaultProject, panelSummary);
            if (picker.ShowDialog() != true)
                return Result.Cancelled;

            string projectName = picker.SelectedProject;
            string summary = Task.Run(() => client.PushAsync(projectName, panels))
                .GetAwaiter().GetResult();

            TaskDialog.Show("Panel Schedule Sync",
                $"Berhasil push ke project \"{projectName}\":\n\n{summary}");
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
