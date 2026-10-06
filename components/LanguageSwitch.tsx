"use client";

import { useI18n, type Lang } from "@/lib/i18n";

const OPTIONS: { code: Lang; label: string; title: string }[] = [
  { code: "id", label: "ID", title: "Bahasa Indonesia" },
  { code: "en", label: "EN", title: "English" },
];

/** Pemilih bahasa ID / EN — pilihan tersimpan di browser. */
export default function LanguageSwitch({ className = "" }: { className?: string }) {
  const { lang, setLang } = useI18n();

  return (
    <div
      className={`no-print inline-flex rounded-lg bg-slate-100 p-0.5 ring-1 ring-slate-200 ${className}`}
      role="group"
      aria-label="Language"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.code}
          type="button"
          onClick={() => setLang(opt.code)}
          title={opt.title}
          aria-pressed={lang === opt.code}
          className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition ${
            lang === opt.code
              ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
