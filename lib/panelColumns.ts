/**
 * Lebar kolom panel schedule — satu sumber untuk tabel di website, export
 * Excel, dan export DXF, supaya lebar kolomnya sama di ketiganya.
 *
 * Satuannya pixel CSS (96 dpi), mengikuti tabel di website yang jadi acuan:
 * `px` = lebar normal kolom, `maxPx` = batas melebar kalau isinya panjang.
 * Kolom dengan `maxPx === px` selalu tetap lebarnya — nama family yang panjang
 * di kolom FIXTURE dipecah jadi beberapa baris seperti di website, bukan
 * melebarkan kolomnya.
 */
export interface ColumnWidth {
  px: number;
  maxPx: number;
}

export const COLUMN_WIDTH = {
  /** kolom gambar cabang SLD, bukan teks */
  sld: { px: 40, maxPx: 40 },
  no: { px: 44, maxPx: 44 },
  function: { px: 208, maxPx: 320 },
  breaker: { px: 96, maxPx: 160 },
  cable: { px: 112, maxPx: 240 },
  /** tetap: judulnya turun baris, kolomnya tidak melebar */
  fixture: { px: 112, maxPx: 112 },
  phase: { px: 64, maxPx: 88 },
  remarks: { px: 128, maxPx: 240 },
} satisfies Record<string, ColumnWidth>;

/** px CSS (96 dpi) -> milimeter, buat gambar DXF skala 1:1. */
export const pxToMm = (px: number) => Math.round((px * 25.4 * 10) / 96) / 10;

/** px CSS -> satuan lebar kolom Excel (lebar pixel Excel = width x 7 + 5). */
export const pxToExcelWidth = (px: number) => Math.round(((px - 5) / 7) * 10) / 10;
