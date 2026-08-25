"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase, withClockSkewRetry } from "@/lib/supabase";
import { useI18n } from "@/lib/i18n";
import type { Circuit, Panel } from "@/lib/types";
import PanelScheduleTable from "@/components/PanelScheduleTable";
import PanelSLD from "@/components/PanelSLD";

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
    <main className="mx-auto w-full max-w-[2400px] p-3 sm:p-4">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/" className="text-sm text-blue-700 hover:underline">
          ← {t("Semua panel", "All panels")}
        </Link>
        <div className="flex items-center gap-3">
          <span
            className={`flex items-center gap-1.5 text-xs ${
              live ? "text-green-700" : "text-neutral-400"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                live ? "bg-green-500" : "bg-neutral-300"
              }`}
            />
            {live
              ? t("Realtime aktif", "Realtime active")
              : t("Menghubungkan…", "Connecting…")}
          </span>
          <button
            onClick={() => window.print()}
            className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:border-blue-500"
          >
            🖨 Print / Export PDF
          </button>
        </div>
      </div>

      {loading && (
        <p className="text-neutral-500">{t("Memuat panel…", "Loading panel…")}</p>
      )}
      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {panel && (
        <div className="print-area rounded-lg border border-neutral-300 bg-white p-4 shadow-sm">
          <div className="print-sld mb-4 max-w-3xl border-b border-neutral-200 pb-3">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-neutral-500">
              Single Line Diagram
            </h2>
            <PanelSLD panel={panel} />
          </div>

          <div className="overflow-x-auto">
            <PanelScheduleTable
              panel={panel}
              circuits={circuits}
              projectName={projectName}
            />
          </div>
        </div>
      )}
    </main>
  );
}
