import type { Circuit } from "./types";
import { fixtureKey } from "./types";

/** Sumber angka WATT / UNIT satu kolom fixture. */
export type WattSource =
  /** dari kolom watt_per_unit (parameter Revit) */
  | "data"
  /** dihitung balik dari demand load circuit */
  | "derived";

export interface FixtureWatts {
  /** watt/unit per kolom (index sama dengan `cols`), null = belum diketahui */
  watt: (number | null)[];
  source: (WattSource | null)[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Toleransi beda angka: 1% atau 0,5 W, mana yang lebih besar. */
const tol = (v: number) => Math.max(0.5, Math.abs(v) * 0.01);

/** Demand load satu circuit menurut Revit (R + S + T). */
export const circuitWatt = (c: Circuit) =>
  (Number(c.phase_r) || 0) + (Number(c.phase_s) || 0) + (Number(c.phase_t) || 0);

/** Jumlah unit satu kolom fixture di satu circuit. */
export const fixtureQty = (c: Circuit, key: string) =>
  (c.circuit_fixtures ?? [])
    .filter((f) => fixtureKey(f) === key)
    .reduce((s, f) => s + f.quantity, 0);

/** Rata-rata kandidat kalau semuanya sepakat; null kalau kosong atau berbeda-beda. */
function agreed(values: number[]): number | null {
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  // tidak sepakat -> lebih baik kosong daripada salah
  if (max - min > tol(max)) return null;
  return round1((min + max) / 2);
}

/** Watt/unit menurut data (kolom watt_per_unit) — hanya kalau konsisten di semua circuit. */
function wattFromData(circuits: Circuit[], key: string): number | null {
  const seen = new Set<number>();
  for (const c of circuits) {
    for (const fx of c.circuit_fixtures ?? []) {
      if (fixtureKey(fx) === key && fx.watt_per_unit != null) {
        seen.add(Number(fx.watt_per_unit));
      }
    }
  }
  return seen.size === 1 ? [...seen][0] : null;
}

/**
 * Cari watt/unit tiap kolom FIXTURE.
 *
 * Sumber pertama adalah parameter Revit (`watt_per_unit`). Kalau kosong — dan
 * ini yang sering terjadi karena banyak family tidak punya parameter
 * "Wattage" — angkanya dihitung balik dari demand load circuit:
 *
 *   demand load circuit = SIGMA(qty kolom x watt/unit kolom)
 *
 * Tiap circuit jadi satu persamaan. Persamaan yang cuma menyisakan SATU kolom
 * belum diketahui bisa langsung dipecahkan (`sisa / qty`), hasilnya dipakai
 * untuk circuit lain, begitu seterusnya sampai tidak ada lagi yang bisa
 * dipecahkan. Jadi kolom yang tidak pernah muncul sendirian pun tetap dapat
 * angka selama ada kombinasi circuit yang menyisakannya sendirian —
 * inilah bedanya dengan cara lama yang hanya melihat circuit satu-kolom.
 *
 * Kolom yang kandidatnya tidak sepakat sengaja dibiarkan kosong: di Excel
 * selnya jadi sel isian kuning, dan begitu diisi user, demand load circuit
 * yang memakainya otomatis ikut terhitung lewat formula.
 */
export function solveFixtureWatts<T extends { key: string }>(
  circuits: Circuit[],
  cols: T[]
): FixtureWatts {
  const n = cols.length;
  const watt: (number | null)[] = Array(n).fill(null);
  const source: (WattSource | null)[] = Array(n).fill(null);
  if (n === 0) return { watt, source };

  const qty = circuits.map((c) => cols.map((col) => fixtureQty(c, col.key)));
  const load = circuits.map(circuitWatt);

  // 1. angka dari data + cek silang ke circuit yang cuma memakai satu kolom
  const fromData = cols.map((col) => wattFromData(circuits, col.key));
  const fromSingle = cols.map((_, i) => {
    const cand: number[] = [];
    circuits.forEach((_c, ci) => {
      if (load[ci] <= 0) return;
      const used = qty[ci].reduce<number[]>((acc, q, j) => (q > 0 ? [...acc, j] : acc), []);
      if (used.length === 1 && used[0] === i) cand.push(load[ci] / qty[ci][i]);
    });
    return agreed(cand);
  });

  for (let i = 0; i < n; i++) {
    const data = fromData[i];
    const single = fromSingle[i];
    // angka dari data diutamakan, kecuali terbukti tidak cocok dengan beban
    // circuit yang cuma memakai kolom ini
    const trustData = data != null && (single == null || Math.abs(data - single) <= tol(single));
    const value = trustData ? data : (single ?? data);
    if (value != null && value > 0) {
      watt[i] = value;
      source[i] = trustData ? "data" : "derived";
    }
  }

  // 2. eliminasi bertahap: pakai kolom yang sudah diketahui untuk memecahkan
  //    circuit yang tinggal menyisakan satu kolom belum diketahui
  for (let pass = 0; pass < n; pass++) {
    const cand: number[][] = cols.map(() => []);
    circuits.forEach((_c, ci) => {
      if (load[ci] <= 0) return;
      let rest = load[ci];
      let unknown = -1;
      let unknownCount = 0;
      qty[ci].forEach((q, j) => {
        if (q <= 0) return;
        if (watt[j] == null) {
          unknown = j;
          unknownCount += 1;
        } else {
          rest -= q * watt[j]!;
        }
      });
      if (unknownCount !== 1) return;
      const per = rest / qty[ci][unknown];
      // sisa negatif/nol berarti angka yang sudah diketahui tidak cocok dengan
      // circuit ini — jangan dipakai jadi kandidat
      if (per > 0) cand[unknown].push(per);
    });

    let changed = false;
    cand.forEach((values, i) => {
      if (watt[i] != null) return;
      const value = agreed(values);
      if (value != null && value > 0) {
        watt[i] = value;
        source[i] = "derived";
        changed = true;
      }
    });
    if (!changed) break;
  }

  return { watt, source };
}
