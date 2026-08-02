using System.Reflection;
using Autodesk.Revit.UI;

namespace PanelScheduleSync;

/// <summary>Ribbon tab "Panel Schedule": Push, Pull, dan tombol ganti bahasa.</summary>
public class App : IExternalApplication
{
    private static PushButton? _pushButton;
    private static PushButton? _pullButton;
    private static PushButton? _langButton;

    public Result OnStartup(UIControlledApplication application)
    {
        L.InitDefaultFromRevit(application.ControlledApplication.Language);

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

        var pushData = new PushButtonData(
            "PanelSchedulePushToWebsite",
            "Push",
            assemblyPath,
            "PanelScheduleSync.PushCommand")
        {
            LargeImage = RibbonIcons.Push32,
            Image = RibbonIcons.Push16,
        };
        _pushButton = panel.AddItem(pushData) as PushButton;

        var pullData = new PushButtonData(
            "PanelSchedulePullFromWebsite",
            "Pull",
            assemblyPath,
            "PanelScheduleSync.PullCommand")
        {
            LargeImage = RibbonIcons.Pull32,
            Image = RibbonIcons.Pull16,
        };
        _pullButton = panel.AddItem(pullData) as PushButton;

        panel.AddSeparator();

        var langData = new PushButtonData(
            "PanelScheduleLanguage",
            "Language",
            assemblyPath,
            "PanelScheduleSync.LanguageCommand")
        {
            LargeImage = RibbonIcons.Language32,
            Image = RibbonIcons.Language16,
        };
        _langButton = panel.AddItem(langData) as PushButton;

        ApplyLanguage();
        return Result.Succeeded;
    }

    /// <summary>
    /// Isi ulang label & tooltip tombol sesuai bahasa aktif. Dipanggil saat
    /// startup dan setiap kali bahasa diganti lewat tombol Language.
    /// </summary>
    public static void ApplyLanguage()
    {
        if (_pushButton is not null)
        {
            _pushButton.ItemText = L.T("Push ke\nWebsite", "Push to\nWebsite");
            _pushButton.ToolTip = L.T(
                "Extract data panel & circuit dari model, lalu push ke Supabase "
                + "(website panel schedule). Trigger manual, tidak auto-sync.",
                "Extract panel & circuit data from the model, then push it to Supabase "
                + "(the panel schedule website). Manual trigger, not an auto-sync.");
        }

        if (_pullButton is not null)
        {
            _pullButton.ItemText = L.T("Pull dari\nWebsite", "Pull from\nWebsite");
            _pullButton.ToolTip = L.T(
                "Tarik perubahan breaker & kabel yang diedit di website "
                + "kembali ke circuit di model Revit.",
                "Pull breaker & cable edits made on the website back into the "
                + "circuits in the Revit model.");
        }

        if (_langButton is not null)
        {
            // label menunjukkan bahasa AKTIF, tooltip menjelaskan tujuan klik
            _langButton.ItemText = L.T("Bahasa\nIndonesia", "Language\nEnglish");
            _langButton.ToolTip = L.T(
                "Bahasa add-in: Indonesia. Klik untuk ganti ke English.",
                "Add-in language: English. Click to switch to Bahasa Indonesia.");
        }
    }

    public Result OnShutdown(UIControlledApplication application) => Result.Succeeded;
}
