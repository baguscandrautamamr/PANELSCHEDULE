"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useI18n } from "@/lib/i18n";
import LanguageSwitch from "@/components/LanguageSwitch";

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

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-lg border border-neutral-300 bg-white p-6 shadow-sm"
      >
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">Panel Schedule</h1>
          <LanguageSwitch />
        </div>

        <label className="mb-1 block text-sm font-medium">Email</label>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />

        <label className="mb-1 block text-sm font-medium">
          {t("Kata sandi", "Password")}
        </label>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />

        {error && (
          <p className="mb-4 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-blue-600 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? t("Masuk…", "Signing in…") : t("Masuk", "Sign in")}
        </button>
      </form>
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
      <main className="flex min-h-screen items-center justify-center text-sm text-neutral-500">
        {t("Memuat…", "Loading…")}
      </main>
    );
  }

  if (!session) return <LoginForm />;

  return (
    <>
      <div className="no-print flex items-center justify-end gap-3 border-b border-neutral-200 bg-white px-4 py-1.5 text-xs text-neutral-600">
        <LanguageSwitch />
        <span>{session.user.email}</span>
        <button
          onClick={() => supabase.auth.signOut()}
          className="rounded border border-neutral-300 px-2 py-0.5 transition hover:bg-neutral-100"
        >
          {t("Keluar", "Sign out")}
        </button>
      </div>
      {children}
    </>
  );
}
