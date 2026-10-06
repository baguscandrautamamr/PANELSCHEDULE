"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase, withClockSkewRetry } from "@/lib/supabase";
import { useI18n } from "@/lib/i18n";
import type { Circuit, Panel } from "@/lib/types";
import PanelScheduleTable from "@/components/PanelScheduleTable";
import HorizontalScroller from "@/components/HorizontalScroller";

export default function PanelPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const load = useCallback(async () => {
    const [{ data: p, error: e1 }, { data: c, error: e2 }] =
      await withClockSkewRetry(
        () =>
          Promise.all([
            supabase.from("panels").select("*").eq("id", id).single(),
            supabase
              .from("circuits")
              .select("*, circuit_fixtures(*)")
              .eq("panel_id", id)
              .order("circuit_no"),
          ]),
        ([a, b]) => a.error ?? b.error
      );
    if (e1 || e2) setError((e1 ?? e2)!.message);
    else {
      setPanel(p);
      // circuit_no negatif = circuit Revit yang dihapus lewat website, menunggu
      // di-disconnect oleh "Pull from Website" — jangan ditampilkan/dihitung
      setCircuits(((c ?? []) as Circuit[]).filter((row) => row.circuit_no > 0));
      setError(null);
      if (p?.project_id) {
        const { data: proj } = await supabase
          .from("projects")
          .select("name")
          .eq("id", p.project_id)
          .single();
        setProjectName(proj?.name ?? null);
      } else {
        setProjectName(null);
      }
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    load();
    const channel = supabase
      .channel(`panel-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "panels", filter: `id=eq.${id}` },
        () => load()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "circuits",
          filter: `panel_id=eq.${id}`,
        },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "circuit_fixtures" },
        () => load()
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, load]);

  // Lebar penuh layar (dibatasi hanya di monitor sangat lebar): tabel schedule
  // + kolom fixture dinamis butuh ruang sebanyak mungkin.
  return (
    <main className="mx-auto w-full max-w-[2400px] p-3 sm:p-6">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-900 hover:shadow-sm"
        >
          <span aria-hidden>←</span> {t("Semua panel", "All panels")}
        </Link>
        <div className="flex items-center gap-3">
          <span
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
              live
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-400"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                live ? "bg-emerald-500" : "bg-slate-300"
              }`}
            />
            {live
              ? t("Realtime aktif", "Realtime active")
              : t("Menghubungkan…", "Connecting…")}
          </span>
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-blue-600/30 transition hover:bg-blue-700"
          >
            🖨 Print / Export PDF
          </button>
        </div>
      </div>

      {loading && (
        <div className="h-[420px] animate-pulse rounded-2xl border border-slate-200 bg-white/70">
          <span className="sr-only">{t("Memuat panel…", "Loading panel…")}</span>
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50/80 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {panel && (
        <div className="print-area rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.04] sm:p-5">
          <HorizontalScroller>
            <PanelScheduleTable
              panel={panel}
              circuits={circuits}
              projectName={projectName}
            />
          </HorizontalScroller>
        </div>
      )}
    </main>
  );
}

