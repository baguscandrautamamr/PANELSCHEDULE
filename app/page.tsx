"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isClockSkewError, supabase, withClockSkewRetry } from "@/lib/supabase";
import { Rich, useI18n } from "@/lib/i18n";
import type { Panel, Project } from "@/lib/types";
import { BrandIcon } from "@/components/BrandMark";

export default function Home() {
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // error terakhir berupa clock skew PGRST303 — petunjuk yang ditampilkan beda
  const [clockSkew, setClockSkew] = useState(false);

  async function load() {
    const [{ data: pr, error: e1 }, { data: pa, error: e2 }] =
      await withClockSkewRetry(
        () =>
          Promise.all([
            supabase.from("projects").select("*").order("name"),
            supabase.from("panels").select("*").order("panel_code"),
          ]),
        ([a, b]) => a.error ?? b.error
      );
    if (e1 || e2) {
      setError((e1 ?? e2)!.message);
      setClockSkew(isClockSkewError(e1 ?? e2));
    } else {
      setProjects(pr ?? []);
      setPanels(pa ?? []);
      setError(null);
      setClockSkew(false);
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

  const visibleProjects = projects.filter(
    (proj) => selectedProject === "all" || proj.id === selectedProject
  );
  const visiblePanelCount = panels.filter((p) =>
    visibleProjects.some((proj) => proj.id === p.project_id)
  ).length;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            {t("Tersinkron realtime dari Revit", "Synced live from Revit")}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Panel Schedule
          </h1>
          <p className="mt-2 max-w-xl text-sm text-slate-500 sm:text-base">
            {t(
              "Realtime dari Revit — klik panel untuk lihat schedule + SLD",
              "Realtime from Revit — click a panel to see its schedule + SLD"
            )}
          </p>
        </div>

        {projects.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-2 text-center max-sm:w-full">
              <Stat value={visibleProjects.length} label={t("Project", "Projects")} />
              <Stat value={visiblePanelCount} label="Panel" />
            </div>
            <label className="relative max-sm:w-full">
              <span className="sr-only">Project</span>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="h-[58px] w-full min-w-[200px] appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15"
              >
                <option value="all">{t("Semua project", "All projects")}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <svg
                aria-hidden
                viewBox="0 0 20 20"
                fill="currentColor"
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                  clipRule="evenodd"
                />
              </svg>
            </label>
          </div>
        )}
      </header>

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy>
          <span className="sr-only">{t("Memuat data…", "Loading data…")}</span>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[132px] animate-pulse rounded-2xl border border-slate-200 bg-white/70"
            />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50/80 p-5 text-sm text-red-800 shadow-sm">
          <p className="font-semibold">
            {t("Gagal memuat data", "Could not load data")}
          </p>
          <p className="mt-1 text-red-700/90">{error}</p>
          <p className="mt-2">
            <Rich
              text={
                clockSkew
                  ? t(
                      "Jam server Supabase sedang tidak sinkron, jadi token login dianggap terbit di masa depan (`PGRST303`). Bukan masalah data — coba **muat ulang** halaman beberapa detik lagi.",
                      "The Supabase server clocks are out of sync, so your login token looks like it was issued in the future (`PGRST303`). Nothing is wrong with your data — **reload** the page in a few seconds."
                    )
                  : t(
                      "Kalau tabel belum ada, jalankan `supabase/schema.sql` (lalu `supabase/seed.sql`) di Supabase SQL Editor.",
                      "If the tables don't exist yet, run `supabase/schema.sql` (then `supabase/seed.sql`) in the Supabase SQL Editor."
                    )
              }
            />
          </p>
          <button
            onClick={() => {
              setLoading(true);
              load();
            }}
            className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 shadow-sm transition hover:bg-red-100"
          >
            {t("Coba lagi", "Try again")}
          </button>
        </div>
      )}

      {!loading && !error && panels.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-600">
          <BrandIcon className="mx-auto mb-3 h-10 w-10 opacity-80" />
          <Rich
            text={t(
              "Belum ada panel. Jalankan `supabase/seed.sql` untuk data contoh, atau push dari Revit add-in.",
              "No panels yet. Run `supabase/seed.sql` for sample data, or push from the Revit add-in."
            )}
          />
        </div>
      )}

      <div className="space-y-10">
        {visibleProjects.map((proj) => {
          const list = panels.filter((p) => p.project_id === proj.id);
          if (list.length === 0) return null;
          return (
            <section key={proj.id}>
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white"
                  >
                    {proj.name.trim()[0]?.toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold tracking-tight text-slate-900">
                      {proj.name}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {proj.client && <>{proj.client} · </>}
                      {list.length} panel
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => deleteProject(proj)}
                  title={t(
                    `Hapus project ${proj.name}`,
                    `Delete project ${proj.name}`
                  )}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                >
                  <TrashIcon />
                  <span className="hidden sm:inline">
                    {t("Hapus project", "Delete project")}
                  </span>
                </button>
              </div>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((panel) => (
                  <li key={panel.id} className="group relative">
                    <Link
                      href={`/panel/${panel.id}`}
                      className="block h-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.03] transition duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-900/[0.07] focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-lg font-semibold tracking-tight text-slate-900">
                            {panel.panel_code}
                          </div>
                          <div className="mt-0.5 truncate text-sm text-slate-500">
                            {panel.location || "—"}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          {panel.ip_rating && (
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                              {panel.ip_rating}
                            </span>
                          )}
                          {panel.symbol_tag && (
                            <span className="rounded-md bg-blue-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
                              {panel.symbol_tag}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                        <div className="flex flex-wrap gap-1.5 text-[11px] font-medium text-slate-500">
                          {[panel.voltage, panel.phase, panel.wire, panel.freq]
                            .filter(Boolean)
                            .map((v, i) => (
                              <span key={i} className="rounded bg-slate-50 px-1.5 py-0.5 ring-1 ring-inset ring-slate-200">
                                {v}
                              </span>
                            ))}
                        </div>
                        <span className="mr-8 flex items-center gap-1 text-xs font-semibold text-blue-600 opacity-0 transition group-hover:opacity-100">
                          {t("Buka", "Open")}
                          <span aria-hidden>→</span>
                        </span>
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
                      aria-label={t(
                        `Hapus panel ${panel.panel_code}`,
                        `Delete panel ${panel.panel_code}`
                      )}
                      className="absolute bottom-3.5 right-3.5 z-10 rounded-lg p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                    >
                      <TrashIcon />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <footer className="mt-16 flex flex-col items-center justify-between gap-2 border-t border-slate-200 pt-5 text-xs text-slate-400 sm:flex-row">
        <span>© {new Date().getFullYear()} Panel Schedule</span>
        <span>
          {t(
            "Schedule, SLD, dan export Excel / PDF / DXF",
            "Schedules, SLDs, and Excel / PDF / DXF export"
          )}
        </span>
      </footer>
    </main>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-[76px] rounded-xl max-sm:flex-1 border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-lg font-semibold leading-tight tabular-nums text-slate-900">
        {value}
      </div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path
        fillRule="evenodd"
        d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.44c-.8.08-1.58.17-2.36.29a.75.75 0 1 0 .22 1.49l.15-.03.83 10.42A2.75 2.75 0 0 0 7.58 19h4.84a2.75 2.75 0 0 0 2.74-2.64l.83-10.42.15.03a.75.75 0 1 0 .22-1.49A41 41 0 0 0 14 4.19v-.44A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.67.03 2.5.08v-.33c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.33C8.33 4.03 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
