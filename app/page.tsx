"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Rich, useI18n } from "@/lib/i18n";
import type { Panel, Project } from "@/lib/types";

export default function Home() {
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [{ data: pr, error: e1 }, { data: pa, error: e2 }] =
      await Promise.all([
        supabase.from("projects").select("*").order("name"),
        supabase.from("panels").select("*").order("panel_code"),
      ]);
    if (e1 || e2) setError((e1 ?? e2)!.message);
    else {
      setProjects(pr ?? []);
      setPanels(pa ?? []);
      setError(null);
    }
    setLoading(false);
  }

  const deleteFailed = (msg: string) =>
    t(`Gagal menghapus: ${msg}`, `Failed to delete: ${msg}`);

  async function deleteProject(proj: Project) {
    if (
      !confirm(
        t(
          `Hapus project "${proj.name}" beserta SEMUA panel & circuit di dalamnya? Tidak bisa dibatalkan.`,
          `Delete project "${proj.name}" along with ALL panels & circuits inside it? This cannot be undone.`
        )
      )
    )
      return;
    // panels -> circuits -> fixtures cascade; project_id tidak cascade, jadi hapus panel dulu
    const { error: e1 } = await supabase
      .from("panels")
      .delete()
      .eq("project_id", proj.id);
    const { error: e2 } = e1
      ? { error: e1 }
      : await supabase.from("projects").delete().eq("id", proj.id);
    if (e1 || e2) alert(deleteFailed((e1 ?? e2)!.message));
    else load();
  }

  async function deletePanel(panel: Panel) {
    if (
      !confirm(
        t(
          `Hapus panel "${panel.panel_code}" beserta semua circuit-nya? Tidak bisa dibatalkan.`,
          `Delete panel "${panel.panel_code}" along with all of its circuits? This cannot be undone.`
        )
      )
    )
      return;
    const { error } = await supabase.from("panels").delete().eq("id", panel.id);
    if (error) alert(deleteFailed(error.message));
    else load();
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    load();
    const channel = supabase
      .channel("home")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "panels" },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <main className="mx-auto w-full max-w-4xl p-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Panel Schedule</h1>
        <p className="text-sm text-neutral-600">
          {t(
            "Realtime dari Revit via Supabase — klik panel untuk lihat schedule + SLD",
            "Realtime from Revit via Supabase — click a panel to see its schedule + SLD"
          )}
        </p>
        {projects.length > 0 && (
          <div className="mt-4">
            <label className="mr-2 text-sm text-neutral-600">Project:</label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="all">{t("Semua project", "All projects")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      {loading && (
        <p className="text-neutral-500">{t("Memuat data…", "Loading data…")}</p>
      )}

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">
            {t("Gagal koneksi ke Supabase", "Could not connect to Supabase")}
          </p>
          <p className="mt-1">{error}</p>
          <p className="mt-2">
            <Rich
              text={t(
                "Kalau tabel belum ada, jalankan `supabase/schema.sql` (lalu `supabase/seed.sql`) di Supabase SQL Editor.",
                "If the tables don't exist yet, run `supabase/schema.sql` (then `supabase/seed.sql`) in the Supabase SQL Editor."
              )}
            />
          </p>
        </div>
      )}

      {!loading && !error && panels.length === 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <Rich
            text={t(
              "Belum ada panel. Jalankan `supabase/seed.sql` untuk data contoh, atau push dari Revit add-in.",
              "No panels yet. Run `supabase/seed.sql` for sample data, or push from the Revit add-in."
            )}
          />
        </div>
      )}

      {projects
        .filter((proj) => selectedProject === "all" || proj.id === selectedProject)
        .map((proj) => {
        const list = panels.filter((p) => p.project_id === proj.id);
        if (list.length === 0) return null;
        return (
          <section key={proj.id} className="mb-8">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">
                {proj.name}
                {proj.client && (
                  <span className="ml-2 text-sm font-normal text-neutral-500">
                    {proj.client}
                  </span>
                )}
              </h2>
              <button
                onClick={() => deleteProject(proj)}
                title={t(
                  `Hapus project ${proj.name}`,
                  `Delete project ${proj.name}`
                )}
                className="rounded border border-red-200 bg-white px-2.5 py-1 text-xs text-red-600 transition hover:border-red-500 hover:bg-red-50"
              >
                🗑 {t("Hapus project", "Delete project")}
              </button>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {list.map((panel) => (
                <li key={panel.id} className="relative">
                  <Link
                    href={`/panel/${panel.id}`}
                    className="block rounded-lg border border-neutral-300 bg-white p-4 pr-9 shadow-sm transition hover:border-blue-500 hover:shadow"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-bold">
                        {panel.panel_code}
                        {panel.ip_rating && ` (${panel.ip_rating})`}
                      </span>
                      {panel.symbol_tag && (
                        <span className="rounded border border-neutral-400 px-2 py-0.5 text-xs font-mono">
                          {panel.symbol_tag}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-neutral-600">
                      {panel.location}
                    </div>
                    <div className="mt-2 text-xs text-neutral-500">
                      {panel.voltage} · {panel.phase} · {panel.wire} ·{" "}
                      {panel.freq}
                    </div>
                  </Link>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      deletePanel(panel);
                    }}
                    title={t(
                      `Hapus panel ${panel.panel_code}`,
                      `Delete panel ${panel.panel_code}`
                    )}
                    className="absolute bottom-3 right-3 z-10 rounded border border-red-200 bg-white px-1.5 py-1 text-xs text-red-500 transition hover:border-red-500 hover:bg-red-50 hover:text-red-700"
                  >
                    🗑
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <footer className="mt-12 border-t border-neutral-300 pt-4 text-xs text-neutral-500">
        {t(
          "Fase 1 — tabel + SLD realtime. Berikutnya: export Excel / PDF / DXF.",
          "Phase 1 — realtime table + SLD. Next: Excel / PDF / DXF export."
        )}
      </footer>
    </main>
  );
}
