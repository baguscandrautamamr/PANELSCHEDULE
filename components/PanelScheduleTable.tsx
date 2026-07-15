"use client";

import type { Circuit, Panel } from "@/lib/types";
import { fixtureKey } from "@/lib/types";

const nf = new Intl.NumberFormat("en-US");
const nf1 = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

interface FixtureCol {
  key: string;
  type: string;
  label: string | null;
  watt: number | null;
}

/** Kolom fixture dinamis dari data (jangan hardcode — beda tiap project) */
function buildFixtureColumns(circuits: Circuit[]): FixtureCol[] {
  const map = new Map<string, FixtureCol>();
  for (const c of circuits) {
    for (const f of c.circuit_fixtures ?? []) {
      const key = fixtureKey(f);
      if (!map.has(key)) {
        map.set(key, {
          key,
          type: f.fixture_type,
          label: f.fixture_label,
          watt: f.watt_per_unit,
        });
      }
    }
  }
  return [...map.values()].sort((a, b) =>
    `${a.type} ${a.label}`.localeCompare(`${b.type} ${b.label}`)
  );
}

export default function PanelScheduleTable({
  panel,
  circuits,
}: {
  panel: Panel;
  circuits: Circuit[];
}) {
  const cols = buildFixtureColumns(circuits);

  const qtyOf = (c: Circuit, key: string) =>
    (c.circuit_fixtures ?? [])
      .filter((f) => fixtureKey(f) === key)
      .reduce((s, f) => s + f.quantity, 0);

  const totalQty = (key: string) =>
    circuits.reduce((s, c) => s + qtyOf(c, key), 0);

  const subR = circuits.reduce((s, c) => s + Number(c.phase_r || 0), 0);
  const subS = circuits.reduce((s, c) => s + Number(c.phase_s || 0), 0);
  const subT = circuits.reduce((s, c) => s + Number(c.phase_t || 0), 0);
  const totalWatt = subR + subS + subT;

  const pf = Number(panel.power_factor ?? 0.8) || 0.8;
  const totalVA = totalWatt / pf;
  const voltLL = parseFloat(panel.voltage ?? "400") || 400;
  const is3ph = (panel.phase ?? "3PH").toUpperCase().includes("3");
  // 3PH: I = VA / (√3 × V L-L); 1PH: I = VA / V L-N (≈230V)
  const ampere = is3ph ? totalVA / (Math.sqrt(3) * voltLL) : totalVA / 230;

  return (
    <div className="min-w-fit">
      {/* header panel */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">
            {panel.panel_code}
            {panel.ip_rating && ` (${panel.ip_rating})`} {panel.location}
          </h1>
          <p className="text-sm text-neutral-600">
            {panel.box_type}
            {panel.location && ` · LOCATION ${panel.location}`}
          </p>
        </div>
        <div className="text-right text-xs text-neutral-600">
          <p>
            {panel.source_panel} · {panel.main_breaker_type}{" "}
            {panel.main_breaker_rating}
            {panel.fuse_rating && ` · ${panel.fuse_rating}`}
          </p>
          <p>{panel.incoming_cable}</p>
          <p>
            {panel.voltage}, {panel.phase}, {panel.wire}, {panel.freq} · cos φ{" "}
            {pf}
          </p>
        </div>
      </div>

      <table className="sched-table w-full border-collapse text-xs">
        <thead>
          <tr className="bg-neutral-100">
            <th rowSpan={3} className="px-2 py-1">
              NO.
            </th>
            <th rowSpan={3} className="px-2 py-1 text-left">
              FUNCTION
            </th>
            <th rowSpan={3} className="px-2 py-1">
              BREAKER
            </th>
            <th rowSpan={3} className="px-2 py-1">
              CABLE
            </th>
            {cols.length > 0 && (
              <th colSpan={cols.length} className="px-2 py-1">
                LIGHTING / FIXTURE
              </th>
            )}
            <th colSpan={3} className="px-2 py-1">
              DEMAND LOAD (WATT)
            </th>
            <th rowSpan={3} className="px-2 py-1">
              REMARKS
            </th>
          </tr>
          <tr className="bg-neutral-100">
            {cols.map((col) => (
              <th key={col.key} rowSpan={2} className="px-1 py-1 align-bottom">
                <div className="mx-auto max-w-20 whitespace-normal font-semibold leading-tight">
                  {col.type}
                </div>
                <div className="font-normal text-neutral-600">
                  {col.label ?? (col.watt ? `${col.watt} WATT` : "")}
                </div>
              </th>
            ))}
            <th className="w-16 px-2 py-1">R</th>
            <th className="w-16 px-2 py-1">S</th>
            <th className="w-16 px-2 py-1">T</th>
          </tr>
          <tr className="bg-neutral-100">
            <th className="px-2 py-0.5 text-[10px] font-normal">WATT</th>
            <th className="px-2 py-0.5 text-[10px] font-normal">WATT</th>
            <th className="px-2 py-0.5 text-[10px] font-normal">WATT</th>
          </tr>
        </thead>
        <tbody>
          {circuits.map((c) => (
            <tr key={c.id} className={c.is_spare ? "text-neutral-400" : ""}>
              <td className="px-2 py-0.5 text-center">{c.circuit_no}</td>
              <td className="px-2 py-0.5">{c.function_name}</td>
              <td className="px-2 py-0.5 text-center whitespace-nowrap">
                {c.breaker_type} {c.breaker_rating}
              </td>
              <td className="px-2 py-0.5 text-center whitespace-nowrap">
                {c.outgoing_cable}
              </td>
              {cols.map((col) => {
                const q = qtyOf(c, col.key);
                return (
                  <td key={col.key} className="px-1 py-0.5 text-center">
                    {q > 0 ? q : ""}
                  </td>
                );
              })}
              <td className="px-2 py-0.5 text-right">
                {c.phase_r > 0 ? nf.format(c.phase_r) : ""}
              </td>
              <td className="px-2 py-0.5 text-right">
                {c.phase_s > 0 ? nf.format(c.phase_s) : ""}
              </td>
              <td className="px-2 py-0.5 text-right">
                {c.phase_t > 0 ? nf.format(c.phase_t) : ""}
              </td>
              <td className="px-2 py-0.5">{c.remarks ?? ""}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="font-semibold">
          <tr className="bg-neutral-50">
            <td colSpan={4} className="px-2 py-1 text-right">
              TOTAL
            </td>
            {cols.map((col) => (
              <td key={col.key} className="px-1 py-1 text-center">
                {totalQty(col.key) || ""}
              </td>
            ))}
            <td colSpan={3} className="px-2 py-1" />
            <td className="px-2 py-1" />
          </tr>
          <tr className="bg-neutral-50">
            <td colSpan={4 + cols.length} className="px-2 py-1 text-right">
              SUB TOTAL
            </td>
            <td className="px-2 py-1 text-right">{nf.format(subR)}</td>
            <td className="px-2 py-1 text-right">{nf.format(subS)}</td>
            <td className="px-2 py-1 text-right">{nf.format(subT)}</td>
            <td className="px-2 py-1" />
          </tr>
          <tr className="bg-neutral-50">
            <td colSpan={4 + cols.length} className="px-2 py-1 text-right">
              TOTAL WATT
            </td>
            <td colSpan={3} className="px-2 py-1 text-center">
              {nf1.format(totalWatt)}
            </td>
            <td className="px-2 py-1" />
          </tr>
          <tr className="bg-neutral-50">
            <td colSpan={4 + cols.length} className="px-2 py-1 text-right">
              TOTAL VA
            </td>
            <td colSpan={3} className="px-2 py-1 text-center">
              {nf1.format(totalVA)}
            </td>
            <td className="px-2 py-1" />
          </tr>
          <tr className="bg-neutral-50">
            <td colSpan={4 + cols.length} className="px-2 py-1 text-right">
              CONNECTED AMPERE
            </td>
            <td colSpan={3} className="px-2 py-1 text-center">
              {nf1.format(ampere)}
            </td>
            <td className="px-2 py-1" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
