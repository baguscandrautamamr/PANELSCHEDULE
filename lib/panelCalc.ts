import type { Panel } from "./types";

/** Panel 3 fase? (dari kolom phase, mis. "3PH") */
export function is3Phase(panel: Panel): boolean {
  return (panel.phase ?? "3PH").toUpperCase().includes("3");
}

/**
 * Tegangan (volt) yang dipakai buat hitung CONNECTED AMPERE.
 * Kolom voltage bisa berisi satu angka ("380V") atau L-N/L-L seperti tampilan
 * "Volts" di Revit ("220/380V") — 3 fase pakai tegangan antar fase (L-L, angka
 * terbesar), 1 fase pakai L-N (angka terkecil). Default 400V / 230V.
 */
export function panelVoltage(panel: Panel): number {
  const three = is3Phase(panel);
  const nums = (panel.voltage ?? "")
    .match(/\d+(?:[.,]\d+)?/g)
    ?.map((v) => parseFloat(v.replace(",", ".")))
    .filter((v) => v > 0);

  if (!nums || nums.length === 0) return three ? 400 : 230;
  return three ? Math.max(...nums) : Math.min(...nums);
}

/** cos φ standar desain instalasi, dipakai kalau panel tidak punya nilai sendiri. */
export const DEFAULT_POWER_FACTOR = 0.8;

/**
 * cos φ yang dipakai buat hitung TOTAL VA & CONNECTED AMPERE.
 *
 * Revit banyak mengirim cos φ = 1 (True Load = Apparent Load, karena family-nya
 * tidak mengisi power factor). cos φ = 1 bukan asumsi desain yang valid — VA
 * jadi sama persis dengan watt — jadi nilai itu diperlakukan sebagai "tidak ada
 * data" dan diganti 0.8. Nilai power factor yang benar-benar terisi dari Revit
 * (0 < cos φ < 1) tetap dipakai apa adanya.
 */
export function panelPowerFactor(panel: Panel): number {
  const pf = Number(panel.power_factor);
  return Number.isFinite(pf) && pf > 0 && pf < 1 ? pf : DEFAULT_POWER_FACTOR;
}
