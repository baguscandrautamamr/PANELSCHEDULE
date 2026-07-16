"use client";

import { useState } from "react";
import type { Circuit, Panel } from "@/lib/types";
import { fixtureKey } from "@/lib/types";
import { supabase } from "@/lib/supabase";

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

/** Input kecil buat inline edit — commit saat blur / Enter */
function CellInput({
  initial,
  onCommit,
}: {
  initial: string;
  onCommit: (v: string) => void;
}) {
  return (
    <input
      defaultValue={initial}
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (v !== initial) onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="w-full min-w-20 rounded border border-blue-400 bg-blue-50/50 px-1 py-0.5 text-center text-xs outline-none focus:bg-white"
    />
  );
}

export default function PanelScheduleTable({
  panel,
  circuits,
}: {
  panel: Panel;
  circuits: Circuit[];
}) {
  const [editing, setEditing] = useState(false);
  const cols = buildFixtureColumns(circuits);

  async function updateCircuit(id: string, patch: Record<string, string | null>) {
    const { error } = await supabase.from("circuits").update(patch).eq("id", id);
    if (error) alert(`Gagal menyimpan: ${error.message}`);
  }

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

  const headerLine1 = [
    panel.source_panel,
    panel.main_breaker_type &&
      `${panel.main_breaker_type} ${panel.main_breaker_rating ?? ""}`.trim(),
    panel.fuse_rating,
  ]
    .filter(Boolean)
    .join(" · ");
  const headerLine3 = [panel.voltage, panel.phase, panel.wire, panel.freq]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="min-w-fit">
      {/* header panel */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">
            {panel.panel_code}
            {panel.ip_rating && ` (${panel.ip_rating})`}
          </h1>
          <p className="text-sm text-neutral-600">
            {[panel.box_type, panel.location && `LOCATION ${panel.location}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex items-start gap-4">
          <div className="text-right text-xs text-neutral-600">
            {headerLine1 && <p>{headerLine1}</p>}
            {panel.incoming_cable && <p>{panel.incoming_cable}</p>}
            <p>
              {headerLine3} · cos φ {pf}
            </p>
          </div>
          <button
            onClick={() => setEditing((e) => !e)}
            className={`rounded border px-3 py-1.5 text-xs font-semibold transition ${
              editing
                ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
                : "border-neutral-300 bg-white text-neutral-700 hover:border-blue-500"
            }`}
          >
            {editing ? "✓ Selesai edit" : "✎ Edit function, breaker & kabel"}
          </button>
        </div>
      </div>

      {editing && (
        <p className="mb-2 rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-800">
          Klik kolom FUNCTION / BREAKER / CABLE untuk mengubah, tekan Enter
          atau klik di luar untuk menyimpan. Jalankan <b>Pull from Website</b>{" "}
          di Revit add-in untuk menarik perubahan ini ke model — kalau FUNCTION
          tidak berubah di Revit, parameternya read-only di family tersebut.
        </p>
      )}

      <table className="sched-table w-full border-collapse text-xs">
        <thead>
          <tr className="bg-neutral-100">
            <th rowSpan={3} className="px-2 py-1 align-middle">
              NO.
            </th>
            <th rowSpan={3} className="min-w-32 px-2 py-1 text-left align-middle">
              FUNCTION
            </th>
            <th rowSpan={3} className="min-w-24 px-2 py-1 align-middle">
              BREAKER
            </th>
            <th rowSpan={3} className="min-w-28 px-2 py-1 align-middle">
              CABLE
            </th>
            {cols.length > 0 && (
              <th colSpan={cols.length} className="px-2 py-1">
                FIXTURE
              </th>
            )}
            <th colSpan={3} className="px-2 py-1">
              DEMAND LOAD (WATT)
            </th>
            <th rowSpan={3} className="min-w-20 px-2 py-1 align-middle">
              REMARKS
            </th>
          </tr>
          <tr className="bg-neutral-100">
            {cols.map((col) => (
              <th
                key={col.key}
                rowSpan={2}
                className="w-28 min-w-24 max-w-36 overflow-hidden px-1.5 py-1 align-bottom"
              >
                <div className="whitespace-normal break-words text-[10px] font-semibold leading-tight">
                  {col.type}
                </div>
                <div className="mt-0.5 whitespace-normal break-words text-[10px] font-normal leading-tight text-neutral-600">
                  {col.label ?? (col.watt ? `${col.watt} WATT` : "")}
                </div>
              </th>
            ))}
            <th className="w-16 min-w-14 px-2 py-1">R</th>
            <th className="w-16 min-w-14 px-2 py-1">S</th>
            <th className="w-16 min-w-14 px-2 py-1">T</th>
          </tr>
          <tr className="bg-neutral-100">
            <th className="px-2 py-0.5 text-[10px] font-normal">WATT</th>
            <th className="px-2 py-0.5 text-[10px] font-normal">WATT</th>
            <th className="px-2 py-0.5 text-[10px] font-normal">WATT</th>
          </tr>
        </thead>
        <tbody>
          {circuits.map((c) => {
            const breakerText = [c.breaker_type, c.breaker_rating]
              .filter(Boolean)
              .join(" ");
            return (
              <tr key={c.id} className={c.is_spare ? "text-neutral-400" : ""}>
                <td className="px-2 py-0.5 text-center">{c.circuit_no}</td>
                <td className="px-1 py-0.5">
                  {editing ? (
                    <CellInput
                      key={`f-${c.id}-${c.function_name}`}
                      initial={c.function_name}
                      onCommit={(v) =>
                        updateCircuit(c.id, { function_name: v || c.function_name })
                      }
                    />
                  ) : (
                    c.function_name
                  )}
                </td>
                <td className="px-1 py-0.5 text-center whitespace-nowrap">
                  {editing ? (
                    <CellInput
                      key={`b-${c.id}-${breakerText}`}
                      initial={breakerText}
                      onCommit={(v) => {
                        // "MCB 1P 20A" -> type = semua kecuali token terakhir, rating = token terakhir
                        const parts = v.split(/\s+/).filter(Boolean);
                        const rating =
                          parts.length > 1 && /\d/.test(parts[parts.length - 1])
                            ? parts.pop()!
                            : null;
                        updateCircuit(c.id, {
                          breaker_type: parts.join(" ") || null,
                          breaker_rating: rating,
                        });
                      }}
                    />
                  ) : (
                    breakerText
                  )}
                </td>
                <td className="px-1 py-0.5 text-center whitespace-nowrap">
                  {editing ? (
                    <CellInput
                      key={`k-${c.id}-${c.outgoing_cable ?? ""}`}
                      initial={c.outgoing_cable ?? ""}
                      onCommit={(v) =>
                        updateCircuit(c.id, { outgoing_cable: v || null })
                      }
                    />
                  ) : (
                    c.outgoing_cable
                  )}
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
            );
          })}
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
