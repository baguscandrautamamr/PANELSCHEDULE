/**
 * Penulis DXF R12 (ASCII) minimal — cukup untuk SLD + tabel panel schedule.
 *
 * R12 dipilih karena paling universal: AutoCAD, BricsCAD, DraftSight, LibreCAD,
 * dan importer DWG/DXF di Revit semuanya baca format ini tanpa plugin tambahan.
 * Satuan gambar = milimeter, skala 1:1.
 */

export type Pt = [number, number];

/** DXF R12 murni ASCII — karakter lain ditransliterasi supaya file tidak rusak. */
const TRANSLIT: Record<string, string> = {
  "φ": "phi",
  "√": "sqrt",
  "Σ": "SIGMA",
  "×": "x",
  "·": "-",
  "–": "-",
  "—": "-",
  "…": "...",
  "≥": ">=",
  "≤": "<=",
  "±": "+/-",
  "→": "->",
  "▼": "v",
  "°": "deg",
  "²": "2",
  "³": "3",
  "“": '"',
  "”": '"',
  "‘": "'",
  "’": "'",
};

/** Bersihkan teks jadi ASCII + potong ke batas 255 karakter per group code DXF. */
export function dxfText(s: string): string {
  let out = "";
  // huruf beraksen (é, ü, ...) dipisah dari tanda diakritiknya dulu supaya
  // hurufnya tetap terbaca, bukan ikut terbuang
  for (const ch of s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")) {
    const mapped = TRANSLIT[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code >= 32 && code < 127) out += ch;
    // sisanya (emoji dll) dibuang
  }
  return out.slice(0, 250);
}

const num = (v: number) => (Object.is(v, -0) ? 0 : v).toFixed(4);

/** Satu pasang group code + value. */
const g = (code: number, value: string | number) => `${code}\n${value}\n`;

export type HAlign = "left" | "center" | "right";

export interface TextOptions {
  height?: number;
  align?: HAlign;
  /** 0 = baseline, 2 = tengah (default), 3 = atas */
  vAlign?: 0 | 1 | 2 | 3;
}

const H_CODE: Record<HAlign, number> = { left: 0, center: 1, right: 2 };

export class DxfBuilder {
  private readonly layerDefs = new Map<string, number>();
  private readonly blockChunks: string[] = [];
  private readonly entityChunks: string[] = [];
  private buffer: string[] = this.entityChunks;
  private blockBuffer: string[] | null = null;
  private currentLayer = "0";
  private minX = Infinity;
  private minY = Infinity;
  private maxX = -Infinity;
  private maxY = -Infinity;

  /** Daftarkan layer + warna (AutoCAD Color Index). */
  addLayer(name: string, color: number) {
    this.layerDefs.set(name, color);
  }

  /** Layer aktif untuk entity berikutnya. */
  layer(name: string) {
    this.currentLayer = name;
  }

  private track(x: number, y: number) {
    // geometri di dalam definisi block relatif ke origin block — jangan
    // ikut menghitung extents gambar
    if (this.blockBuffer) return;
    if (x < this.minX) this.minX = x;
    if (y < this.minY) this.minY = y;
    if (x > this.maxX) this.maxX = x;
    if (y > this.maxY) this.maxY = y;
  }

  line(p1: Pt, p2: Pt) {
    this.track(p1[0], p1[1]);
    this.track(p2[0], p2[1]);
    this.buffer.push(
      g(0, "LINE") +
        g(8, this.currentLayer) +
        g(10, num(p1[0])) +
        g(20, num(p1[1])) +
        g(30, num(0)) +
        g(11, num(p2[0])) +
        g(21, num(p2[1])) +
        g(31, num(0))
    );
  }

  /** Kotak dari empat LINE (x,y = pojok kiri bawah). */
  rect(x: number, y: number, w: number, h: number) {
    this.line([x, y], [x + w, y]);
    this.line([x + w, y], [x + w, y + h]);
    this.line([x + w, y + h], [x, y + h]);
    this.line([x, y + h], [x, y]);
  }

  circle(center: Pt, radius: number) {
    this.track(center[0] - radius, center[1] - radius);
    this.track(center[0] + radius, center[1] + radius);
    this.buffer.push(
      g(0, "CIRCLE") +
        g(8, this.currentLayer) +
        g(10, num(center[0])) +
        g(20, num(center[1])) +
        g(30, num(0)) +
        g(40, num(radius))
    );
  }

  /** Segitiga solid (isi penuh) — dipakai untuk panah keluar. */
  solidTriangle(p1: Pt, p2: Pt, p3: Pt) {
    for (const p of [p1, p2, p3]) this.track(p[0], p[1]);
    // vertex ke-4 disamakan dengan ke-3 supaya SOLID jadi segitiga
    this.buffer.push(
      g(0, "SOLID") +
        g(8, this.currentLayer) +
        g(10, num(p1[0])) +
        g(20, num(p1[1])) +
        g(30, num(0)) +
        g(11, num(p2[0])) +
        g(21, num(p2[1])) +
        g(31, num(0)) +
        g(12, num(p3[0])) +
        g(22, num(p3[1])) +
        g(32, num(0)) +
        g(13, num(p3[0])) +
        g(23, num(p3[1])) +
        g(33, num(0))
    );
  }

  text(value: string, at: Pt, opts: TextOptions = {}) {
    const clean = dxfText(value);
    if (!clean) return;
    const height = opts.height ?? 2.5;
    const hCode = H_CODE[opts.align ?? "left"];
    const vCode = opts.vAlign ?? 2;
    this.track(at[0], at[1] - height);
    this.track(at[0], at[1] + height);
    this.buffer.push(
      g(0, "TEXT") +
        g(8, this.currentLayer) +
        g(10, num(at[0])) +
        g(20, num(at[1])) +
        g(30, num(0)) +
        g(40, num(height)) +
        g(1, clean) +
        g(7, "STANDARD") +
        g(72, hCode) +
        // titik 11/21 yang dipakai kalau 72/73 != 0 — selalu diisi sama
        g(11, num(at[0])) +
        g(21, num(at[1])) +
        g(31, num(0)) +
        g(73, vCode)
    );
  }

  /** Mulai definisi block; entity berikutnya masuk ke block ini sampai endBlock(). */
  beginBlock(name: string) {
    if (this.blockBuffer) throw new Error("beginBlock() dipanggil bersarang");
    this.blockBuffer = [];
    this.buffer = this.blockBuffer;
    this.blockBuffer.push(
      g(0, "BLOCK") +
        g(8, "0") +
        g(2, name) +
        g(70, 0) +
        g(10, num(0)) +
        g(20, num(0)) +
        g(30, num(0)) +
        g(3, name) +
        g(1, "")
    );
  }

  endBlock() {
    if (!this.blockBuffer) throw new Error("endBlock() tanpa beginBlock()");
    this.blockBuffer.push(g(0, "ENDBLK") + g(8, "0"));
    this.blockChunks.push(this.blockBuffer.join(""));
    this.blockBuffer = null;
    this.buffer = this.entityChunks;
  }

  insert(blockName: string, at: Pt, opts: { scale?: number; rotation?: number } = {}) {
    const scale = opts.scale ?? 1;
    this.track(at[0], at[1]);
    this.buffer.push(
      g(0, "INSERT") +
        g(8, this.currentLayer) +
        g(2, blockName) +
        g(10, num(at[0])) +
        g(20, num(at[1])) +
        g(30, num(0)) +
        g(41, num(scale)) +
        g(42, num(scale)) +
        g(43, num(scale)) +
        g(50, num(opts.rotation ?? 0))
    );
  }

  private tables(): string {
    let out = g(0, "SECTION") + g(2, "TABLES");

    // LTYPE — CONTINUOUS wajib ada karena dirujuk semua layer
    out +=
      g(0, "TABLE") +
      g(2, "LTYPE") +
      g(70, 1) +
      g(0, "LTYPE") +
      g(2, "CONTINUOUS") +
      g(70, 0) +
      g(3, "Solid line") +
      g(72, 65) +
      g(73, 0) +
      g(40, num(0)) +
      g(0, "ENDTAB");

    // LAYER
    out += g(0, "TABLE") + g(2, "LAYER") + g(70, this.layerDefs.size + 1);
    out += g(0, "LAYER") + g(2, "0") + g(70, 0) + g(62, 7) + g(6, "CONTINUOUS");
    for (const [name, color] of this.layerDefs) {
      out += g(0, "LAYER") + g(2, name) + g(70, 0) + g(62, color) + g(6, "CONTINUOUS");
    }
    out += g(0, "ENDTAB");

    // STYLE — beberapa reader menolak TEXT tanpa text style terdaftar
    out +=
      g(0, "TABLE") +
      g(2, "STYLE") +
      g(70, 1) +
      g(0, "STYLE") +
      g(2, "STANDARD") +
      g(70, 0) +
      g(40, num(0)) +
      g(41, num(1)) +
      g(50, num(0)) +
      g(71, 0) +
      g(42, num(2.5)) +
      g(3, "txt") +
      g(4, "") +
      g(0, "ENDTAB");

    return out + g(0, "ENDSEC");
  }

  toDxfString(): string {
    const hasGeometry = Number.isFinite(this.minX);
    const minX = hasGeometry ? this.minX : 0;
    const minY = hasGeometry ? this.minY : 0;
    const maxX = hasGeometry ? this.maxX : 100;
    const maxY = hasGeometry ? this.maxY : 100;

    const header =
      g(0, "SECTION") +
      g(2, "HEADER") +
      g(9, "$ACADVER") +
      g(1, "AC1009") +
      g(9, "$EXTMIN") +
      g(10, num(minX)) +
      g(20, num(minY)) +
      g(30, num(0)) +
      g(9, "$EXTMAX") +
      g(10, num(maxX)) +
      g(20, num(maxY)) +
      g(30, num(0)) +
      g(9, "$LIMMIN") +
      g(10, num(minX)) +
      g(20, num(minY)) +
      g(9, "$LIMMAX") +
      g(10, num(maxX)) +
      g(20, num(maxY)) +
      g(0, "ENDSEC");

    const blocks =
      g(0, "SECTION") + g(2, "BLOCKS") + this.blockChunks.join("") + g(0, "ENDSEC");
    const entities =
      g(0, "SECTION") + g(2, "ENTITIES") + this.entityChunks.join("") + g(0, "ENDSEC");

    return header + this.tables() + blocks + entities + g(0, "EOF");
  }
}
