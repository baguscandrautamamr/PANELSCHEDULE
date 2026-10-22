import { describe, expect, it } from "vitest";
import {
  circuitRule,
  circuitSpec,
  connectedAmpere,
  groundSize,
  mainBreakerSpec,
} from "@/lib/circuitSpec";
import { pickCable, pickFeeder, NYY_CATALOG } from "@/lib/cableCatalog";
import { makeCircuit, makeFixture, makePanel } from "./factory";

const panel = makePanel();

describe("circuitSpec — breaker & kabel per circuit", () => {
  it("LIGHTING 1 fase: MCB 1P minimum 10A, NYY 3C 2,5mm²", () => {
    const s = circuitSpec(panel, makeCircuit({ function_name: "LIGHTING (D)/4", phase_r: 1000 }));
    expect(s.rule.kind).toBe("lighting");
    expect(s.rating).toBe(10);
    expect(s.breaker).toBe("MCB 1P, 10A");
    expect(s.cableText).toBe("NYY 3C x 2.5mm²");
    expect(s.odText).toBe("14.0");
  });

  it("RECEPTACLE 1 fase 5 kW: RCBO 2P 30mA 32A, NYY 3C 4mm²", () => {
    const s = circuitSpec(
      panel,
      makeCircuit({ function_name: "RECEPTACLE (D)/42", phase_s: 5000 })
    );
    expect(s.rule.breakerType).toBe("RCBO 2P");
    expect(s.rating).toBe(32);
    expect(s.breaker).toBe("RCBO 2P, 30mA, 32A");
    expect(s.cableText).toBe("NYY 3C x 4mm²");
    // Iz >= In
    expect(s.cable!.ampacity).toBeGreaterThanOrEqual(32);
  });

  it("RECEPTACLE 3 fase: RCCB 4P minimum 16A, NYY 5C minimum 4mm²", () => {
    const s = circuitSpec(
      panel,
      makeCircuit({ function_name: "RECEPTACLE (D)/1,3,5", phase_r: 2000, phase_s: 2000, phase_t: 2000 })
    );
    expect(s.rule.threePhase).toBe(true);
    expect(s.breaker).toBe("RCCB 4P, 30mA, 16A");
    expect(s.cable!.cores).toBe(5);
    expect(s.cable!.size).toBeGreaterThanOrEqual(4);
  });

  it("beban lain 3 fase: MCB 3P + NYY 4C", () => {
    const rule = circuitRule(
      panel,
      makeCircuit({ function_name: "AHU-01", phase_r: 1000, phase_s: 1000, phase_t: 1000 })
    );
    expect(rule.kind).toBe("other");
    expect(rule.breakerType).toBe("MCB 3P");
    expect(rule.cores).toBe(4);
  });

  it("lighting 3 fase tetap NYY 5C", () => {
    const rule = circuitRule(
      panel,
      makeCircuit({ function_name: "LIGHTING (D)/1,3,5", phase_r: 500, phase_s: 500, phase_t: 500 })
    );
    expect(rule.breakerType).toBe("MCB 3P");
    expect(rule.cores).toBe(5);
  });

  it("circuit campuran lighting + stop kontak dihitung receptacle", () => {
    const rule = circuitRule(
      panel,
      makeCircuit({
        function_name: "LIGHTING + RECEPTACLE (D)/7",
        phase_r: 500,
      })
    );
    expect(rule.kind).toBe("receptacle");
  });

  it("jenis beban dari nama fixture kalau FUNCTION tidak memberi petunjuk", () => {
    const rule = circuitRule(
      panel,
      makeCircuit({
        function_name: "(D)/9",
        phase_r: 500,
        circuit_fixtures: [makeFixture({ fixture_type: "ACT_E_RECEPTACLE INDUSTRIAL" })],
      })
    );
    expect(rule.kind).toBe("receptacle");
  });

  it("SPARE: breaker rating minimum, tanpa kabel", () => {
    const s = circuitSpec(panel, makeCircuit({ function_name: "SPARE", is_spare: true }));
    expect(s.rating).toBe(10);
    expect(s.breaker).toBe("MCB 1P, 10A");
    expect(s.cable).toBeNull();
    expect(s.cableText).toBe("");
    expect(s.odText).toBe("");
  });

  it("SPARE 3 fase dikenali dari nama FUNCTION", () => {
    const rule = circuitRule(panel, makeCircuit({ function_name: "SPARE 3P", is_spare: true }));
    expect(rule.threePhase).toBe(true);
  });

  it("arus di atas rating terbesar: breaker '> 200A', kabel tidak ditebak", () => {
    const s = circuitSpec(panel, makeCircuit({ function_name: "MOTOR", phase_r: 50000 }));
    expect(s.rating).toBeNull();
    expect(s.breaker).toBe("MCB 1P, > 200A");
    expect(s.cable).toBeNull();
  });
});

describe("katalog kabel", () => {
  it("pickCable memilih ukuran terkecil dengan KHA >= rating", () => {
    const pick = pickCable(3, 32, 2.5);
    const smaller = NYY_CATALOG[3].filter((c) => c.size >= 2.5 && c.size < pick.size);
    expect(pick.ampacity).toBeGreaterThanOrEqual(32);
    expect(smaller.every((c) => c.ampacity < 32)).toBe(true);
    expect(pick.undersized).toBe(false);
  });

  it("pickCable menandai undersized kalau katalog tidak cukup", () => {
    const pick = pickCable(3, 10000, 2.5);
    expect(pick.undersized).toBe(true);
  });

  it("pickFeeder memecah jadi kabel paralel di atas KHA 240mm²", () => {
    const f = pickFeeder(4, 800, 4);
    expect(f.runs).toBe(2);
    expect(f.size).toBe(240);
    expect(f.capacity).toBeGreaterThanOrEqual(800);
  });

  it("groundSize mengikuti PUIL", () => {
    expect(groundSize(10)).toBe(10);
    expect(groundSize(16)).toBe(16);
    expect(groundSize(25)).toBe(16);
    expect(groundSize(35)).toBe(16);
    expect(groundSize(70)).toBe(35);
    expect(groundSize(240)).toBe(120);
    expect(groundSize(480)).toBe(240);
  });
});

describe("main breaker", () => {
  const threePhaseLoad = (w: number) =>
    makeCircuit({ function_name: "X", phase_r: w / 3, phase_s: w / 3, phase_t: w / 3 });

  it("CONNECTED AMPERE = (W / cos φ) / (akar3 x V L-L)", () => {
    expect(connectedAmpere(panel, [threePhaseLoad(20000)])).toBeCloseTo(
      25000 / (Math.sqrt(3) * 380),
      6
    );
  });

  it("panel kecil: MCB 3P tanpa CT", () => {
    const m = mainBreakerSpec(panel, [threePhaseLoad(20000)]);
    expect(m.breaker).toBe("MCB 3P 50A");
    expect(m.cable).toBe("NYY 4C x 6mm² + NYA 1C x 6mm²");
    expect(m.ct).toBeNull();
    expect(m.ammeter).toBe("0~50A");
  });

  it("panel besar: MCCB 3P + CT + kabel paralel", () => {
    const m = mainBreakerSpec(panel, [threePhaseLoad(300000)]);
    expect(m.breaker).toBe("MCCB 3P 800A");
    expect(m.ct).toBe("800/5A");
    expect(m.cable).toBe("2 x (NYY 4C x 240mm²) + NYA 1C x 240mm²");
  });

  it("panel 1 fase: 2P + NYY 3C", () => {
    const p1 = makePanel({ phase: "1PH", voltage: "230V" });
    const m = mainBreakerSpec(p1, [makeCircuit({ phase_r: 2000 })]);
    expect(m.type).toBe("MCB 2P");
    expect(m.cable.startsWith("NYY 3C")).toBe(true);
  });

  it("panel kosong: rating terkecil", () => {
    expect(mainBreakerSpec(panel, []).rating).toBe(10);
  });
});
