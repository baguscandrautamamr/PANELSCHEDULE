import type { Panel } from "./types";

/** Panel 3 fase? (dari kolom phase, mis. "3PH") */
export function is3Phase(panel: Panel): boolean {
  return (panel.phase ?? "3PH").toUpperCase().includes("3");
}

/** Angka tegangan di kolom voltage ("220/380V" -> [220, 380]). */
function voltageNumbers(panel: Panel): number[] {
  return (
    (panel.voltage ?? "")
      .match(/\d+(?:[.,]\d+)?/g)
      ?.map((v) => parseFloat(v.replace(",", ".")))
      .filter((v) => v > 0) ?? []
  );
}

/** Tegangan L-N standar, buat membulatkan hasil L-L / akar 3 (219,4 -> 220). */
const STANDARD_LN = [110, 115, 120, 127, 208, 220, 230, 240, 277];

/**
 * Tegangan (volt) yang dipakai buat hitung CONNECTED AMPERE.
 * Kolom voltage bisa berisi satu angka ("380V") atau L-N/L-L seperti tampilan
 * "Volts" di Revit ("220/380V") — 3 fase pakai tegangan antar fase (L-L, angka
 * terbesar), 1 fase pakai L-N (angka terkecil). Default 400V / 230V.
 */
export function panelVoltage(panel: Panel): number {
  const three = is3Phase(panel);
  const nums = voltageNumbers(panel);

  if (nums.length === 0) return three ? 400 : 230;
  return three ? Math.max(...nums) : Math.min(...nums);
}

/**
 * Tegangan fase-netral (L-N) — dipakai buat ampere circuit 1 fase.
 * "220/380V" -> 220. Kalau panel 3 fase cuma menyebut satu angka ("380V"),
 * L-N diturunkan dari L-L / akar 3 lalu dibulatkan ke tegangan standar
 * terdekat (380 / 1,732 = 219,4 -> 220).
 */
export function panelVoltageLN(panel: Panel): number {
  const nums = voltageNumbers(panel);
  if (nums.length === 0) return 230;

  const min = Math.min(...nums);
  if (!is3Phase(panel) || min < Math.max(...nums)) return min;

  const derived = min / Math.sqrt(3);
  const near = STANDARD_LN.find((v) => Math.abs(v - derived) / derived <= 0.03);
  return near ?? Math.round(derived);
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

/** Beban R/S/T satu circuit — dipakai hitung ampere per circuit. */
interface PhaseLoads {
  phase_r: number;
  phase_s: number;
  phase_t: number;
}

/** Jumlah fase yang benar-benar berbeban di satu circuit (0-3). */
export function energizedPhases(c: PhaseLoads): number {
  return [c.phase_r, c.phase_s, c.phase_t].filter((v) => Number(v) > 0).length;
}

/**
 * Ampere satu circuit, dihitung dari beban R/S/T yang sudah ada:
 *
 *   1 fase : I = W / V(L-N)
 *   2 fase : I = W / (cos phi x V(L-L))
 *   3 fase : I = W / (cos phi x akar3 x V(L-L))
 *
 * null kalau circuit-nya tidak berbeban. Panel 1 fase selalu memakai rumus
 * 1 fase karena tidak punya tegangan antar fase.
 */
export function circuitAmpere(panel: Panel, c: PhaseLoads): number | null {
  const watt = (Number(c.phase_r) || 0) + (Number(c.phase_s) || 0) + (Number(c.phase_t) || 0);
  if (watt <= 0) return null;

  const phases = is3Phase(panel) ? energizedPhases(c) : 1;
  const pf = panelPowerFactor(panel);
  const vLL = panelVoltage(panel);

  if (phases >= 3) return watt / (pf * Math.sqrt(3) * vLL);
  if (phases === 2) return watt / (pf * vLL);
  return watt / panelVoltageLN(panel);
}

/**
 * Rating breaker yang lazim dipakai (A) — MCB lighting/receptacle sampai MCCB
 * feeder. Jadi pilihan di kolom "BREAKER SELECTION".
 */
export const BREAKER_RATINGS = [10, 16, 20, 25, 35, 40, 50, 63, 80, 100, 125, 160, 200];

/**
 * Rating breaker terdekat yang masih di ATAS arus circuit — breaker tidak boleh
 * lebih kecil dari bebannya. null kalau tidak berbeban atau arusnya melampaui
 * rating terbesar di daftar (perlu breaker khusus, jangan ditebak).
 */
export function suggestBreaker(ampere: number | null): number | null {
  if (ampere == null || ampere <= 0) return null;
  return BREAKER_RATINGS.find((r) => r >= ampere) ?? null;
}

/** Teks kolom breaker selection: "16A", "> 200A", atau kosong. */
export function suggestBreakerText(ampere: number | null): string {
  if (ampere == null || ampere <= 0) return "";
  const rating = suggestBreaker(ampere);
  return rating != null ? `${rating}A` : `> ${BREAKER_RATINGS[BREAKER_RATINGS.length - 1]}A`;
}
