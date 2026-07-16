"use client";

import { useState } from "react";
import type { Circuit, Panel } from "@/lib/types";
import { fixtureKey } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { exportPanelToExcel } from "@/lib/exportExcel";

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

/**
 * Cabang SLD per baris — bus vertikal + breaker + panah keluar, digambar
 * di dalam <td> baris circuit itu sendiri (bukan diagram terpisah) supaya
 * SELALU sejajar dengan baris circuit-nya, walau tingginya beda-beda
 * (mis. FUNCTION yang wrap 2 baris). Posisi absolute + inset-0 dipakai
 * karena <td> tinggi barisnya "auto", bukan persentase yang bisa dipetakan.
 */
function MiniCircuitBranch({
  breakerType,
  dim,
}: {
  breakerType: string | null;
  dim: boolean;
}) {
  const t = (breakerType ?? "").toUpperCase();
  const isMccb = t.includes("MCCB");
  const isRcbo = t.includes("RCBO");
  return (
    <div className="pointer-events-none absolute inset-0">
      <svg
        viewBox="0 0 40 100"
        preserveAspectRatio="none"
        className={`h-full w-full text-neutral-700 ${dim ? "opacity-30" : ""}`}
      >
        <g stroke="currentColor" strokeWidth={3} fill="none" vectorEffect="non-scaling-stroke">
          <line x1={8} y1={0} x2={8} y2={100} />
          <line x1={8} y1={50} x2={24} y2={50} />
          {isMccb && <rect x={10} y={40} width={12} height={20} />}
          {isRcbo && <circle cx={16} cy={50} r={6} />}
        </g>
        <polygon points="24,44 34,50 24,56" fill="currentColor" />
      </svg>
    </div>
  );
}

const emptyNewCircuit = {
  function_name: "",
  breaker_type: "MCB 1P",
  breaker_rating: "10A",
  outgoing_cable: "",
  watt: "",
  phase: "R" as "R" | "S" | "T" | "3PH",
  remarks: "",
};

/** Ambil watt total + fase dari circuit yang ada — buat prefill form edit. */
function deriveWattPhase(c: Circuit): { watt: string; phase: "R" | "S" | "T" | "3PH" } {
  const r = Number(c.phase_r || 0);
  const s = Number(c.phase_s || 0);
  const t = Number(c.phase_t || 0);
  const nonZero = [r, s, t].filter((v) => v > 0).length;
  if (nonZero >= 2) return { watt: String(Math.round((r + s + t) * 10) / 10), phase: "3PH" };
  if (r > 0) return { watt: String(r), phase: "R" };
  if (s > 0) return { watt: String(s), phase: "S" };
  if (t > 0) return { watt: String(t), phase: "T" };
  return { watt: "", phase: "R" };
}

export default function PanelScheduleTable({
  panel,
  circuits,
  projectName,
}: {
  panel: Panel;
  circuits: Circuit[];
  projectName?: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newCircuit, setNewCircuit] = useState(emptyNewCircuit);
  const [exporting, setExporting] = useState(false);
  const cols = buildFixtureColumns(circuits);

  async function updateCircuit(id: string, patch: Record<string, string | null>) {
    const { error } = await supabase.from("circuits").update(patch).eq("id", id);
    if (error) alert(`Gagal menyimpan: ${error.message}`);
  }

  /// Tukar circuit_no dua circuit lewat nilai sementara supaya tidak
  /// menabrak unique constraint (panel_id, circuit_no) saat swap.
  async function moveCircuit(index: number, direction: -1 | 1) {
    const other = index + direction;
    if (other < 0 || other >= circuits.length) return;
    const a = circuits[index];
    const b = circuits[other];
    const aOrig = a.circuit_no;
    const bOrig = b.circuit_no;
    const temp = -Math.abs(aOrig) - 100000;

    const { error: e1 } = await supabase
      .from("circuits")
      .update({ circuit_no: temp })
      .eq("id", a.id);
    const { error: e2 } = e1
      ? { error: e1 }
      : await supabase.from("circuits").update({ circuit_no: aOrig }).eq("id", b.id);
    const { error: e3 } = e1 || e2
      ? { error: e1 ?? e2 }
      : await supabase.from("circuits").update({ circuit_no: bOrig }).eq("id", a.id);

    const err = e1 ?? e2 ?? e3;
    if (err) alert(`Gagal memindahkan urutan: ${err.message}`);
  }

  /// Rebalance web-only: redistribusi circuit 1-fase ke R/S/T yang paling
  /// ringan (greedy, mirip niat "Rebalance Loads" di Revit). Circuit 3-fase
  /// (sudah balanced) tidak diubah. Push berikutnya dari Revit akan menimpa
  /// hasil ini sesuai kondisi model asli.
  async function rebalanceLoads() {
    if (
      !confirm(
        "Hitung ulang pembagian fase R/S/T untuk semua circuit 1-fase di panel ini? Circuit 3-fase tidak berubah."
      )
    )
      return;

    const totals = { R: 0, S: 0, T: 0 };
    const singlePhase: { id: string; watt: number }[] = [];

    for (const c of circuits) {
      if (c.is_spare) continue;
      const r = Number(c.phase_r || 0);
      const s = Number(c.phase_s || 0);
      const t = Number(c.phase_t || 0);
      const nonZero = [r, s, t].filter((v) => v > 0).length;
      if (nonZero >= 2) {
        totals.R += r;
        totals.S += s;
        totals.T += t;
      } else if (nonZero === 1) {
        singlePhase.push({ id: c.id, watt: r || s || t });
      }
    }

    singlePhase.sort((a, b) => b.watt - a.watt);
    const assignment: Record<string, "R" | "S" | "T"> = {};
    for (const item of singlePhase) {
      const phase = (["R", "S", "T"] as const).reduce((min, p) =>
        totals[p] < totals[min] ? p : min
      , "R" as "R" | "S" | "T");
      totals[phase] += item.watt;
      assignment[item.id] = phase;
    }

    for (const item of singlePhase) {
      const phase = assignment[item.id];
      const { error } = await supabase
        .from("circuits")
        .update({
          phase_r: phase === "R" ? item.watt : 0,
          phase_s: phase === "S" ? item.watt : 0,
          phase_t: phase === "T" ? item.watt : 0,
        })
        .eq("id", item.id);
      if (error) {
        alert(`Gagal rebalance: ${error.message}`);
        return;
      }
    }
  }

  /// Rapatkan nomor load manual supaya berurutan tepat setelah circuit Revit
  /// terakhir (mengisi celah yang ditinggal baris yang dihapus). Dua fase
  /// lewat nomor sementara besar supaya tidak menabrak unique constraint.
  async function compactManualNumbers(excludeId: string) {
    const visible = circuits.filter((c) => c.circuit_no > 0 && c.id !== excludeId);
    const maxRevit = visible
      .filter((c) => c.source !== "manual")
      .reduce((m, c) => Math.max(m, c.circuit_no), 0);
    const moves = visible
      .filter((c) => c.source === "manual")
      .sort((a, b) => a.circuit_no - b.circuit_no)
      .map((c, i) => ({ c, to: maxRevit + 1 + i }))
      .filter(({ c, to }) => c.circuit_no !== to);

    for (const { c, to } of moves) {
      const { error } = await supabase
        .from("circuits")
        .update({ circuit_no: to + 100000 })
        .eq("id", c.id);
      if (error) {
        alert(`Gagal merapikan nomor: ${error.message}`);
        return;
      }
    }
    for (const { c, to } of moves) {
      const { error } = await supabase
        .from("circuits")
        .update({ circuit_no: to })
        .eq("id", c.id);
      if (error) {
        alert(`Gagal merapikan nomor: ${error.message}`);
        return;
      }
    }
  }

  async function deleteCircuit(c: Circuit) {
    const isManual = c.source === "manual";
    const msg = isManual
      ? `Hapus load manual "${c.function_name}" (no. ${c.circuit_no})?`
      : `Hapus circuit ${c.circuit_no} "${c.function_name}"?\n\n` +
        `Circuit ini milik Revit — dia akan di-DISCONNECT dari panel saat ` +
        `"Pull from Website" dijalankan di Revit. Kalau Push to Website ` +
        `dijalankan lagi SEBELUM Pull, circuit ini muncul kembali.`;
    if (!confirm(msg)) return;

    // baris manual dihapus langsung; baris Revit ditandai dengan nomor negatif
    // (tombstone) supaya Pull di Revit tahu circuit mana yang harus di-disconnect
    const { error } = isManual
      ? await supabase.from("circuits").delete().eq("id", c.id)
      : await supabase
          .from("circuits")
          .update({ circuit_no: -c.circuit_no })
          .eq("id", c.id);
    if (error) {
      alert(`Gagal menghapus: ${error.message}`);
      return;
    }
    await compactManualNumbers(c.id);
  }

  function openAddForm() {
    setEditingId(null);
    setNewCircuit(emptyNewCircuit);
    setShowAdd(true);
  }

  function openEditForm(c: Circuit) {
    const { watt, phase } = deriveWattPhase(c);
    setNewCircuit({
      function_name: c.function_name,
      breaker_type: c.breaker_type ?? "MCB 1P",
      breaker_rating: c.breaker_rating ?? "",
      outgoing_cable: c.outgoing_cable ?? "",
      watt,
      phase,
      remarks: c.remarks ?? "",
    });
    setEditingId(c.id);
    setShowAdd(true);
  }

  function closeForm() {
    setShowAdd(false);
    setEditingId(null);
    setNewCircuit(emptyNewCircuit);
  }

  async function submitCircuitForm() {
    if (!newCircuit.function_name.trim()) {
      alert("Nama FUNCTION wajib diisi.");
      return;
    }
    const watt = parseFloat(newCircuit.watt) || 0;

    const patch: Record<string, string | number | boolean | null> = {
      function_name: newCircuit.function_name.trim(),
      breaker_type: newCircuit.breaker_type || null,
      breaker_rating: newCircuit.breaker_rating || null,
      outgoing_cable: newCircuit.outgoing_cable || null,
      remarks: newCircuit.remarks || null,
      phase_r: 0,
      phase_s: 0,
      phase_t: 0,
    };
    if (newCircuit.phase === "3PH") {
      const per = Math.round((watt / 3) * 10) / 10;
      patch.phase_r = per;
      patch.phase_s = per;
      patch.phase_t = per;
    } else {
      patch[`phase_${newCircuit.phase.toLowerCase()}`] = watt;
    }

    if (editingId) {
      const { error } = await supabase.from("circuits").update(patch).eq("id", editingId);
      if (error) {
        alert(`Gagal menyimpan perubahan: ${error.message}`);
        return;
      }
    } else {
      const nextNo =
        circuits.length > 0 ? Math.max(...circuits.map((c) => c.circuit_no)) + 1 : 1;
      const { error } = await supabase
        .from("circuits")
        .insert({
          ...patch,
          panel_id: panel.id,
          circuit_no: nextNo,
          is_spare: false,
          source: "manual",
        });
      if (error) {
        alert(`Gagal menambah load: ${error.message}`);
        return;
      }
    }
    closeForm();
  }

  async function handleExportExcel() {
    setExporting(true);
    try {
      await exportPanelToExcel(panel, circuits, cols, projectName ?? null);
    } catch (e) {
      alert(`Gagal export Excel: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
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
          {projectName && (
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {projectName}
            </p>
          )}
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
          <div className="no-print flex flex-wrap items-center gap-2">
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
            <button
              onClick={rebalanceLoads}
              className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:border-blue-500"
            >
              ⇅ Rebalance Loads
            </button>
            <button
              onClick={() => (showAdd ? closeForm() : openAddForm())}
              className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:border-blue-500"
            >
              {showAdd ? "✕ Batal" : "+ Tambah Load"}
            </button>
            <button
              onClick={handleExportExcel}
              disabled={exporting}
              className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:border-blue-500 disabled:opacity-50"
            >
              {exporting ? "Menyiapkan…" : "📊 Export Excel"}
            </button>
          </div>
        </div>
      </div>

      {editing && (
        <p className="no-print mb-2 rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-800">
          Klik kolom FUNCTION / BREAKER / CABLE untuk mengubah cepat, tekan
          Enter atau klik di luar untuk menyimpan. Klik <b>✎</b> di kolom NO.
          untuk edit lengkap (termasuk WATT, FASE, REMARKS) lewat form. Panah
          ▲▼ untuk pindah urutan, <b>🗑</b> untuk hapus baris — load manual
          langsung terhapus (nomor manual lain naik mengisi celah); circuit
          Revit akan di-<b>disconnect</b> dari panel saat Pull from Website
          dijalankan (Push sebelum Pull membatalkan hapusnya). Jalankan{" "}
          <b>Pull from Website</b> di Revit
          add-in untuk menarik FUNCTION/BREAKER/CABLE ke model — kalau tidak
          berubah di Revit, parameternya read-only di family tersebut. Urutan
          (▲▼) dan hasil <b>Rebalance Loads</b> tersimpan di website saja;
          Push berikutnya dari Revit akan menimpa sesuai kondisi model asli —
          kecuali load manual (badge <b>M</b>) yang selalu dipertahankan;
          nomornya otomatis bergeser ke bawah kalau bentrok dengan circuit
          Revit baru.
        </p>
      )}

      {showAdd && (
        <div className="no-print mb-3 flex flex-wrap items-end gap-2 rounded border border-blue-200 bg-blue-50 p-3">
          <p className="w-full text-xs font-semibold text-blue-800">
            {editingId ? "Edit circuit" : "Tambah load baru"}
          </p>
          <label className="flex flex-col text-xs text-neutral-600">
            FUNCTION
            <input
              value={newCircuit.function_name}
              onChange={(e) =>
                setNewCircuit((s) => ({ ...s, function_name: e.target.value }))
              }
              className="rounded border border-neutral-300 px-2 py-1 text-xs"
              placeholder="mis. LIGHTING (L4-20)"
            />
          </label>
          <label className="flex flex-col text-xs text-neutral-600">
            BREAKER TYPE
            <select
              value={newCircuit.breaker_type}
              onChange={(e) =>
                setNewCircuit((s) => ({ ...s, breaker_type: e.target.value }))
              }
              className="rounded border border-neutral-300 px-2 py-1 text-xs"
            >
              {["MCB 1P", "MCB 3P", "MCCB 3P", "RCBO 2P", "RCBO 4P"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs text-neutral-600">
            RATING
            <input
              value={newCircuit.breaker_rating}
              onChange={(e) =>
                setNewCircuit((s) => ({ ...s, breaker_rating: e.target.value }))
              }
              className="w-16 rounded border border-neutral-300 px-2 py-1 text-xs"
              placeholder="10A"
            />
          </label>
          <label className="flex flex-col text-xs text-neutral-600">
            CABLE
            <input
              value={newCircuit.outgoing_cable}
              onChange={(e) =>
                setNewCircuit((s) => ({ ...s, outgoing_cable: e.target.value }))
              }
              className="w-32 rounded border border-neutral-300 px-2 py-1 text-xs"
              placeholder="NYM 3C x 2.5mm2"
            />
          </label>
          <label className="flex flex-col text-xs text-neutral-600">
            WATT
            <input
              type="number"
              value={newCircuit.watt}
              onChange={(e) => setNewCircuit((s) => ({ ...s, watt: e.target.value }))}
              className="w-20 rounded border border-neutral-300 px-2 py-1 text-xs"
              placeholder="360"
            />
          </label>
          <label className="flex flex-col text-xs text-neutral-600">
            FASE
            <select
              value={newCircuit.phase}
              onChange={(e) =>
                setNewCircuit((s) => ({
                  ...s,
                  phase: e.target.value as typeof newCircuit.phase,
                }))
              }
              className="rounded border border-neutral-300 px-2 py-1 text-xs"
            >
              <option value="R">R (1-fase)</option>
              <option value="S">S (1-fase)</option>
              <option value="T">T (1-fase)</option>
              <option value="3PH">3-fase (balance)</option>
            </select>
          </label>
          <label className="flex flex-col text-xs text-neutral-600">
            REMARKS
            <input
              value={newCircuit.remarks}
              onChange={(e) =>
                setNewCircuit((s) => ({ ...s, remarks: e.target.value }))
              }
              className="w-28 rounded border border-neutral-300 px-2 py-1 text-xs"
            />
          </label>
          <button
            onClick={submitCircuitForm}
            className="rounded border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
          >
            {editingId ? "Simpan perubahan" : "Tambah"}
          </button>
          <button
            onClick={closeForm}
            className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:border-neutral-400"
          >
            Batal
          </button>
        </div>
      )}

      <table className="sched-table w-full border-collapse text-xs">
        <thead>
          <tr className="bg-neutral-100">
            <th rowSpan={3} className="w-10 px-0 py-1 align-middle text-[9px] font-normal text-neutral-400">
              SLD
            </th>
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
          {circuits.map((c, idx) => {
            const breakerText = [c.breaker_type, c.breaker_rating]
              .filter(Boolean)
              .join(" ");
            return (
              <tr key={c.id} className={c.is_spare ? "text-neutral-400" : ""}>
                <td className="relative w-10 p-0">
                  <MiniCircuitBranch breakerType={c.breaker_type} dim={c.is_spare} />
                </td>
                <td className="px-1 py-0.5 text-center">
                  <div className="flex items-center justify-center gap-1">
                    {editing && (
                      <div className="no-print flex flex-col leading-none">
                        <button
                          disabled={idx === 0}
                          onClick={() => moveCircuit(idx, -1)}
                          title="Pindah naik"
                          className="text-[9px] text-neutral-400 hover:text-blue-600 disabled:opacity-20"
                        >
                          ▲
                        </button>
                        <button
                          disabled={idx === circuits.length - 1}
                          onClick={() => moveCircuit(idx, 1)}
                          title="Pindah turun"
                          className="text-[9px] text-neutral-400 hover:text-blue-600 disabled:opacity-20"
                        >
                          ▼
                        </button>
                      </div>
                    )}
                    <span>{c.circuit_no}</span>
                    {c.source === "manual" && (
                      <span
                        title="Load manual dari website — tidak ditimpa/dihapus saat Push dari Revit; nomornya bisa bergeser ke bawah kalau bentrok dengan circuit Revit baru"
                        className="rounded bg-amber-100 px-1 text-[9px] font-semibold text-amber-700"
                      >
                        M
                      </span>
                    )}
                    {editing && (
                      <>
                        <button
                          onClick={() => openEditForm(c)}
                          title="Edit lengkap circuit ini (termasuk watt, fase, remarks)"
                          className="no-print text-[10px] text-blue-500 hover:text-blue-700"
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => deleteCircuit(c)}
                          title={
                            c.source === "manual"
                              ? "Hapus load manual ini"
                              : "Hapus circuit ini — akan di-disconnect dari panel saat Pull from Website di Revit"
                          }
                          className="no-print text-[10px] text-red-400 hover:text-red-600"
                        >
                          🗑
                        </button>
                      </>
                    )}
                  </div>
                </td>
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
            <td colSpan={5} className="px-2 py-1 text-right">
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
            <td colSpan={5 + cols.length} className="px-2 py-1 text-right">
              SUB TOTAL
            </td>
            <td className="px-2 py-1 text-right">{nf.format(subR)}</td>
            <td className="px-2 py-1 text-right">{nf.format(subS)}</td>
            <td className="px-2 py-1 text-right">{nf.format(subT)}</td>
            <td className="px-2 py-1" />
          </tr>
          <tr className="bg-neutral-50">
            <td colSpan={5 + cols.length} className="px-2 py-1 text-right">
              TOTAL WATT
            </td>
            <td colSpan={3} className="px-2 py-1 text-center">
              {nf1.format(totalWatt)}
            </td>
            <td className="px-2 py-1" />
          </tr>
          <tr className="bg-neutral-50">
            <td colSpan={5 + cols.length} className="px-2 py-1 text-right">
              TOTAL VA
            </td>
            <td colSpan={3} className="px-2 py-1 text-center">
              {nf1.format(totalVA)}
            </td>
            <td className="px-2 py-1" />
          </tr>
          <tr className="bg-neutral-50">
            <td colSpan={5 + cols.length} className="px-2 py-1 text-right">
              CONNECTED AMPERE
            </td>
            <td colSpan={3} className="px-2 py-1 text-center">
              {nf1.format(ampere)}
            </td>
            <td className="px-2 py-1" />
          </tr>
        </tfoot>
      </table>

      <div className="mt-3 space-y-1 border-t border-neutral-200 pt-2 text-[11px] text-neutral-600">
        <p className="font-semibold text-neutral-700">Rumus perhitungan:</p>
        <p>
          TOTAL WATT = ΣR + ΣS + ΣT = {nf.format(subR)} + {nf.format(subS)} +{" "}
          {nf.format(subT)} = {nf1.format(totalWatt)} W
        </p>
        <p>
          TOTAL VA = TOTAL WATT / cos φ = {nf1.format(totalWatt)} / {pf} ={" "}
          {nf1.format(totalVA)} VA
        </p>
        <p>
          CONNECTED AMPERE = TOTAL VA / {is3ph ? "(√3 × V)" : "V"} ={" "}
          {nf1.format(totalVA)} / {is3ph ? `(1.732 × ${voltLL})` : "230"} ={" "}
          {nf1.format(ampere)} A
        </p>
      </div>
    </div>
  );
}
