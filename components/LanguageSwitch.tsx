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
      className={`no-print inline-flex overflow-hidden rounded border border-neutral-300 ${className}`}
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
          className={`px-2 py-0.5 text-[11px] font-semibold transition ${
            lang === opt.code
              ? "bg-blue-600 text-white"
              : "bg-white text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
