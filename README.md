# Panel Schedule Web

Website realtime panel schedule dari Revit: tabel (format Archetype/Barry Callebaut),
SLD dinamis, dan export Excel / PDF / DXF.

**Alur data:**

```
Revit (grouped circuits) -> C# add-in "Push to Website" (manual)
   -> Supabase (Postgres + Realtime)
   -> Next.js di Vercel (subscribe realtime)
   -> Export Excel / PDF / DXF
```

## Stack

- **Frontend**: Next.js (App Router) + Tailwind, deploy di **Vercel**
- **Database**: Supabase (project `ptkhwoabeclqbfemxgnj`) + Realtime
- **Revit bridge**: C# add-in Revit 2023 (.NET Framework 4.8) & 2025 (.NET 8)

## Setup (sekali saja)

### 1. Supabase

Buka [SQL Editor](https://supabase.com/dashboard/project/ptkhwoabeclqbfemxgnj/sql/new), lalu jalankan:

1. `supabase/schema.sql` — bikin tabel + RLS + realtime publication
   (aman dijalankan ulang; kalau database sudah ada, jalankan ulang sekali
   untuk menambah kolom `circuits.source` — wajib buat add-in versi terbaru)
2. `supabase/seed.sql` — data contoh panel **P-011.4 LDB PRODUCTION 1st** (opsional tapi disarankan, biar website langsung ada isinya)

### 2. Vercel

1. Buka [vercel.com/new](https://vercel.com/new), import repo GitHub `baguscandrautamamr/PANELSCHEDULE`
2. Framework auto-detect **Next.js**, langsung **Deploy** — tidak ada env var wajib
   (URL + publishable key Supabase sudah ada default di `lib/supabase.ts`;
   bisa dioverride via `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

### 3. Jalankan lokal

```bash
npm install
npm run dev   # http://localhost:3000
```

## Fitur sekarang (Fase 1 + sebagian Fase 2)

- List project & panel (realtime)
- Halaman panel: **tabel schedule** dengan
  - kolom fixture **dinamis** dari data (tidak di-hardcode, beda tiap project)
  - nomor & urutan baris sama dengan panel schedule Revit (nomor circuit Revit
    dipakai apa adanya, termasuk yang berprefix seperti `(D)/7`)
  - demand load per fase **R/S/T** mengikuti fase asli circuit di Revit
    (kolom A/B/C panel schedule Revit)
  - summary: total qty per fixture, SUB TOTAL R/S/T, TOTAL WATT,
    TOTAL VA (`watt / cos φ`), CONNECTED AMPERE (`VA / (√3 × V L-L)` untuk 3PH;
    voltage `220/380V` dari Revit → yang dipakai V L-L = 380)
- **SLD dinamis (SVG)** dari data yang sama: source panel → incoming cable →
  main breaker → fuse + lampu R/Y/B → bus → breaker per circuit
  (MCB 1P/3P, MCCB 3P, RCBO 2P/4P dibedakan simbolnya)
- Update di Supabase langsung muncul di web (Supabase Realtime)
- **Load manual** (+ Tambah Load, badge **M** di tabel): tidak ditimpa/dihapus
  saat Push dari Revit — kalau nomornya bentrok dengan circuit Revit baru,
  otomatis digeser ke nomor setelah circuit terakhir (isinya tetap).
  Pull from Website juga melewati baris manual (tidak ditulis ke Revit).
- **Export CAD (DXF)**: satu file DXF R12 berisi SLD + tabel schedule lengkap,
  skala **1:1 dalam milimeter**, siap dibuka di AutoCAD / BricsCAD / DraftSight /
  LibreCAD atau di-import ke Revit. Simbol breaker jadi **block** (`BRK_MCB_1P`,
  `BRK_MCCB_3P`, `BRK_RCBO_2P`, … sesuai jenis + jumlah pole yang benar-benar
  dipakai) supaya bisa diganti/dihitung massal di CAD, dan tiap jenis garis
  punya layer sendiri: `PS-SLD`, `PS-BREAKER`, `PS-TABLE-GRID`, `PS-TEXT`,
  `PS-SUMMARY`, `PS-TITLE`, `PS-FRAME`.
- **Hapus circuit dari web** (🗑 di mode edit): load manual langsung terhapus
  dan nomor manual lain naik mengisi celah; circuit Revit ditandai hapus
  (tombstone `circuit_no` negatif) lalu di-**disconnect dari panel** saat
  Pull from Website dijalankan di Revit — Push sebelum Pull membatalkan
  hapusnya (circuit muncul lagi dari model).

## Roadmap

1. ✅ Schema Supabase + scaffold Next.js + realtime
2. ✅ Rendering tabel & SLD match template drawing + C# add-in "Push to Website"
3. ✅ Export Excel (exceljs) + PDF (print browser)
4. ✅ Export DXF (breaker symbol jadi block)
5. 🔜 RLS Supabase per user (sekarang masih permisif — lihat `supabase/schema.sql`)

## Struktur

```
app/page.tsx              # list project + panel (realtime)
app/panel/[id]/page.tsx   # detail panel: SLD + tabel (realtime)
components/PanelScheduleTable.tsx
components/PanelSLD.tsx
lib/supabase.ts           # client Supabase (publishable key)
lib/types.ts
lib/exportExcel.ts        # export .xlsx (exceljs)
lib/dxf.ts                # penulis DXF R12 (tanpa dependensi)
lib/exportDxf.ts          # layout SLD + tabel ke DXF
supabase/schema.sql       # jalankan di SQL Editor
supabase/seed.sql         # data contoh P-011.4
```
