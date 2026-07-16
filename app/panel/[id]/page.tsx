"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Circuit, Panel } from "@/lib/types";
import PanelScheduleTable from "@/components/PanelScheduleTable";
import PanelSLD from "@/components/PanelSLD";

export default function PanelPage() {
  const { id } = useParams<{ id: string }>();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const load = useCallback(async () => {
    const [{ data: p, error: e1 }, { data: c, error: e2 }] = await Promise.all(
      [
        supabase.from("panels").select("*").eq("id", id).single(),
        supabase
          .from("circuits")
          .select("*, circuit_fixtures(*)")
          .eq("panel_id", id)
          .order("circuit_no"),
      ]
    );
    if (e1 || e2) setError((e1 ?? e2)!.message);
    else {
      setPanel(p);
      setCircuits((c ?? []) as Circuit[]);
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

  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/" className="text-sm text-blue-700 hover:underline">
          ← Semua panel
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
            {live ? "Realtime aktif" : "Menghubungkan…"}
          </span>
          <button
            onClick={() => window.print()}
            className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:border-blue-500"
          >
            🖨 Print / Export PDF
          </button>
        </div>
      </div>

      {loading && <p className="text-neutral-500">Memuat panel…</p>}
      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {panel && (
        <div className="print-area rounded-lg border border-neutral-300 bg-white p-4 shadow-sm">
          <div className="mb-4 max-w-xl border-b border-neutral-200 pb-3">
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
