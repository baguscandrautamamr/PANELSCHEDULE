# Panel Schedule Sync — Revit Add-in (Revit 2025)

Tombol **"Push to Website"** di ribbon tab **Panel Schedule**: extract data panel +
circuit dari model, lalu push ke Supabase → langsung muncul realtime di website.

## Download build

Build otomatis di GitHub Actions (workflow **Build Revit Add-in**):
repo → tab **Actions** → run terbaru → download artifact **PanelScheduleSync-Revit2025**.

## Install

Extract artifact, lalu copy ke folder addins Revit 2025:

```
%AppData%\Autodesk\Revit\Addins\2025\
├── PanelScheduleSync.addin
└── PanelScheduleSync\
    └── PanelScheduleSync.dll
```

Buka Revit → tab **Panel Schedule** → **Push to Website**.

## Cara kerja

1. Collect semua Electrical Equipment yang punya assigned circuits (= panel).
2. Per panel: baca supply circuit (source panel, main breaker, incoming cable)
   dan semua circuit (nomor, load name, rating, poles, true load).
3. Fixture per circuit di-group per **family + type** Revit (kolom dinamis di web).
4. Balancing: 3P = load dibagi rata R/S/T; 1P/2P = satu fase
   (aproksimasi dari nomor circuit — bisa disesuaikan).
5. Push ke Supabase REST: upsert project + panel, replace circuits + fixtures.

## Konfigurasi (opsional)

Default sudah menunjuk ke project Supabase yang benar. Untuk override, buat
`PanelScheduleSync.config.json` di sebelah DLL:

```json
{ "url": "https://xxxx.supabase.co", "key": "sb_publishable_xxxx" }
```

## Build lokal (opsional)

```bash
dotnet build revit-addin/PanelScheduleSync/PanelScheduleSync.csproj -c Release
```

Tidak butuh Revit terinstall — referensi API pakai package NuGet
`Nice3point.Revit.Api.*` (2025).

## TODO berikutnya

- Baca breaker type RCBO/MCCB dari shared parameter (sekarang default `MCB {poles}P`)
- Fase R/S/T presisi dari slot panel (sekarang aproksimasi nomor circuit)
- IP rating / symbol tag / fuse dari parameter panel
- Pilih panel tertentu saja sebelum push (sekarang push semua)
