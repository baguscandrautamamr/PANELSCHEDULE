"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "id" | "en";

const STORAGE_KEY = "panelschedule:lang";

/**
 * Dual bahasa: teks Indonesia & English ditulis berpasangan langsung di
 * tempat pemakaiannya — `t("Semua project", "All projects")`. Tidak ada
 * tabel key terpisah supaya tidak ada key yatim saat teksnya diubah, dan
 * caranya sama persis dengan `L.T(...)` di add-in Revit.
 */
export type Translate = (id: string, en: string) => string;

export const makeT =
  (lang: Lang): Translate =>
  (id, en) =>
    lang === "en" ? en : id;

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Translate;
}

const I18nContext = createContext<I18nValue>({
  lang: "id",
  setLang: () => {},
  t: makeT("id"),
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Server render selalu "id" (sama dengan lang di <html>) supaya hidrasi
  // cocok; pilihan user / bahasa browser baru dipakai setelah mount.
  const [lang, setLangState] = useState<Lang>("id");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    // belum pernah memilih -> ikut bahasa browser (selain Indonesia = English)
    const initial: Lang =
      saved === "id" || saved === "en"
        ? saved
        : navigator.language?.toLowerCase().startsWith("id")
          ? "id"
          : "en";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preferensi bahasa baru bisa dibaca setelah mount
    if (initial !== "id") setLangState(initial);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // private mode / storage penuh — pilihan berlaku untuk sesi ini saja
    }
  }, []);

  const value = useMemo<I18nValue>(
    () => ({ lang, setLang, t: makeT(lang) }),
    [lang, setLang]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);

/**
 * Render teks terjemahan yang memuat penanda sederhana: `**tebal**` dan
 * `` `kode` ``. Dipakai supaya kalimat panjang tetap utuh sebagai satu
 * string (gampang diterjemahkan) tanpa kehilangan penekanannya.
 */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**"))
          return <b key={i}>{part.slice(2, -2)}</b>;
        if (part.startsWith("`") && part.endsWith("`"))
          return <code key={i}>{part.slice(1, -1)}</code>;
        return part;
      })}
    </>
  );
}
