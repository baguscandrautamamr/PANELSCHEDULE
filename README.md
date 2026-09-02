# Panel Schedule Web

Website realtime panel schedule dari Revit: tabel (format Archetype/Barry Callebaut),
SLD dinamis, dan export Excel / PDF / DXF. UI dua bahasa (Indonesia / English),
begitu juga add-in Revit-nya.

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
   (aman dijalankan ulang; kalau database sudah ada, **jalankan ulang sekali**
   untuk menambah kolom `circuits.source`, `circuits.revit_circuit_number`, dan
   `circuits.phase_lock` — wajib buat add-in versi terbaru, kalau belum maka
   Push/Pull error "column circuits.revit_circuit_number does not exist" dan
   tombol Rebalance Loads gagal menyimpan kunci fase; Push sendiri tetap jalan
   tanpa `phase_lock`, cuma posisi R/S/T kembali mengikuti model)
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
  - kolom fixture **dinamis** dari data (tidak di-hardcode, beda tiap project).
    Urutannya: lighting fixture dulu, lalu electrical fixture (receptacle),
    lalu sisanya; di dalam tiap kelompok urut abjad, **kecuali** varian dari
    family yang sama didudukkan bersebelahan dengan **NORMAL dulu baru
    EMERGENCY** (`DOWNLIGHT 12WATT NORMAL` sebelum `DOWNLIGHT 12WATT
    EMERGENCY`) — kalau murni abjad malah kebalik. Penandanya boleh di nama
    family maupun di type-nya, dan `NON-EMERGENCY` dihitung normal.
  - kolom **NO.** = nomor urut rapat `1..N`. Nomor slot Revit sering loncat
    (…42, 43, 46, 47, 50, 53…) karena circuit multi-pole memakan beberapa slot
    dan ada slot kosong — di schedule cetak yang dipakai nomor urut. Urutannya
    tetap mengikuti panel schedule Revit. Nomor Revit yang asli tersimpan utuh
    (hover kolom NO. untuk melihatnya) dan ikut tampil di FUNCTION.
  - kolom **FUNCTION** = jenis fixture + Circuit Number Revit apa adanya, mis.
    `LIGHTING (D)/4`, `RECEPTACLE (D)/42`. Jenisnya dari kategori Revit family
    yang tersambung — Lighting Fixtures → `LIGHTING`, Electrical Fixtures →
    `RECEPTACLE`, dst; nama family-nya sendiri (`ACT_E_HIGHBAY_BY698P`,
    `ACT_E_RECEPTACLE INDUSTRIAL`) tidak ikut di FUNCTION tapi tetap jadi kolom
    FIXTURE tersendiri. Circuit campuran digabung: `LIGHTING + RECEPTACLE (D)/7`.
  - **watt per unit fixture** diambil add-in dari parameter daya di type/instance
    (`Wattage`, `Watt`, `Daya`, `Power`); kalau tidak ada, dari beban semu
    connector listriknya — parameter *Apparent Load*, atau kalau perlu dibaca
    dari teks **Electrical Data** yang tampil di Properties (`230 V/1-150 VA`
    → 150 VA) — lalu dikali perbandingan watt : VA circuit-nya. Untuk lampu yang
    cos φ-nya 1 di Revit, `150 VA` tetap jadi `150 W` (tidak dikali cos φ panel),
    jadi qty × watt/unit selalu ketemu dengan DEMAND LOAD circuit. Kalau semua
    sumber kosong, kolomnya tetap bisa diisi belakangan di Excel (lihat
    **Export Excel**).
  - demand load per fase **R/S/T** mengikuti fase asli circuit di Revit
    (kolom A/B/C panel schedule Revit), kecuali circuit yang fasenya dikunci
    di website (lihat **Rebalance Loads** di bawah)
  - summary: total qty per fixture, SUB TOTAL R/S/T, TOTAL WATT,
    TOTAL VA (`watt / cos φ`), CONNECTED AMPERE (`VA / (√3 × V L-L)` untuk 3PH;
    voltage `220/380V` dari Revit → yang dipakai V L-L = 380)
- **SLD dinamis (SVG)** dari data yang sama: source panel → incoming cable →
  main breaker → fuse + lampu R/Y/B → bus → breaker per circuit
  (MCB 1P/3P, MCCB 3P, RCBO 2P/4P dibedakan simbolnya)
- Update di Supabase langsung muncul di web (Supabase Realtime)
- **Rebalance Loads + kunci fase** (badge **🔒R/S/T** di kolom NO.): tombol
  ⇅ Rebalance Loads membagi ulang circuit 1 fase ke R/S/T yang totalnya paling
  ringan (greedy, dari watt terbesar; circuit 3 fase tidak diubah), lalu
  **mengunci** fase hasilnya di kolom `circuits.phase_lock`. Push berikutnya
  dari Revit mencocokkan baris lewat `revit_circuit_number` dan menaruh
  **watt terbaru dari model** di fase yang dikunci itu — jadi perubahan beban
  di Revit tetap masuk, tapi posisi R/S/T hasil rebalance tidak lompat lagi.
  Fase yang dipilih manual lewat form ✎ diperlakukan sama. Kunci dilepas lewat
  tombol **🔓 Lepas kunci fase**, dan otomatis lepas kalau circuit-nya berubah
  jadi 2/3 fase, jadi spare, atau nol watt di Revit (bebannya tidak bisa
  ditumpuk ke satu kolom). Nomor circuit Revit yang kembar dalam satu panel
  dilewati — tidak ada cara memastikan kunci itu milik baris yang mana.
  Catatan: **urutan baris** (▲▼) masih web-only dan tetap ditimpa Push.
- **Load manual** (+ Tambah Load, badge **M** di tabel): tidak ditimpa/dihapus
  saat Push dari Revit — kalau nomornya bentrok dengan circuit Revit baru,
  otomatis digeser ke nomor setelah circuit terakhir (isinya tetap).
  Pull from Website juga melewati baris manual (tidak ditulis ke Revit).
- **Export Excel**: header bertingkat (FIXTURE / DEMAND LOAD), garis di semua sel,
  lebar kolom mengikuti isi, dan isinya **formula Excel hidup**:
  - demand load R/S/T per circuit = `SUMPRODUCT(qty fixture × baris WATT / UNIT)`,
    dibagi rata ke fase yang berbeban (mis. ÷3 untuk circuit 3 fase seimbang).
  - baris `WATT / UNIT` diambil dari `circuit_fixtures.watt_per_unit`. Kalau
    kolom itu kosong di database (family Revit tidak punya parameter `Wattage`),
    nilainya **dihitung balik dari demand load** (`lib/fixtureWatt.ts`): tiap
    circuit jadi satu persamaan `Σ(qty × watt/unit) = demand load`, persamaan
    yang menyisakan satu kolom belum diketahui dipecahkan, hasilnya dipakai di
    circuit lain, begitu seterusnya — jadi kolom yang tidak pernah muncul
    sendirian pun tetap dapat angka. Kandidat yang tidak sepakat sengaja
    dibiarkan kosong. Angka hasil hitungan balik dicetak **miring** + dicatat
    di bawah tabel supaya bisa diverifikasi.
  - kolom yang watt-nya **belum ketemu** tetap dapat formula: selnya berisi
    `IF(<masih ada watt kosong>, <angka Revit>, SUMPRODUCT(...))` — jadi selama
    baris `WATT / UNIT` kosong yang tampil angka Revit, dan **begitu watt-nya
    diisi di Excel, demand load + SUB TOTAL + TOTAL WATT/VA + CONNECTED AMPERE
    langsung ikut terhitung**. Angka mati (bukan formula) hanya dipakai kalau
    watt-nya sudah lengkap tapi hasilnya tetap tidak sama dengan angka Revit —
    mis. bebannya bukan dari fixture di tabel ini; jumlah baris seperti itu
    dicatat di bawah tabel.
  - `SUM` per kolom fase, `TOTAL VA = TOTAL WATT / cos φ`,
    `CONNECTED AMPERE = TOTAL VA / (√3 × V)`
  - **sel input berwarna kuning** (`cos φ`, tegangan, baris `WATT / UNIT`) —
    diubah di Excel, semua angka di bawahnya ikut terhitung ulang
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
  hapusnya (circuit muncul lagi dari model). Baris tombstone baru dibersihkan
  dari database setelah transaksi Revit commit, jadi kalau commit gagal niat
  hapusnya tidak hilang.
- **Pull mencocokkan circuit lewat Circuit Number Revit apa adanya** (kolom
  `circuits.revit_circuit_number`), dibandingkan sebagai teks. Prefix panel apa
  pun dari setting Circuit Naming (`(D)/7`, `DB-FG/42`, `L1-7`) ikut kena tanpa
  perlu di-parse.
- **Dual bahasa (Indonesia / English)**: tombol **ID | EN** di bar atas (dan di
  halaman login). Semua teks UI, tooltip, konfirmasi, dan catatan rumus di
  export Excel / DXF ikut bahasa yang dipilih. Header tabel yang bersifat
  teknis (NO., FUNCTION, BREAKER, DEMAND LOAD, TOTAL VA, …) sengaja tetap sama
  di kedua bahasa supaya cetakan schedule konsisten dengan drawing. Pilihan
  disimpan di browser (`localStorage`); kalau belum pernah memilih, ikut bahasa
  browser. Add-in Revit punya tombol **Language** sendiri dengan pasangan teks
  yang sama.

## Roadmap

1. ✅ Schema Supabase + scaffold Next.js + realtime
2. ✅ Rendering tabel & SLD match template drawing + C# add-in "Push to Website"
3. ✅ Export Excel (exceljs) + PDF (print browser)
4. ✅ Export DXF (breaker symbol jadi block)
5. 🔜 RLS Supabase per user (sekarang masih permisif — lihat `supabase/schema.sql`)

## Catatan: error "JWT issued at future"

Kalau website menampilkan **`JWT issued at future`** (`PGRST303`), itu bukan
masalah data atau schema: jam server PostgREST Supabase sedang tertinggal dari
jam server Auth yang menerbitkan token, jadi klaim `iat` token dianggap masih di
masa depan (toleransi bawaan PostgREST 30 detik). Paling sering kena di query
pertama sesudah login, karena penolakannya terjadi di ratusan milidetik pertama
umur token.

Website sekarang mengulang query-nya sendiri dengan jeda bertambah
(`withClockSkewRetry` di `lib/supabase.ts`), jadi umumnya sembuh sendiri.
Sengaja **tidak** memanggil `supabase.auth.refreshSession()` — token baru punya
`iat` yang lebih baru lagi, jadi malah makin jauh di depan jam PostgREST. Kalau
errornya menetap, itu perlu Supabase Support resync NTP instance-nya.

## Struktur

```
app/page.tsx              # list project + panel (realtime)
app/panel/[id]/page.tsx   # detail panel: SLD + tabel (realtime)
components/PanelScheduleTable.tsx
components/PanelSLD.tsx
components/LanguageSwitch.tsx  # tombol ID | EN
lib/i18n.tsx              # dual bahasa: provider + t("teks id", "english text")
lib/supabase.ts           # client Supabase (publishable key)
lib/types.ts
lib/exportExcel.ts        # export .xlsx (exceljs)
lib/dxf.ts                # penulis DXF R12 (tanpa dependensi)
lib/exportDxf.ts          # layout SLD + tabel ke DXF
supabase/schema.sql       # jalankan di SQL Editor
supabase/seed.sql         # data contoh P-011.4
```
