# Panel Schedule Web

Website realtime panel schedule dari Revit: tabel (format Archetype/Barry Callebaut),
SLD dinamis, dan (nanti) export Excel / PDF / DXF.

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
- **Revit bridge**: C# add-in Revit 2025 (fase berikutnya)

## Setup (sekali saja)

### 1. Supabase

Buka [SQL Editor](https://supabase.com/dashboard/project/ptkhwoabeclqbfemxgnj/sql/new), lalu jalankan:

1. `supabase/schema.sql` — bikin tabel + RLS + realtime publication
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
  - demand load per fase **R/S/T** (1PH isi satu kolom, 3PH balance)
  - summary: total qty per fixture, SUB TOTAL R/S/T, TOTAL WATT,
    TOTAL VA (`watt / cos φ`), CONNECTED AMPERE (`VA / (√3 × V)` untuk 3PH)
- **SLD dinamis (SVG)** dari data yang sama: source panel → incoming cable →
  main breaker → fuse + lampu R/Y/B → bus → breaker per circuit
  (MCB 1P/3P, MCCB 3P, RCBO 2P/4P dibedakan simbolnya)
- Update di Supabase langsung muncul di web (Supabase Realtime)

## Roadmap

1. ✅ Schema Supabase + scaffold Next.js + realtime
2. 🔜 Rendering tabel & SLD match 1:1 template drawing + C# add-in "Push to Website"
3. 🔜 Export Excel (exceljs) + PDF
4. 🔜 Export DXF (breaker symbol jadi block)

## Struktur

```
app/page.tsx              # list project + panel (realtime)
app/panel/[id]/page.tsx   # detail panel: SLD + tabel (realtime)
components/PanelScheduleTable.tsx
components/PanelSLD.tsx
lib/supabase.ts           # client Supabase (publishable key)
lib/types.ts
supabase/schema.sql       # jalankan di SQL Editor
supabase/seed.sql         # data contoh P-011.4
```
