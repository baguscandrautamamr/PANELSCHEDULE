import type { Circuit, Panel } from "./types";
import { FIXTURE_GROUP, textGroup } from "./fixtureOrder";
import {
  BREAKER_RATINGS,
  circuitAmpere,
  energizedPhases,
  is3Phase,
  suggestBreaker,
} from "./panelCalc";
import { cableText, odText, pickCable, type CableCores, type CablePick } from "./cableCatalog";

/**
 * Jenis beban satu circuit — penentu jenis breaker dan jenis kabelnya.
 * Data breaker & kabel dari Revit TIDAK dipakai lagi; keduanya diturunkan di
 * sini dari BREAKER SELECTION (rating standar terdekat di atas arus circuit).
 */
export type LoadKind = "lighting" | "receptacle" | "other";

export interface CircuitRule {
  kind: LoadKind;
  /** circuit 3 fase (R, S, dan T sama-sama berbeban) */
  threePhase: boolean;
  /** "MCB 1P" / "MCB 3P" / "RCBO 2P" / "RCCB 4P" */
  breakerType: string;
  /** rating minimum yang boleh dipakai (A) */
  minRating: number;
  /** sisipan sensitivitas arus bocor di belakang rating, mis. "30mA" */
  residual: string | null;
  /** jumlah inti kabel NYY */
  cores: CableCores;
  /** ukuran minimum kabel (mm²) */
  minSize: number;
}

/** Rating breaker yang boleh dipakai buat aturan ini (yang di bawah minimum dibuang). */
export const allowedRatings = (rule: CircuitRule) =>
  BREAKER_RATINGS.filter((r) => r >= rule.minRating);

/**
 * Kelompok beban satu circuit. Nama FUNCTION yang paling bisa dipercaya —
 * add-in menyusunnya dari kategori Revit ("LIGHTING (D)/4", "RECEPTACLE (D)/42")
 * — kalau tidak ada petunjuk di situ baru dilihat nama fixture yang dipakai.
 * Circuit campuran (ada lighting DAN stop kontak) dihitung receptacle: proteksi
 * arus bocornya yang menentukan, bukan lampunya.
 */
function loadKind(c: Circuit): LoadKind {
  const fromFunction = textGroup(c.function_name ?? "");
  const fromFixtures = (c.circuit_fixtures ?? []).map((f) =>
    textGroup(`${f.fixture_type} ${f.fixture_label ?? ""}`)
  );
  const groups = [fromFunction, ...fromFixtures];

  if (groups.includes(FIXTURE_GROUP.electrical)) return "receptacle";
  if (groups.includes(FIXTURE_GROUP.lighting)) return "lighting";
  return "other";
}

/** Circuit 3 fase? R, S, dan T sama-sama berbeban di panel 3 fase. */
function isThreePhase(panel: Panel, c: Circuit): boolean {
  if (!is3Phase(panel)) return false;
  if (energizedPhases(c) >= 3) return true;
  // circuit tanpa beban (mis. SPARE) — lihat penandanya di nama FUNCTION
  return /\b3\s*(P|PH|PHASE|FASE)\b/i.test(c.function_name ?? "");
}

/**
 * Aturan breaker & kabel satu circuit:
 *
 *   LIGHTING        : MCB 1P, minimum 10 A, NYY 3C minimum 2,5 mm²
 *   RECEPTACLE 1 PH : RCBO 2P 30 mA, minimum 16 A, NYY 3C minimum 4 mm²
 *   RECEPTACLE 3 PH : RCCB 4P 30 mA, minimum 16 A, NYY 5C minimum 4 mm²
 *
 * Beban lain (mesin, AC, panel cabang) dan lighting 3 fase tidak disebut
 * khusus, jadi dipakai MCB polos minimum 10 A / 2,5 mm²: 1 fase MCB 1P + NYY 3C,
 * 3 fase MCB 3P + NYY 4C (R-S-T-N, pembumian ikut jalur terpisah) — kecuali
 * lighting 3 fase yang tetap perlu inti pembumian sendiri, jadi NYY 5C.
 */
export function circuitRule(panel: Panel, c: Circuit): CircuitRule {
  const kind = loadKind(c);
  const threePhase = isThreePhase(panel, c);

  if (kind === "receptacle") {
    return threePhase
      ? {
          kind,
          threePhase,
          breakerType: "RCCB 4P",
          minRating: 16,
          residual: "30mA",
          cores: 5,
          minSize: 4,
        }
      : {
          kind,
          threePhase,
          breakerType: "RCBO 2P",
          minRating: 16,
          residual: "30mA",
          cores: 3,
          minSize: 4,
        };
  }

  const breakerType = threePhase ? "MCB 3P" : "MCB 1P";
  const cores: CableCores = threePhase ? (kind === "lighting" ? 5 : 4) : 3;
  return {
    kind,
    threePhase,
    breakerType,
    minRating: 10,
    residual: null,
    cores,
    minSize: 2.5,
  };
}

/**
 * Rating breaker yang dipakai (A): hasil BREAKER SELECTION, dinaikkan ke
 * minimum jenis bebannya. null kalau arusnya melampaui rating terbesar di
 * daftar — perlu breaker khusus, jangan ditebak.
 */
export function ruleRating(rule: CircuitRule, ampere: number | null): number | null {
  if (ampere == null || ampere <= 0) return rule.minRating;
  const picked = suggestBreaker(ampere);
  return picked == null ? null : Math.max(rule.minRating, picked);
}

/** Isi kolom BREAKER — "MCB 1P 20A", "RCBO 2P 16A 30mA". */
export function breakerText(rule: CircuitRule, rating: number | null): string {
  const size = rating == null ? `> ${BREAKER_RATINGS[BREAKER_RATINGS.length - 1]}A` : `${rating}A`;
  return [rule.breakerType, size, rule.residual].filter(Boolean).join(" ");
}

/**
 * Kabel outgoing: ukuran terkecil di katalog KMI NYY yang KHA-nya masih di atas
 * rating breaker (Iz >= In) dan tidak lebih kecil dari ukuran minimum jenis
 * bebannya — jadi breaker yang jatuh di bawah minimum tetap memakai kabel
 * minimum yang disyaratkan.
 */
export function ruleCable(rule: CircuitRule, rating: number): CablePick {
  return pickCable(rule.cores, rating, rule.minSize);
}

export interface CircuitSpec {
  rule: CircuitRule;
  /** arus circuit (A), null kalau tidak berbeban */
  ampere: number | null;
  /** rating breaker terpakai (A), null kalau di atas rating terbesar */
  rating: number | null;
  /** isi kolom BREAKER */
  breaker: string;
  /**
   * Kabel terpilih — null untuk SPARE (belum ada kabel keluar) dan untuk
   * circuit yang arusnya di atas rating breaker terbesar (perlu breaker &
   * kabel khusus, mis. beberapa kabel paralel).
   */
  cable: CablePick | null;
  /** isi kolom TYPE */
  cableText: string;
  /** isi kolom OD (mm) */
  odText: string;
}

/**
 * Breaker + kabel satu circuit, semuanya diturunkan dari arus circuit lewat
 * BREAKER SELECTION. Baris SPARE tetap dapat breaker (rating minimum) tapi
 * tidak dapat kabel — belum ada beban yang disambung.
 */
export function circuitSpec(panel: Panel, c: Circuit): CircuitSpec {
  const rule = circuitRule(panel, c);
  const ampere = circuitAmpere(panel, c);
  const rating = ruleRating(rule, ampere);
  const cable = c.is_spare || rating == null ? null : ruleCable(rule, rating);

  return {
    rule,
    ampere,
    rating,
    breaker: breakerText(rule, rating),
    cable,
    cableText: cable ? cableText(cable.cores, cable.size) : "",
    odText: cable ? odText(cable.od) : "",
  };
}
