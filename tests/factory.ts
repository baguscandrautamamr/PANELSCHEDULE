import type { Circuit, CircuitFixture, Panel } from "@/lib/types";

/** Panel 3 fase 220/380V tanpa cos φ (jadi pakai default 0,8). */
export function makePanel(over: Partial<Panel> = {}): Panel {
  return {
    id: "panel-1",
    project_id: null,
    panel_code: "P-TEST",
    location: null,
    ip_rating: null,
    box_type: null,
    symbol_tag: null,
    source_panel: null,
    main_breaker_type: null,
    main_breaker_rating: null,
    fuse_rating: null,
    incoming_cable: null,
    voltage: "220/380V",
    phase: "3PH",
    wire: "4W",
    freq: "50Hz",
    power_factor: null,
    updated_at: null,
    ...over,
  };
}

let seq = 0;

export function makeFixture(over: Partial<CircuitFixture> = {}): CircuitFixture {
  seq += 1;
  return {
    id: `fx-${seq}`,
    circuit_id: "c",
    fixture_type: "LED DOWNLIGHT",
    fixture_label: null,
    quantity: 1,
    watt_per_unit: null,
    ...over,
  };
}

export function makeCircuit(over: Partial<Circuit> = {}): Circuit {
  seq += 1;
  return {
    id: `c-${seq}`,
    panel_id: "panel-1",
    circuit_no: seq,
    revit_circuit_number: null,
    function_name: "LIGHTING (D)/1",
    phase_r: 0,
    phase_s: 0,
    phase_t: 0,
    phase_lock: null,
    remarks: null,
    is_spare: false,
    source: "revit",
    circuit_fixtures: [],
    ...over,
  };
}
