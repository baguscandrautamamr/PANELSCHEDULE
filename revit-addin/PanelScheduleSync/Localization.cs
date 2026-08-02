using System.IO;
using Autodesk.Revit.ApplicationServices;

namespace PanelScheduleSync;

public enum AppLang
{
    Id,
    En,
}

/// <summary>
/// Dual bahasa add-in: Indonesia / English. Semua teks ditulis berpasangan
/// di tempat pemakaiannya lewat <see cref="T"/> supaya tidak ada tabel key
/// terpisah yang gampang ketinggalan saat teksnya berubah.
///
/// Pilihan bahasa disimpan per-user di %APPDATA% supaya tetap sama setiap
/// Revit dibuka. Kalau belum pernah dipilih, ikut bahasa Revit-nya.
/// </summary>
public static class L
{
    private static readonly string SettingsPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "PanelScheduleSync",
        "language.txt");

    private static AppLang _lang;
    private static bool _explicitlyChosen;

    static L()
    {
        AppLang? saved = ReadSaved();
        _lang = saved ?? AppLang.Id;
        _explicitlyChosen = saved is not null;
    }

    public static AppLang Lang => _lang;

    public static bool IsEnglish => _lang == AppLang.En;

    /// <summary>Teks Indonesia / English sesuai bahasa aktif.</summary>
    public static string T(string id, string en) => IsEnglish ? en : id;

    /// <summary>Judul dialog — sama di kedua bahasa, dipakai di banyak tempat.</summary>
    public const string DialogTitle = "Panel Schedule Sync";

    /// <summary>
    /// Default bahasa dari Revit (dipakai hanya kalau user belum pernah
    /// menekan tombol ganti bahasa). Revit berbahasa Indonesia tidak ada,
    /// jadi patokannya: Revit English -> English, selainnya tetap Indonesia.
    /// </summary>
    public static void InitDefaultFromRevit(LanguageType revitLanguage)
    {
        if (_explicitlyChosen) return;
        _lang = revitLanguage is LanguageType.English_USA or LanguageType.English_GB
            ? AppLang.En
            : AppLang.Id;
    }

    public static void Set(AppLang lang)
    {
        _lang = lang;
        _explicitlyChosen = true;
        Save();
    }

    public static void Toggle() => Set(IsEnglish ? AppLang.Id : AppLang.En);

    private static AppLang? ReadSaved()
    {
        try
        {
            if (!File.Exists(SettingsPath)) return null;
            string value = File.ReadAllText(SettingsPath).Trim();
            return value.Equals("en", StringComparison.OrdinalIgnoreCase) ? AppLang.En
                : value.Equals("id", StringComparison.OrdinalIgnoreCase) ? AppLang.Id
                : null;
        }
        catch
        {
            return null; // folder tidak bisa dibaca — pakai default saja
        }
    }

    private static void Save()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(SettingsPath)!);
            File.WriteAllText(SettingsPath, IsEnglish ? "en" : "id");
        }
        catch
        {
            // gagal simpan (mis. profil read-only) — pilihan tetap berlaku
            // untuk sesi Revit ini saja
        }
    }
}
