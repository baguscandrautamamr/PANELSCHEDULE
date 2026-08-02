# Panel Schedule Sync — Revit Add-in (Revit 2023 & 2025)

Tombol **"Push to Website"** di ribbon tab **Panel Schedule**: extract data panel +
circuit dari model, lalu push ke Supabase → langsung muncul realtime di website.
UI add-in dua bahasa (Indonesia / English), bisa diganti lewat tombol
**Language** di ribbon.

## Download build

Build otomatis di GitHub Actions (workflow **Build Revit Add-in**):
repo → tab **Actions** → run terbaru → download artifact sesuai versi Revit:

- **PanelScheduleSync-Revit2025** (.NET 8)
- **PanelScheduleSync-Revit2023** (.NET Framework 4.8 — berisi beberapa DLL
  tambahan seperti `System.Text.Json.dll`, semuanya wajib ikut di-copy)

## Install

Extract artifact, lalu copy ke folder addins sesuai versi Revit
(`2023` atau `2025`):

```
%AppData%\Autodesk\Revit\Addins\<versi>\
├── PanelScheduleSync.addin
└── PanelScheduleSync\
    ├── PanelScheduleSync.dll
    └── (DLL lain dari artifact — khusus build 2023)
```

Buka Revit → tab **Panel Schedule** (tiap tombol punya icon sendiri: panel +
panah keluar / masuk, dan globe untuk bahasa):

- **Push to Website** — extract & kirim data panel ke Supabase (pilih project
  tujuan di dialog; FUNCTION diisi dari family Revit yang terhubung di circuit).
- **Pull from Website** — tarik perubahan breaker & kabel yang diedit di
  website kembali ke model (rating circuit, param "Breaker Type" / "Wire Size"
  kalau ada dan tidak read-only).
- **Language / Bahasa** — ganti bahasa add-in **Indonesia ⇄ English**. Label
  tombol, tooltip, dialog, dan laporan hasil Push/Pull ikut berubah saat itu
  juga. Pilihan disimpan di `%AppData%\PanelScheduleSync\language.txt`, jadi
  tetap sama saat Revit dibuka lagi. Kalau belum pernah dipilih, add-in ikut
  bahasa Revit-nya (Revit English → English, selainnya Indonesia).

Icon ribbon digambar sebagai vektor di `RibbonIcons.cs` lalu dirender ke 32px
(tombol besar) dan 16px (tombol kecil) — tidak ada file PNG yang perlu ikut
di-copy saat install.

## Cara kerja

1. Collect semua Electrical Equipment yang punya assigned circuits (= panel).
2. Per panel: baca supply circuit (source panel, main breaker, incoming cable,
   fase/wire dari jumlah pole-nya) dan semua circuit (nomor, load name, rating,
   poles, true load) — diurutkan per nomor circuit seperti panel schedule Revit.
3. Nomor circuit dibaca apa adanya dari Revit, termasuk yang pakai prefix panel
   (`(D)/7`, `DB-FG/7` — tergantung setting Circuit Naming) dan multi-pole
   (`1,3,5` → nomor slot pertama = 1). Nomor di web = nomor di Revit, jadi
   urutan barisnya ikut sama.
4. Fixture per circuit di-group per **family + type** Revit (kolom dinamis di web).
5. Fase R/S/T diambil dari beban per fase circuit itu di Revit (Apparent Load
   Phase A/B/C) — sama dengan kolom A/B/C di panel schedule Revit. Kalau
   parameternya tidak ada: 3P dibagi rata, 1P/2P aproksimasi dari nomor slot.
6. Voltage (`220/380V`) dan cos φ (Σ True Load / Σ Apparent Load) diambil dari
   model, bukan default `400V` / `0.8`, supaya TOTAL VA & AMPERE sama dengan Revit.
7. Push ke Supabase REST: upsert project + panel, replace circuits + fixtures.

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
- IP rating / symbol tag / fuse dari parameter panel
- Pilih panel tertentu saja sebelum push (sekarang push semua)
