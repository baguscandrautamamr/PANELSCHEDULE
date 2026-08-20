import type { Circuit } from "./types";
import { fixtureKey } from "./types";

/**
 * Urutan kelompok kolom FIXTURE di panel schedule: lighting fixture dulu, baru
 * electrical fixture (stop kontak/receptacle), sisanya (mechanical, data, fire
 * alarm, dll) di belakang.
 */
export const FIXTURE_GROUP = { lighting: 0, electrical: 1, other: 2 } as const;

/** Kata kunci nama family/type yang khas lighting fixture. */
const LIGHTING_PARTS = [
  "LIGHT",
  "LAMP",
  "LUMIN",
  "DOWNLIGH",
  "SPOTLIGH",
  "FLOODLIGH",
  "HIGHBAY",
  "HIGH BAY",
  "LOWBAY",
  "LOW BAY",
  "BULKHEAD",
  "CHANDELIER",
  "EMERGENC",
  "ILLUMIN",
];
/** Kata pendek yang gampang ketemu di tengah kata lain — dicocokkan per kata utuh. */
const LIGHTING_WORDS = new Set(["TL", "LED", "PJU", "EXIT", "SPOT", "FLOOD", "PL", "RM"]);

/** Kata kunci nama family/type yang khas electrical fixture (kategori Electrical Fixtures). */
const ELECTRICAL_PARTS = [
  "RECEPTACLE",
  "SOCKET",
  "OUTLET",
  "STOP KONTAK",
  "STOPKONTAK",
  "SAKLAR",
  "SWITCH",
];
const ELECTRICAL_WORDS = new Set(["SK", "SSK", "PLUG", "KONTAK"]);

const words = (text: string) => text.split(/[^A-Z0-9]+/).filter(Boolean);

const hits = (text: string, parts: string[], exact: Set<string>) =>
  parts.some((p) => text.includes(p)) || words(text).some((w) => exact.has(w));

/**
 * Kelompok satu kolom fixture.
 *
 * Sumber paling bisa dipercaya adalah FUNCTION circuit-nya: add-in menyusunnya
 * dari kategori Revit ("LIGHTING (D)/4", "RECEPTACLE (D)/42"), jadi kalau semua
 * circuit yang memakai fixture ini satu jenis, itu yang dipakai. Kalau tidak
 * ada petunjuk atau circuit-nya campuran ("LIGHTING + RECEPTACLE"), baru
 * ditebak dari nama family/type fixture-nya.
 */
export function fixtureGroup(
  col: { key: string; type: string; label: string | null },
  circuits: Circuit[]
): number {
  let lighting = false;
  let electrical = false;
  for (const c of circuits) {
    if (!(c.circuit_fixtures ?? []).some((f) => fixtureKey(f) === col.key)) continue;
    const fn = (c.function_name ?? "").toUpperCase();
    if (fn.includes("LIGHTING")) lighting = true;
    if (fn.includes("RECEPTACLE")) electrical = true;
  }
  if (lighting !== electrical) return lighting ? FIXTURE_GROUP.lighting : FIXTURE_GROUP.electrical;

  const text = `${col.type} ${col.label ?? ""}`.toUpperCase();
  if (hits(text, LIGHTING_PARTS, LIGHTING_WORDS)) return FIXTURE_GROUP.lighting;
  if (hits(text, ELECTRICAL_PARTS, ELECTRICAL_WORDS)) return FIXTURE_GROUP.electrical;
  return FIXTURE_GROUP.other;
}

/**
 * Urutkan kolom fixture: lighting fixture dulu, lalu electrical fixture, lalu
 * sisanya — di dalam tiap kelompok tetap urut abjad. Urutan ini dipakai juga
 * oleh export Excel & DXF, jadi tabel di web dan gambar/spreadsheet sama.
 */
export function sortFixtureColumns<T extends { key: string; type: string; label: string | null }>(
  cols: T[],
  circuits: Circuit[]
): T[] {
  const group = new Map(cols.map((c) => [c.key, fixtureGroup(c, circuits)]));
  return [...cols].sort(
    (a, b) =>
      group.get(a.key)! - group.get(b.key)! ||
      `${a.type} ${a.label ?? ""}`.localeCompare(`${b.type} ${b.label ?? ""}`)
  );
}
