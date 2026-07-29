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
