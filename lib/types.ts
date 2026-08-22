export interface Project {
  id: string;
  name: string;
  client: string | null;
}

export interface Panel {
  id: string;
  project_id: string | null;
  panel_code: string;
  location: string | null;
  ip_rating: string | null;
  box_type: string | null;
  symbol_tag: string | null;
  source_panel: string | null;
  main_breaker_type: string | null;
  main_breaker_rating: string | null;
  fuse_rating: string | null;
  incoming_cable: string | null;
  voltage: string | null;
  phase: string | null;
  wire: string | null;
  freq: string | null;
  power_factor: number | null;
  updated_at: string | null;
}

export interface Circuit {
  id: string;
  panel_id: string;
  /**
   * Nomor urut tampilan (1..N, rapat tanpa loncatan).
   * Negatif = circuit Revit yang dihapus di web, menunggu disconnect via Pull.
   */
  circuit_no: number;
  /**
   * "Circuit Number" Revit apa adanya — "(D)/4", "DB-FG/42", "1,3,5".
   * Null untuk load manual. Jadi kunci pencocokan waktu Pull.
   */
  revit_circuit_number: string | null;
  function_name: string;
  breaker_type: string | null;
  breaker_rating: string | null;
  outgoing_cable: string | null;
  phase_r: number;
  phase_s: number;
  phase_t: number;
  /**
   * Fase yang dikunci user lewat "Rebalance Loads" / edit fase di form.
   * null = ikut pembagian fase dari model Revit. Push berikutnya memindahkan
   * watt TERBARU dari Revit ke fase ini (dicocokkan lewat revit_circuit_number),
   * jadi perubahan beban di model tetap masuk tapi posisi R/S/T tidak lompat.
   */
  phase_lock: "R" | "S" | "T" | null;
  remarks: string | null;
  is_spare: boolean;
  /** 'revit' = dari push add-in (ditimpa tiap push); 'manual' = input website (dipertahankan) */
  source: "revit" | "manual";
  circuit_fixtures: CircuitFixture[];
}

export interface CircuitFixture {
  id: string;
  circuit_id: string;
  fixture_type: string;
  fixture_label: string | null;
  quantity: number;
  watt_per_unit: number | null;
}

/** Kolom fixture dinamis: gabungan fixture_type + fixture_label */
export function fixtureKey(f: { fixture_type: string; fixture_label: string | null }) {
  return f.fixture_label ? `${f.fixture_type}|${f.fixture_label}` : f.fixture_type;
}
