"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useI18n } from "@/lib/i18n";
import LanguageSwitch from "@/components/LanguageSwitch";
import BrandMark, { BrandIcon } from "@/components/BrandMark";

function LoginForm() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) setError(error.message);
    setBusy(false);
  }

  const inputCls =
    "mb-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      {/* dekorasi latar: grid tipis gaya kertas gambar */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(#cbd5e1_1px,transparent_1px),linear-gradient(90deg,#cbd5e1_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandIcon className="h-12 w-12" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
            Panel Schedule
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t(
              "Masuk untuk melihat schedule & SLD panel",
              "Sign in to view panel schedules & SLDs"
            )}
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-xl shadow-slate-900/5 backdrop-blur"
        >
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="nama@perusahaan.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />

          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            {t("Kata sandi", "Password")}
          </label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
          />

          {error && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/30 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/30 disabled:opacity-50"
          >
            {busy ? t("Masuk…", "Signing in…") : t("Masuk", "Sign in")}
          </button>
        </form>

        <div className="mt-5 flex justify-center">
          <LanguageSwitch />
        </div>
      </div>
    </main>
  );
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 text-sm text-slate-500">
        <BrandIcon className="h-10 w-10 animate-pulse" />
        {t("Memuat…", "Loading…")}
      </main>
    );
  }

  if (!session) return <LoginForm />;

  return (
    <>
      <header className="no-print sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[2400px] items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <BrandMark subtitle={t("Schedule & SLD dari Revit", "Schedules & SLDs from Revit")} />
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageSwitch />
            <span className="hidden items-center gap-2 text-xs text-slate-600 sm:flex">
              <span
                aria-hidden
                className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold uppercase text-slate-600 ring-1 ring-slate-200"
              >
                {session.user.email?.[0] ?? "?"}
              </span>
              <span className="max-w-[180px] truncate">{session.user.email}</span>
            </span>
            <button
              onClick={() => supabase.auth.signOut()}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            >
              {t("Keluar", "Sign out")}
            </button>
          </div>
        </div>
      </header>
      {children}
    </>
  );
}
