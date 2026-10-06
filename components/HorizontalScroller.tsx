"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";

/**
 * Wadah scroll horizontal tabel + tombol geser kiri/kanan yang menempel di
 * tengah tepi layar (position: fixed), jadi tabel lebar bisa digeser tanpa
 * harus scroll ke bawah dulu mencari scrollbar horizontal.
 */
export default function HorizontalScroller({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 1);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, [update]);

  const slide = (dir: -1 | 1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" });
  };

  const btn =
    "no-print fixed top-1/2 z-40 flex h-14 w-10 -translate-y-1/2 items-center justify-center " +
    "rounded-md border border-neutral-300 bg-white/90 text-2xl text-neutral-700 shadow-md " +
    "backdrop-blur transition hover:border-blue-500 hover:text-blue-600";

  return (
    <>
      <div ref={ref} className="overflow-x-auto">
        {children}
      </div>
      {canLeft && (
        <button
          onClick={() => slide(-1)}
          className={`${btn} left-2`}
          aria-label={t("Geser tabel ke kiri", "Slide table left")}
          title={t("Geser ke kiri", "Slide left")}
        >
          ‹
        </button>
      )}
      {canRight && (
        <button
          onClick={() => slide(1)}
          className={`${btn} right-2`}
          aria-label={t("Geser tabel ke kanan", "Slide table right")}
          title={t("Geser ke kanan", "Slide right")}
        >
          ›
        </button>
      )}
    </>
  );
}
