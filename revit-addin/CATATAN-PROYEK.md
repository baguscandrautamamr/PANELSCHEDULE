# Catatan Proyek — Panel Schedule Sync (Revit ⇄ Website)

Catatan kerja untuk add-in Revit + website panel schedule. Dokumen ini untuk
pegangan internal: keputusan desain, parameter Revit yang dipakai, dan aturan
sinkronisasi. Cara install/pakai ada di [README.md](README.md).

## Gambaran besar

Panel schedule (format Archetype/Barry Callebaut) dikelola dua arah:

```
Revit (grouped circuits)
   │  Push to Website (manual, per klik)
   ▼
Supabase (Postgres + Realtime, project ptkhwoabeclqbfemxgnj)
   │  Realtime subscribe
   ▼
Next.js di Vercel — tabel schedule + SLD dinamis + export Excel/PDF
   │  Pull from Website (manual, per klik)
   ▼
Revit (rating breaker, wire size, disconnect circuit yang dihapus di web)
```

Semua sinkronisasi **manual** (tombol di ribbon), tidak ada auto-sync —
sengaja, supaya engineer pegang kendali kapan model dianggap "sumber
kebenaran" dan kapan website.

## Komponen add-in

| File | Peran |
|---|---|
| `App.cs` | Ribbon tab **Panel Schedule** → panel **Sync**, tombol Push/Pull + icon (PNG embedded di `Resources/`) |
| `PushCommand.cs` | Extract semua panel → upsert ke Supabase |
| `PullCommand.cs` | Baca perubahan dari Supabase → tulis balik ke circuit Revit |
| `PanelExtractor.cs` | Logika baca model: panel, supply circuit, circuits, fixtures, balancing fase |
| `SupabaseClient.cs` | REST client Supabase (publishable key, bisa dioverride via `PanelScheduleSync.config.json`) |
| `Models.cs` | DTO JSON (match skema tabel Supabase) |
| `ProjectPickerWindow.cs` | Dialog WPF pilih project tujuan saat Push |

Icon ribbon: `Resources/push{16,32}.png` dan `pull{16,32}.png`, di-embed
sebagai `EmbeddedResource` (ikut di dalam DLL, tidak perlu file lepas).

## Parameter Revit yang dipakai

**Dibaca saat Push:**

- `RBS_ELEC_PANEL_NAME` — kode panel (fallback: nama element); juga untuk teks `FROM <source panel>`
- `MCB Rating` (lookup di Electrical Equipment) — rating main breaker
- `Wire Size` (lookup di supply circuit) — incoming cable; di circuit cabang → outgoing cable
- `Breaker Type` (lookup di circuit) — kalau tidak ada, default `MCB {poles}P`
- `RBS_ELEC_TRUE_LOAD` (Watt) — fallback `RBS_ELEC_APPARENT_LOAD × cos φ`

**Ditulis saat Pull:**

- `RBS_ELEC_CIRCUIT_RATING_PARAM` — rating breaker dari web
- `Breaker Type` / `Wire Size` — hanya kalau parameternya ada dan tidak read-only

## Skema Supabase

Empat tabel: `projects` → `panels` → `circuits` → `circuit_fixtures`.
RLS aktif + realtime publication. Jalankan `supabase/schema.sql` di SQL Editor
(idempotent — aman diulang; migrasi kolom `circuits.source` ikut di dalamnya).

## Aturan sinkronisasi (penting!)

- **Load manual** (dibuat di website, `source = 'manual'`): tidak pernah
  ditimpa/dihapus oleh Push. Kalau nomornya bentrok dengan circuit Revit baru,
  digeser otomatis ke setelah circuit terakhir. Pull juga melewatinya
  (tidak ditulis ke Revit).
- **Hapus circuit dari web**: circuit Revit tidak langsung hilang — ditandai
  **tombstone** (`circuit_no` negatif). Baru benar-benar di-disconnect dari
  panel saat Pull dijalankan di Revit. Push sebelum Pull membatalkan hapusnya.
- **Balancing fase**: 3P dibagi rata R/S/T; 1P/2P masuk satu fase,
  ditentukan dari aproksimasi nomor circuit (belum baca slot panel asli).
- Fixture per circuit di-group per **family + type** → jadi kolom dinamis
  di tabel website (beda project bisa beda kolom).

## Build & distribusi

- Multi-target: `net48` (Revit 2023) + `net8.0-windows` (Revit 2025).
- Referensi API pakai NuGet `Nice3point.Revit.Api.*` → bisa build tanpa
  Revit terinstall (termasuk di CI Linux/Windows).
- CI: workflow **Build Revit Add-in** (`.github/workflows/build-addin.yml`)
  → artifact `PanelScheduleSync-Revit2025` dan `PanelScheduleSync-Revit2023`.
  Build 2023 wajib menyertakan DLL dependensi (`System.Text.Json.dll` dkk).
- Install: copy ke `%AppData%\Autodesk\Revit\Addins\<versi>\` (detail di README).

## Keputusan desain

- **Publishable key di repo** — key Supabase yang dipakai memang tipe
  publishable/anon (aman untuk client); akses data dijaga RLS, bukan key.
- **Push = replace circuits + fixtures** per panel (kecuali baris manual) —
  lebih sederhana dan deterministik daripada diff per field.
- **Tidak ada auto-sync / DocumentChanged listener** — menghindari push
  setengah jadi saat model masih diedit.

## TODO / ide berikutnya

- Baca breaker type RCBO/MCCB dari shared parameter (sekarang default `MCB {poles}P`)
- Fase R/S/T presisi dari slot panel (sekarang aproksimasi nomor circuit)
- IP rating / symbol tag / fuse dari parameter panel
- Pilih panel tertentu saja sebelum Push (sekarang push semua)
- Export DXF dari website (breaker symbol jadi block)
