import { describe, expect, it } from "vitest";
import { solveFixtureWatts } from "@/lib/fixtureWatt";
import { FIXTURE_GROUP, sortFixtureColumns, textGroup } from "@/lib/fixtureOrder";
import { fixtureKey } from "@/lib/types";
import { makeCircuit, makeFixture } from "./factory";

const col = (type: string, label: string | null = null) => ({
  key: fixtureKey({ fixture_type: type, fixture_label: label }),
  type,
  label,
});

describe("solveFixtureWatts", () => {
  const A = col("LED DOWNLIGHT", "12W");
  const B = col("LED HIGHBAY", "100W");

  it("menghitung balik watt/unit dari demand load, bertahap", () => {
    const circuits = [
      // cuma A -> A = 200 / 10 = 20
      makeCircuit({
        phase_r: 200,
        circuit_fixtures: [makeFixture({ fixture_type: A.type, fixture_label: A.label, quantity: 10 })],
      }),
      // A sudah diketahui -> B = (130 - 2 x 20) / 3 = 30
      makeCircuit({
        phase_s: 130,
        circuit_fixtures: [
          makeFixture({ fixture_type: A.type, fixture_label: A.label, quantity: 2 }),
          makeFixture({ fixture_type: B.type, fixture_label: B.label, quantity: 3 }),
        ],
      }),
    ];
    const r = solveFixtureWatts(circuits, [A, B]);
    expect(r.watt).toEqual([20, 30]);
    expect(r.source).toEqual(["derived", "derived"]);
  });

  it("watt_per_unit dari Revit diutamakan kalau cocok dengan beban", () => {
    const circuits = [
      makeCircuit({
        phase_r: 150,
        circuit_fixtures: [
          makeFixture({ fixture_type: A.type, fixture_label: A.label, quantity: 10, watt_per_unit: 15 }),
        ],
      }),
    ];
    const r = solveFixtureWatts(circuits, [A]);
    expect(r.watt).toEqual([15]);
    expect(r.source).toEqual(["data"]);
  });

  it("kandidat yang tidak sepakat dibiarkan kosong", () => {
    const fx = (q: number) => [makeFixture({ fixture_type: A.type, fixture_label: A.label, quantity: q })];
    const circuits = [
      makeCircuit({ phase_r: 100, circuit_fixtures: fx(10) }), // 10 W
      makeCircuit({ phase_r: 300, circuit_fixtures: fx(10) }), // 30 W
    ];
    const r = solveFixtureWatts(circuits, [A]);
    expect(r.watt).toEqual([null]);
    expect(r.source).toEqual([null]);
  });
});

describe("fixtureOrder", () => {
  it("textGroup mengenali lighting & receptacle", () => {
    expect(textGroup("LIGHTING (D)/4")).toBe(FIXTURE_GROUP.lighting);
    expect(textGroup("ACT_E_HIGHBAY_BY698P")).toBe(FIXTURE_GROUP.lighting);
    expect(textGroup("RECEPTACLE (D)/42")).toBe(FIXTURE_GROUP.electrical);
    expect(textGroup("STOP KONTAK 1PH")).toBe(FIXTURE_GROUP.electrical);
    expect(textGroup("AHU-01")).toBeNull();
  });

  it("lighting dulu, lalu receptacle; NORMAL sebelum EMERGENCY", () => {
    const cols = [
      col("SOCKET OUTLET", null),
      col("DOWNLIGHT 12WATT EMERGENCY", null),
      col("DOWNLIGHT 12WATT NORMAL", null),
      col("DOWNLIGHT 12WATT NON-EMERGENCY X", null),
    ];
    const sorted = sortFixtureColumns(cols, []).map((c) => c.type);
    expect(sorted[0]).toBe("DOWNLIGHT 12WATT NORMAL");
    expect(sorted[1]).toBe("DOWNLIGHT 12WATT EMERGENCY");
    expect(sorted[sorted.length - 1]).toBe("SOCKET OUTLET");
  });
});
