/**
 * Katalog kabel NYY 0,6/1 kV — PT KMI Wire and Cable Tbk, standar IEC 60502-1
 * (lembar data 14233-03 / 14233-04 / 14233-05 Rev. 2.0 / 2009). Yang dipakai
 * hanya NYY 3C, 4C, dan 5C — inti tunggal (1C) tidak dipakai buat outgoing
 * circuit panel.
 *
 * `ampacity` = "Current-Carrying Capacity at 30 °C, in air" dari katalog.
 * Sengaja memakai angka di UDARA, bukan di tanah, karena kabel outgoing panel
 * dipasang di tray/conduit di dalam gedung dan angkanya lebih kecil untuk
 * ukuran-ukuran kecil, jadi pemilihannya aman.
 *
 * `od` = overall diameter (mm) dari katalog — jadi isi kolom OD di schedule dan
 * dipakai buat hitung cable tray.
 */

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

/** NYY 3 x (1,5-400) mm² — 14233-03 */
const NYY_3C: CableSize[] = [
  { size: 1.5, od: 13.0, ampacity: 19 },
  { size: 2.5, od: 14.0, ampacity: 26 },
  { size: 4, od: 16.1, ampacity: 34 },
  { size: 6, od: 17.3, ampacity: 44 },
  { size: 10, od: 19.4, ampacity: 60 },
  { size: 16, od: 22.0, ampacity: 79 },
  { size: 25, od: 25.0, ampacity: 105 },
  { size: 35, od: 27.5, ampacity: 129 },
  { size: 50, od: 30.0, ampacity: 162 },
  { size: 70, od: 34.0, ampacity: 203 },
  { size: 95, od: 38.5, ampacity: 250 },
  { size: 120, od: 41.5, ampacity: 289 },
  { size: 150, od: 46.0, ampacity: 330 },
  { size: 185, od: 50.5, ampacity: 381 },
  { size: 240, od: 57.0, ampacity: 451 },
  { size: 300, od: 62.5, ampacity: 517 },
  { size: 400, od: 69.0, ampacity: 594 },
];

/** NYY 4 x (1,5-400) mm² — 14233-04 */
const NYY_4C: CableSize[] = [
  { size: 1.5, od: 13.8, ampacity: 22 },
  { size: 2.5, od: 15.0, ampacity: 29 },
  { size: 4, od: 17.3, ampacity: 39 },
  { size: 6, od: 18.7, ampacity: 50 },
  { size: 10, od: 21.5, ampacity: 68 },
  { size: 16, od: 23.5, ampacity: 90 },
  { size: 25, od: 27.5, ampacity: 121 },
  { size: 35, od: 30.0, ampacity: 149 },
  { size: 50, od: 35.5, ampacity: 173 },
  { size: 70, od: 39.0, ampacity: 215 },
  { size: 95, od: 44.5, ampacity: 266 },
  { size: 120, od: 48.5, ampacity: 308 },
  { size: 150, od: 54.5, ampacity: 357 },
  { size: 185, od: 59.0, ampacity: 405 },
  { size: 240, od: 66.0, ampacity: 482 },
  { size: 300, od: 72.5, ampacity: 552 },
  { size: 400, od: 82.5, ampacity: 643 },
];

/** NYY 5 x (1,5-50) mm² — 14233-05 (katalog KMI berhenti di 50 mm²) */
const NYY_5C: CableSize[] = [
  { size: 1.5, od: 14.8, ampacity: 23 },
  { size: 2.5, od: 16.0, ampacity: 30 },
  { size: 4, od: 18.7, ampacity: 41 },
  { size: 6, od: 20.5, ampacity: 52 },
  { size: 10, od: 23.0, ampacity: 71 },
  { size: 16, od: 26.0, ampacity: 94 },
  { size: 25, od: 30.0, ampacity: 126 },
  { size: 35, od: 33.0, ampacity: 155 },
  { size: 50, od: 38.0, ampacity: 189 },
];

export const NYY_CATALOG: Record<CableCores, CableSize[]> = {
  3: NYY_3C,
  4: NYY_4C,
  5: NYY_5C,
};

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

/** Nama kabel di kolom TYPE — "NYY 3C x 2.5mm2". */
export const cableText = (cores: CableCores, size: number) =>
  `NYY ${cores}C x ${cableSizeText(size)}mm2`;

/** Isi kolom OD (mm), 1 desimal seperti katalog. */
export const odText = (od: number) => od.toFixed(1);
