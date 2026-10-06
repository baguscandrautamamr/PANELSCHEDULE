/**
 * Database kabel LV PT KMI Wire and Cable Tbk ada di `data/kmi-lv-cables.json`
 * — disalin dari PDF katalog di folder "CABLE KMI/CABLE LV" (NYY, NYA, NYM,
 * NYFGbY, NYRY, NYBY, NYCY, NYSY): ukuran, OD, berat, resistansi, induktansi,
 * KHA di udara/tanah pada 30 °C, dan arus hubung singkat 1 detik.
 *
 * Panel schedule memakai NYY 3C/4C/5C buat outgoing dan feeder, dan NYA 1C
 * buat pembumian.
 *
 * `ampacity` = "Current-Carrying Capacity at 30 °C, in air" dari katalog.
 * Sengaja memakai angka di UDARA, bukan di tanah, karena kabel panel dipasang
 * di tray/conduit di dalam gedung dan angkanya lebih kecil untuk ukuran-ukuran
 * kecil, jadi pemilihannya aman.
 *
 * `od` = overall diameter (mm) dari katalog — jadi isi kolom OD di schedule dan
 * dipakai buat hitung cable tray.
 */
import kmi from "../data/kmi-lv-cables.json";

/** Satu baris tabel katalog KMI (field yang tidak ada di jenis kabel itu tidak diisi). */
export interface KmiCableRow {
  size: number;
  od: number;
  weight: number;
  rdc20: number;
  rac70: number;
  ampAir: number;
  ampGround?: number;
  ampPipe?: number;
  isc1s: number;
}

/** Semua jenis kabel di database KMI: NYY, NYA, NYM, NYFGbY, NYRY, NYBY, NYCY, NYSY. */
export const KMI_LV_CABLES = kmi.types as unknown as Record<
  string,
  { desc: string; standard: string; voltage: string; cores: Record<string, KmiCableRow[]> }
>;

/** Jumlah inti kabel yang dipakai di panel schedule ini. */
export type CableCores = 3 | 4 | 5;

export interface CableSize {
  /** luas penampang nominal per inti (mm²) */
  size: number;
  /** overall diameter kabel (mm) */
  od: number;
  /** KHA maksimum di udara pada 30 °C (A) */
  ampacity: number;
}

const nyy = (cores: CableCores): CableSize[] =>
  KMI_LV_CABLES.NYY.cores[cores].map((r) => ({ size: r.size, od: r.od, ampacity: r.ampAir }));

export const NYY_CATALOG: Record<CableCores, CableSize[]> = {
  3: nyy(3),
  4: nyy(4),
  5: nyy(5),
};

/** Ukuran NYA 1C yang ada di katalog KMI (1,5-400 mm²). */
export const NYA_SIZES: number[] = KMI_LV_CABLES.NYA.cores[1].map((r) => r.size);

export interface CablePick extends CableSize {
  cores: CableCores;
  /**
   * true kalau di katalog tidak ada ukuran yang KHA-nya cukup buat arus ini —
   * yang dipakai ukuran terbesar yang tersedia dan harus dicek manual
   * (mis. dipecah jadi beberapa kabel paralel).
   */
  undersized: boolean;
}

/**
 * Ukuran kabel terkecil yang KHA-nya masih di ATAS arus proteksi (`current`,
 * biasanya rating breaker — syarat Iz >= In) dan tidak lebih kecil dari ukuran
 * minimum yang diminta jenis bebannya (`minSize`).
 */
export function pickCable(cores: CableCores, current: number, minSize: number): CablePick {
  const list = NYY_CATALOG[cores];
  const allowed = list.filter((s) => s.size >= minSize);
  const fit = allowed.find((s) => s.ampacity >= current);
  const chosen = fit ?? allowed[allowed.length - 1] ?? list[list.length - 1];
  return { ...chosen, cores, undersized: fit == null };
}

/** Angka ukuran kabel seperti di katalog: 2.5 -> "2.5", 4 -> "4". */
export const cableSizeText = (size: number) =>
  Number.isInteger(size) ? String(size) : size.toFixed(1);

/** Nama kabel di kolom TYPE — "NYY 3C x 2.5mm²" (seperti template gambar). */
export const cableText = (cores: CableCores, size: number) =>
  `NYY ${cores}C x ${cableSizeText(size)}mm²`;

/** Isi kolom OD (mm), 1 desimal seperti katalog. */
export const odText = (od: number) => od.toFixed(1);

/**
 * Faktor koreksi kabel multi-core yang dipasang berdampingan (bersentuhan) di
 * satu cable tray berlubang — IEC 60364-5-52 Tabel B.52.20 (metode E).
 * Index = jumlah kabel; di atas 6 pakai angka untuk 6 (0,76) kecuali 9+.
 */
const GROUPING_FACTOR: Record<number, number> = { 1: 1, 2: 0.88, 3: 0.82, 4: 0.79, 5: 0.76, 6: 0.76 };
export const groupingFactor = (runs: number) => GROUPING_FACTOR[runs] ?? 0.73;

/**
 * Ukuran maksimum per kabel buat feeder/incoming paralel. Di atas 240 mm²
 * NYY multi-core (300/400) berat, susah ditekuk & diterminasi ke MCCB, dan
 * katalog KMI cuma menyediakannya "on available length".
 */
export const FEEDER_MAX_SIZE = 240;
const FEEDER_MAX_RUNS = 8;

export interface FeederPick extends CablePick {
  /** jumlah kabel paralel per fase (1 = kabel tunggal) */
  runs: number;
  /** faktor grouping yang dipakai buat kabel paralel */
  factor: number;
  /** KHA total terkoreksi = runs x ampacity x factor (A) */
  capacity: number;
}

/**
 * Kabel incoming/feeder: satu kabel NYY kalau ada ukuran <= 240 mm² yang
 * KHA-nya cukup; kalau tidak, dipecah jadi beberapa kabel paralel ukuran sama
 * dengan KHA dikoreksi faktor grouping — jumlah kabel paling sedikit, lalu
 * ukuran terkecil yang memenuhi n x KHA x faktor >= `current`.
 */
export function pickFeeder(cores: CableCores, current: number, minSize: number): FeederPick {
  const list = NYY_CATALOG[cores].filter((s) => s.size >= minSize && s.size <= FEEDER_MAX_SIZE);
  for (let runs = 1; runs <= FEEDER_MAX_RUNS; runs++) {
    const factor = groupingFactor(runs);
    const fit = list.find((s) => runs * s.ampacity * factor >= current);
    if (fit) {
      return { ...fit, cores, undersized: false, runs, factor, capacity: runs * fit.ampacity * factor };
    }
  }
  const last = list[list.length - 1];
  const factor = groupingFactor(FEEDER_MAX_RUNS);
  return {
    ...last,
    cores,
    undersized: true,
    runs: FEEDER_MAX_RUNS,
    factor,
    capacity: FEEDER_MAX_RUNS * last.ampacity * factor,
  };
}
