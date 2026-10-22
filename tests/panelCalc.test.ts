import { describe, expect, it } from "vitest";
import {
  BREAKER_RATINGS,
  circuitAmpere,
  energizedPhases,
  is3Phase,
  panelPowerFactor,
  panelVoltage,
  panelVoltageLN,
  suggestBreaker,
  suggestBreakerText,
} from "@/lib/panelCalc";
import { makePanel } from "./factory";

const loads = (r: number, s = 0, t = 0) => ({ phase_r: r, phase_s: s, phase_t: t });

describe("tegangan panel", () => {
  it("220/380V 3 fase: L-L 380, L-N 220", () => {
    const p = makePanel();
    expect(is3Phase(p)).toBe(true);
    expect(panelVoltage(p)).toBe(380);
    expect(panelVoltageLN(p)).toBe(220);
  });

  it("panel 3 fase dengan satu angka: L-N diturunkan dari L-L / akar 3", () => {
    expect(panelVoltageLN(makePanel({ voltage: "380V" }))).toBe(220);
    expect(panelVoltageLN(makePanel({ voltage: "400V" }))).toBe(230);
  });

  it("panel 1 fase memakai angka terkecil", () => {
    const p = makePanel({ phase: "1PH", voltage: "230V" });
    expect(is3Phase(p)).toBe(false);
    expect(panelVoltage(p)).toBe(230);
    expect(panelVoltageLN(p)).toBe(230);
  });

  it("voltage kosong jatuh ke default 400V / 230V", () => {
    expect(panelVoltage(makePanel({ voltage: null }))).toBe(400);
    expect(panelVoltage(makePanel({ voltage: null, phase: "1PH" }))).toBe(230);
    expect(panelVoltageLN(makePanel({ voltage: "" }))).toBe(230);
  });
});

describe("panelPowerFactor", () => {
  it("cos φ = 1 atau kosong dari Revit diganti 0,8", () => {
    expect(panelPowerFactor(makePanel({ power_factor: 1 }))).toBe(0.8);
    expect(panelPowerFactor(makePanel({ power_factor: null }))).toBe(0.8);
    expect(panelPowerFactor(makePanel({ power_factor: 0 }))).toBe(0.8);
  });

  it("cos φ yang valid dipakai apa adanya", () => {
    expect(panelPowerFactor(makePanel({ power_factor: 0.85 }))).toBe(0.85);
  });
});

describe("circuitAmpere", () => {
  const p = makePanel();

  it("1 fase: W / V(L-N)", () => {
    expect(circuitAmpere(p, loads(2200))).toBeCloseTo(10, 6);
  });

  it("2 fase: W / (cos φ x V L-L)", () => {
    expect(circuitAmpere(p, loads(1000, 1000))).toBeCloseTo(2000 / (0.8 * 380), 6);
  });

  it("3 fase: W / (cos φ x akar3 x V L-L)", () => {
    expect(circuitAmpere(p, loads(3000, 3000, 3000))).toBeCloseTo(
      9000 / (0.8 * Math.sqrt(3) * 380),
      6
    );
  });

  it("panel 1 fase selalu rumus 1 fase", () => {
    const p1 = makePanel({ phase: "1PH", voltage: "230V" });
    expect(circuitAmpere(p1, loads(1150, 1150))).toBeCloseTo(10, 6);
  });

  it("circuit tanpa beban -> null", () => {
    expect(circuitAmpere(p, loads(0))).toBeNull();
  });

  it("energizedPhases menghitung fase yang berbeban", () => {
    expect(energizedPhases(loads(0))).toBe(0);
    expect(energizedPhases(loads(5, 0, 7))).toBe(2);
    expect(energizedPhases(loads(1, 1, 1))).toBe(3);
  });
});

describe("BREAKER SELECTION", () => {
  it("memakai rating MCB standar IEC: ada 32A, tidak ada 35A", () => {
    expect(BREAKER_RATINGS).toContain(32);
    expect(BREAKER_RATINGS).not.toContain(35);
    expect([...BREAKER_RATINGS].sort((a, b) => a - b)).toEqual(BREAKER_RATINGS);
  });

  it("rating terkecil di atas ampere x 1,2", () => {
    expect(suggestBreaker(8)).toBe(10); // 9,6
    expect(suggestBreaker(20)).toBe(25); // 24
    expect(suggestBreaker(22)).toBe(32); // 26,4 -> 32A, bukan 35A
    expect(suggestBreaker(26)).toBe(32); // 31,2
    expect(suggestBreaker(27)).toBe(40); // 32,4
  });

  it("di atas rating terbesar tidak ditebak", () => {
    expect(suggestBreaker(170)).toBeNull();
    expect(suggestBreakerText(170)).toBe("> 200A");
  });

  it("tanpa beban -> kosong", () => {
    expect(suggestBreaker(null)).toBeNull();
    expect(suggestBreaker(0)).toBeNull();
    expect(suggestBreakerText(null)).toBe("");
    expect(suggestBreakerText(22)).toBe("32A");
  });
});
