using System.Reflection;
using Autodesk.Revit.UI;

namespace PanelScheduleSync;

/// <summary>Ribbon tab "Panel Schedule" dengan tombol "Push to Website".</summary>
public class App : IExternalApplication
{
    public Result OnStartup(UIControlledApplication application)
    {
        const string tabName = "Panel Schedule";
        try
        {
            application.CreateRibbonTab(tabName);
        }
        catch
        {
            // tab sudah ada — abaikan
        }

        RibbonPanel panel = application.CreateRibbonPanel(tabName, "Sync");
        string assemblyPath = Assembly.GetExecutingAssembly().Location;

        var button = new PushButtonData(
            "PanelSchedulePushToWebsite",
            "Push to\nWebsite",
            assemblyPath,
            "PanelScheduleSync.PushCommand")
        {
            ToolTip = "Extract data panel & circuit dari model, lalu push ke Supabase "
                      + "(website panel schedule). Trigger manual, tidak auto-sync.",
        };

        panel.AddItem(button);

        var pullButton = new PushButtonData(
            "PanelSchedulePullFromWebsite",
            "Pull from\nWebsite",
            assemblyPath,
            "PanelScheduleSync.PullCommand")
        {
            ToolTip = "Tarik perubahan breaker & kabel yang diedit di website "
                      + "kembali ke circuit di model Revit.",
        };
        panel.AddItem(pullButton);

        return Result.Succeeded;
    }

    public Result OnShutdown(UIControlledApplication application) => Result.Succeeded;
}
