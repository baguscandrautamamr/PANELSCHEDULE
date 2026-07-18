using System.Reflection;
using System.Windows.Media.Imaging;
using Autodesk.Revit.UI;

namespace PanelScheduleSync;

/// <summary>Ribbon tab "Panel Schedule" dengan tombol "Push to Website".</summary>
public class App : IExternalApplication
{
    /// <summary>Load icon PNG yang di-embed di assembly (Resources\*.png).</summary>
    private static BitmapImage? LoadIcon(string fileName)
    {
        using var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream($"PanelScheduleSync.Resources.{fileName}");
        if (stream is null) return null;

        var image = new BitmapImage();
        image.BeginInit();
        image.CacheOption = BitmapCacheOption.OnLoad;
        image.StreamSource = stream;
        image.EndInit();
        image.Freeze();
        return image;
    }

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
            LargeImage = LoadIcon("push32.png"),
            Image = LoadIcon("push16.png"),
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
            LargeImage = LoadIcon("pull32.png"),
            Image = LoadIcon("pull16.png"),
        };
        panel.AddItem(pullButton);

        return Result.Succeeded;
    }

    public Result OnShutdown(UIControlledApplication application) => Result.Succeeded;
}
