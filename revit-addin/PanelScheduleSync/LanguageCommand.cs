using Autodesk.Revit.Attributes;
// ElementSet (parameter IExternalCommand.Execute) ada di namespace ini —
// tanpa using-nya build gagal CS0246 + CS0535.
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace PanelScheduleSync;

/// <summary>Tombol "Language": ganti bahasa add-in Indonesia &lt;-&gt; English.</summary>
[Transaction(TransactionMode.ReadOnly)]
public class LanguageCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
    {
        L.Toggle();
        App.ApplyLanguage();

        TaskDialog.Show(
            L.DialogTitle,
            L.T(
                "Bahasa add-in diganti ke Indonesia. Pilihan ini tersimpan untuk "
                + "Revit berikutnya.",
                "Add-in language switched to English. This choice is remembered the "
                + "next time Revit starts."));
        return Result.Succeeded;
    }
}
