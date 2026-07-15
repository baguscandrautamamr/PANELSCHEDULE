"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Panel, Project } from "@/lib/types";

export default function Home() {
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
          Realtime dari Revit via Supabase — klik panel untuk lihat schedule +
          SLD
        </p>
        {projects.length > 0 && (
          <div className="mt-4">
            <label className="mr-2 text-sm text-neutral-600">Project:</label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="all">Semua project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      {loading && <p className="text-neutral-500">Memuat data…</p>}

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Gagal koneksi ke Supabase</p>
          <p className="mt-1">{error}</p>
          <p className="mt-2">
            Kalau tabel belum ada, jalankan <code>supabase/schema.sql</code>{" "}
            (lalu <code>supabase/seed.sql</code>) di Supabase SQL Editor.
          </p>
        </div>
      )}

      {!loading && !error && panels.length === 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Belum ada panel. Jalankan <code>supabase/seed.sql</code> untuk data
          contoh, atau push dari Revit add-in.
        </div>
      )}

      {projects
        .filter((proj) => selectedProject === "all" || proj.id === selectedProject)
        .map((proj) => {
        const list = panels.filter((p) => p.project_id === proj.id);
        if (list.length === 0) return null;
        return (
          <section key={proj.id} className="mb-8">
            <h2 className="mb-3 text-lg font-semibold">
              {proj.name}
              {proj.client && (
                <span className="ml-2 text-sm font-normal text-neutral-500">
                  {proj.client}
                </span>
              )}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {list.map((panel) => (
                <li key={panel.id}>
                  <Link
                    href={`/panel/${panel.id}`}
                    className="block rounded-lg border border-neutral-300 bg-white p-4 shadow-sm transition hover:border-blue-500 hover:shadow"
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
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <footer className="mt-12 border-t border-neutral-300 pt-4 text-xs text-neutral-500">
        Fase 1 — tabel + SLD realtime. Berikutnya: export Excel / PDF / DXF.
      </footer>
    </main>
  );
}
