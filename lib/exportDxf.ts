import { DxfBuilder, type Pt } from "./dxf";
import type { Circuit, Panel } from "./types";
import { fixtureKey } from "./types";
import {
  BREAKER_RATINGS,
  circuitAmpere,
  is3Phase,
  panelPowerFactor,
  panelVoltage,
  panelVoltageLN,
  suggestBreakerText,
} from "./panelCalc";
import { makeT, type Lang } from "./i18n";
import { COLUMN_WIDTH, pxToMm, type ColumnWidth } from "./panelColumns";

interface FixtureCol {
  key: string;
  type: string;
  label: string | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
/** ampere per circuit — 2 desimal, seperti kolom AMPERE di schedule cetak */
const nf2 = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// ---------------------------------------------------------------- layer
const L = {
  frame: "PS-FRAME",
  title: "PS-TITLE",
  sld: "PS-SLD",
  breaker: "PS-BREAKER",
  grid: "PS-TABLE-GRID",
  text: "PS-TEXT",
  summary: "PS-SUMMARY",
} as const;

// ---------------------------------------------------------------- ukuran (mm)
const ROW_H = 7;
const HEAD_H = 11;
const TXT = 2;
const TXT_HEAD = 2.2;
const PAD = 1.5;
/**
 * Perkiraan lebar karakter relatif tinggi teks. Sengaja dilebihkan dari lebar
 * txt.shx (~0.6) supaya teks tidak melewati garis kolom di CAD yang memakai
 * font pengganti yang lebih lebar.
 */
const CHAR_W = 0.72;

const COL_SLD = 26;
/** indeks kolom fixture pertama: SLD, NO., FUNCTION, BREAKER, CABLE */
const FIXTURE_COL0 = 5;
/** jarak bus vertikal dari tepi kiri kolom SLD */
const BUS_X = 5;
/** panjang simbol breaker di dalam block (origin di titik sambung kiri) */
const BRK_W = 15;
/**
 * Skala simbol breaker di dalam baris tabel. Block digambar seukuran SLD utama
 * (tinggi ~8mm), sedangkan baris cuma 7mm — dikecilkan supaya kotak MCCB dan
 * lengan kontak tidak melewati garis baris di atas/bawahnya.
 */
const ROW_SYM_SCALE = 0.7;

const SLD_MAIN_Y = 26;
const CONTENT_LEFT = -95;

/** Jarak antar baris teks di dalam satu sel. */
const LINE_H = 3.2;
const LINE_H_HEAD = 3.4;

/** Perkiraan lebar teks (mm) pada tinggi huruf tertentu. */
const textWidth = (value: string, height: number) => value.length * height * CHAR_W;

/** Lebar kolom (mm) yang dibutuhkan supaya teks muat utuh + padding kiri-kanan. */
const widthFor = (value: string, height: number) => textWidth(value, height) + 2 * PAD;

/**
 * Pecah teks jadi beberapa baris supaya muat di lebar kolom. Tidak ada
 * karakter yang dibuang — kolom yang sudah mentok lebar maksimum tetap
 * menampilkan nama lengkap, cuma turun baris. Titik potong diutamakan di
 * spasi, lalu di pemisah nama family Revit (_ - / .), baru dipotong paksa.
 */
function wrapText(value: string, width: number, height: number): string[] {
  const max = Math.max(1, Math.floor((width - 2 * PAD) / (height * CHAR_W)));
  const lines: string[] = [];
  let cur = "";

  const flush = () => {
    if (cur) lines.push(cur);
    cur = "";
  };

  for (const word of value.split(/\s+/).filter(Boolean)) {
    const joined = cur ? `${cur} ${word}` : word;
    if (joined.length <= max) {
      cur = joined;
      continue;
    }
    flush();
    // kata tunggal yang lebih panjang dari kolom (mis. "ACT_E_EMERGENCY_LIGHT")
    let rest = word;
    while (rest.length > max) {
      const head = rest.slice(0, max);
      const sep = Math.max(
        head.lastIndexOf("_"),
        head.lastIndexOf("-"),
        head.lastIndexOf("/"),
        head.lastIndexOf(".")
      );
      const cut = sep >= Math.floor(max / 2) ? sep + 1 : max;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    cur = rest;
  }
  flush();

  return lines.length > 0 ? lines : [""];
}

// ---------------------------------------------------------------- breaker block
interface BreakerStyle {
  kind: "MCB" | "MCCB" | "RCBO";
  poles: number;
}

/** "MCCB 3P" / "RCBO 2P" / "MCB 1P" -> jenis + jumlah pole. */
function parseBreaker(breakerType: string | null): BreakerStyle {
  const t = (breakerType ?? "").toUpperCase();
  const kind: BreakerStyle["kind"] = t.includes("MCCB")
    ? "MCCB"
    : t.includes("RCBO")
      ? "RCBO"
      : "MCB";
  const m = t.match(/(\d+)\s*P/);
  const poles = m ? Math.min(4, Math.max(1, parseInt(m[1], 10))) : kind === "MCCB" ? 3 : kind === "RCBO" ? 2 : 1;
  return { kind, poles };
}

const blockName = (s: BreakerStyle) => `BRK_${s.kind}_${s.poles}P`;

/**
 * Definisi block simbol breaker: kontak putus + lengan, dengan garis miring
 * sebanyak jumlah pole (konvensi single line diagram). Origin di titik sambung
 * kiri, simbol memanjang ke +X sepanjang BRK_W.
 */
function defineBreakerBlock(dxf: DxfBuilder, style: BreakerStyle) {
  dxf.beginBlock(blockName(style));
  dxf.layer(L.breaker);

  dxf.line([0, 0], [3, 0]);
  dxf.line([3, 0], [9, 3.6]); // lengan kontak
  dxf.line([9, 0], [BRK_W, 0]);
  dxf.circle([3, 0], 0.45);
  dxf.circle([9, 0], 0.45);

  for (let i = 0; i < style.poles; i++) {
    const x = 10.5 + i * 1.05;
    dxf.line([x - 0.7, -1], [x + 0.7, 1]);
  }

  // kotak MCCB dibuat cukup besar supaya ujung lengan kontak tetap di dalam
  if (style.kind === "MCCB") dxf.rect(1.8, -3.6, 8, 8.2);
  if (style.kind === "RCBO") dxf.circle([6, 1.8], 1.9);

  dxf.endBlock();
}

function defineFixedBlocks(dxf: DxfBuilder) {
  // fuse: kotak kecil di atas garis vertikal (origin di tengah)
  dxf.beginBlock("FUSE_SYM");
  dxf.layer(L.sld);
  dxf.rect(-1.6, -3.5, 3.2, 7);
  dxf.line([0, -3.5], [0, 3.5]);
  dxf.endBlock();

  // lampu indikator: lingkaran + silang (origin di titik pusat)
  dxf.beginBlock("LAMP_IND");
  dxf.layer(L.sld);
  dxf.circle([0, 0], 2.5);
  dxf.line([-1.8, -1.8], [1.8, 1.8]);
  dxf.line([-1.8, 1.8], [1.8, -1.8]);
  dxf.endBlock();
}

/** Panah keluar (solid) dengan ekor di titik `at`. */
function arrowOut(dxf: DxfBuilder, at: Pt) {
  dxf.solidTriangle([at[0], at[1] - 1.2], [at[0], at[1] + 1.2], [at[0] + 3.5, at[1]]);
}

// ---------------------------------------------------------------- kolom tabel
interface DxfCol {
  title: string[];
  /** lebar minimum kolom (mm) — dipakai kalau isinya pendek */
  base: number;
  /** lebar maksimum kolom (mm); teks yang masih lebih panjang dipecah jadi beberapa baris */
  max: number;
  align: "left" | "center" | "right";
}

/** Lebar kolom website (px) -> milimeter gambar. */
const mm = (w: ColumnWidth) => ({ base: pxToMm(w.px), max: pxToMm(w.maxPx) });

function buildColumns(cols: FixtureCol[]): DxfCol[] {
  return [
    // kolom SLD isinya simbol breaker, bukan teks — lebarnya ditentukan ukuran
    // block-nya, bukan lebar kolom SLD di website
    { title: ["SLD"], base: COL_SLD, max: COL_SLD, align: "center" },
    { title: ["NO."], ...mm(COLUMN_WIDTH.no), align: "center" },
    { title: ["FUNCTION"], ...mm(COLUMN_WIDTH.function), align: "left" },
    { title: ["BREAKER"], ...mm(COLUMN_WIDTH.breaker), align: "center" },
    { title: ["CABLE"], ...mm(COLUMN_WIDTH.cable), align: "left" },
    ...cols.map<DxfCol>((c) => ({
      title: [c.type, c.label ?? ""].filter(Boolean),
      ...mm(COLUMN_WIDTH.fixture),
      align: "center",
    })),
    { title: ["R", "(WATT)"], ...mm(COLUMN_WIDTH.phase), align: "right" },
    { title: ["S", "(WATT)"], ...mm(COLUMN_WIDTH.phase), align: "right" },
    { title: ["T", "(WATT)"], ...mm(COLUMN_WIDTH.phase), align: "right" },
    { title: ["REMARKS"], ...mm(COLUMN_WIDTH.remarks), align: "left" },
    { title: ["AMPERE"], ...mm(COLUMN_WIDTH.ampere), align: "right" },
    { title: ["BREAKER", "SELECTION"], ...mm(COLUMN_WIDTH.breakerPick), align: "center" },
  ];
}

/**
 * Export panel schedule ke DXF (AutoCAD R12) — SLD + tabel dalam satu gambar,
 * skala 1:1 dalam milimeter. Simbol breaker jadi block (BRK_*) supaya bisa
 * di-replace/di-count di CAD, dan tiap jenis garis punya layer sendiri.
 */
export function exportPanelToDxf(
  panel: Panel,
  circuits: Circuit[],
  cols: FixtureCol[],
  projectName: string | null,
  lang: Lang = "id"
) {
  const t = makeT(lang);
  const dxf = new DxfBuilder();
  dxf.addLayer(L.frame, 8);
  dxf.addLayer(L.title, 5);
  dxf.addLayer(L.sld, 7);
  dxf.addLayer(L.breaker, 3);
  dxf.addLayer(L.grid, 8);
  dxf.addLayer(L.text, 7);
  dxf.addLayer(L.summary, 1);

  // ---- block: hanya jenis breaker yang benar-benar dipakai
  const styles = new Map<string, BreakerStyle>();
  const remember = (t: string | null) => {
    const s = parseBreaker(t);
    styles.set(blockName(s), s);
    return s;
  };
  const mainStyle = panel.main_breaker_type ? remember(panel.main_breaker_type) : null;
  const rowStyles = circuits.map((c) => remember(c.breaker_type));
  defineFixedBlocks(dxf);
  for (const s of styles.values()) defineBreakerBlock(dxf, s);

  // ---- isi tabel dihitung dulu supaya lebar kolom bisa menyesuaikan teks
  const tableCols = buildColumns(cols);
  const idxR = FIXTURE_COL0 + cols.length; // indeks kolom R

  const qtyOf = (c: Circuit, key: string) =>
    (c.circuit_fixtures ?? [])
      .filter((f) => fixtureKey(f) === key)
      .reduce((s, f) => s + f.quantity, 0);

  /** Isi tiap baris circuit per kolom (indeks kolom = indeks tableCols). */
  const bodyRows: string[][] = circuits.map((c) => {
    const cells = tableCols.map(() => "");
    cells[1] = String(c.circuit_no);
    cells[2] = c.function_name;
    cells[3] = [c.breaker_type, c.breaker_rating].filter(Boolean).join(" ");
    cells[4] = c.outgoing_cable ?? "";
    cols.forEach((col, i) => {
      const q = qtyOf(c, col.key);
      if (q) cells[FIXTURE_COL0 + i] = String(q);
    });
    cells[idxR] = c.phase_r ? nf.format(round1(Number(c.phase_r))) : "";
    cells[idxR + 1] = c.phase_s ? nf.format(round1(Number(c.phase_s))) : "";
    cells[idxR + 2] = c.phase_t ? nf.format(round1(Number(c.phase_t))) : "";
    cells[idxR + 3] = c.remarks ?? "";
    const amp = circuitAmpere(panel, c);
    cells[idxR + 4] = amp != null ? nf2.format(amp) : "";
    cells[idxR + 5] = suggestBreakerText(amp);
    return cells;
  });

  // ---- angka ringkasan
  const pf = panelPowerFactor(panel);
  const subR = circuits.reduce((s, c) => s + Number(c.phase_r || 0), 0);
  const subS = circuits.reduce((s, c) => s + Number(c.phase_s || 0), 0);
  const subT = circuits.reduce((s, c) => s + Number(c.phase_t || 0), 0);
  const totalWatt = subR + subS + subT;
  const totalVA = totalWatt / pf;
  const is3ph = is3Phase(panel);
  const volt = panelVoltage(panel);
  const ampere = is3ph ? totalVA / (Math.sqrt(3) * volt) : totalVA / volt;

  interface SummaryRow {
    label: string;
    values: number[];
    /** isi kolom fixture (khusus baris TOTAL qty) */
    qty?: boolean;
  }
  const summaries: SummaryRow[] = [
    { label: "TOTAL", values: [], qty: true },
    { label: "SUB TOTAL", values: [round1(subR), round1(subS), round1(subT)] },
    { label: "TOTAL WATT", values: [round1(totalWatt)] },
    { label: "TOTAL VA", values: [round1(totalVA)] },
    { label: "CONNECTED AMPERE", values: [round1(ampere)] },
  ];

  const summaryRows: string[][] = summaries.map((s) => {
    const cells = tableCols.map(() => "");
    if (s.qty) {
      cols.forEach((col, k) => {
        const total = circuits.reduce((acc, c) => acc + qtyOf(c, col.key), 0);
        if (total) cells[FIXTURE_COL0 + k] = String(total);
      });
    }
    s.values.forEach((v, k) => {
      cells[idxR + k] = nf.format(v);
    });
    return cells;
  });

  // ---- geometri kolom: lebar dasar = lebar kolom di website (lib/panelColumns),
  // melebar seperlunya kalau isinya panjang sampai batas maksimum kolom itu.
  // Teks yang masih lebih panjang dipecah jadi beberapa baris di dalam selnya,
  // jadi tidak ada yang terpotong dan kolom tidak melebar sendiri.
  const widths = tableCols.map((c, i) => {
    let need = c.base;
    for (const line of c.title) need = Math.max(need, widthFor(line, TXT_HEAD));
    for (const row of bodyRows) need = Math.max(need, widthFor(row[i], TXT));
    for (const row of summaryRows) need = Math.max(need, widthFor(row[i], TXT_HEAD));
    return Math.min(c.max, Math.ceil(need));
  });

  const colX: number[] = [];
  let x = 0;
  for (const w of widths) {
    colX.push(x);
    x += w;
  }
  const tableWidth = x;

  // ---- pemecahan baris + tinggi baris/header yang menampung baris terbanyak
  const headLines = tableCols.map((c, i) =>
    c.title.flatMap((line) => wrapText(line, widths[i], TXT_HEAD))
  );
  const bodyLines = bodyRows.map((row) =>
    row.map((v, i) => (v ? wrapText(v, widths[i], TXT) : []))
  );
  const summaryLines = summaryRows.map((row) =>
    row.map((v, i) => (v ? wrapText(v, widths[i], TXT_HEAD) : []))
  );
  const maxLines = (rows: string[][][]) =>
    rows.reduce((m, row) => Math.max(m, ...row.map((l) => l.length)), 1);

  const headH = Math.max(HEAD_H, maxLines([headLines]) * LINE_H_HEAD + 3.6);
  const rowH = Math.max(
    ROW_H,
    Math.max(maxLines(bodyLines) * LINE_H, maxLines(summaryLines) * LINE_H_HEAD) + 2
  );

  /** X untuk teks di dalam sel sesuai perataan kolom. */
  const textX = (i: number) => {
    const c = tableCols[i];
    if (c.align === "left") return colX[i] + PAD;
    if (c.align === "right") return colX[i] + widths[i] - PAD;
    return colX[i] + widths[i] / 2;
  };

  /** Tulis isi sel; beberapa baris ditumpuk rata tengah terhadap `mid`. */
  const cell = (i: number, mid: number, lines: string[], height = TXT) => {
    const lh = height === TXT ? LINE_H : LINE_H_HEAD;
    lines.forEach((line, k) => {
      dxf.text(line, [textX(i), mid + ((lines.length - 1) / 2 - k) * lh], {
        height,
        align: tableCols[i].align,
      });
    });
  };

  // ---- SLD header (di atas tabel, bus tersambung ke kolom SLD)
  dxf.layer(L.sld);
  const busTop = SLD_MAIN_Y;

  if (panel.symbol_tag) {
    dxf.rect(CONTENT_LEFT, busTop + 10, 18, 11);
    dxf.text(panel.symbol_tag, [CONTENT_LEFT + 9, busTop + 15.5], {
      height: 3,
      align: "center",
    });
  }

  if (panel.source_panel) {
    dxf.text(panel.source_panel, [CONTENT_LEFT, busTop + 4], { height: 2.6 });
  }
  dxf.line([CONTENT_LEFT, busTop], [BUS_X, busTop]);
  if (panel.incoming_cable) {
    // di bawah simbol main breaker (tinggi setengah block ~3.6mm), bukan menempel
    dxf.text(panel.incoming_cable, [CONTENT_LEFT, busTop - 7], { height: 2.2 });
  }

  if (mainStyle) {
    const mainX = CONTENT_LEFT + 42;
    dxf.layer(L.breaker);
    dxf.insert(blockName(mainStyle), [mainX, busTop]);
    dxf.layer(L.text);
    dxf.text(panel.main_breaker_type ?? "", [mainX, busTop + 6], { height: 2.4 });
  }

  if (panel.main_breaker_rating) {
    dxf.layer(L.sld);
    dxf.rect(CONTENT_LEFT, busTop - 22, 46, 13);
    dxf.layer(L.text);
    dxf.text("MCB Rating", [CONTENT_LEFT + 2, busTop - 12.5], { height: 2 });
    dxf.text(panel.main_breaker_rating, [CONTENT_LEFT + 2, busTop - 18], { height: 2.8 });
  }

  // fuse + lampu indikator R/Y/B naik dari bus
  dxf.layer(L.sld);
  dxf.line([BUS_X, busTop], [BUS_X, busTop + 30]);
  dxf.insert("FUSE_SYM", [BUS_X, busTop + 12]);
  dxf.layer(L.text);
  dxf.text(panel.fuse_rating ?? "F", [BUS_X + 4, busTop + 12], { height: 2.2 });

  (["R", "Y", "B"] as const).forEach((label, i) => {
    const lamp: Pt = [22 + i * 12, busTop + 42];
    dxf.layer(L.sld);
    dxf.line([BUS_X, busTop + 30], [lamp[0], lamp[1] - 2.5]);
    dxf.insert("LAMP_IND", lamp);
    dxf.layer(L.text);
    dxf.text(label, [lamp[0], lamp[1] + 5], { height: 2.4, align: "center" });
  });

  // ---- header tabel
  const headTop = 0;
  const headBottom = headTop - headH;
  const headMid = headBottom + headH / 2;
  dxf.layer(L.text);
  headLines.forEach((lines, i) => {
    // judul kolom selalu di tengah, tidak ikut perataan isi selnya
    lines.forEach((line, k) => {
      dxf.text(
        line,
        [colX[i] + widths[i] / 2, headMid + ((lines.length - 1) / 2 - k) * LINE_H_HEAD],
        { height: TXT_HEAD, align: "center" }
      );
    });
  });

  // ---- baris circuit
  const bodyTop = headBottom;
  circuits.forEach((c, row) => {
    const top = bodyTop - row * rowH;
    const mid = top - rowH / 2;

    // cabang SLD: bus -> breaker -> panah keluar
    dxf.layer(L.sld);
    dxf.line([BUS_X, mid], [BUS_X + 2, mid]);
    dxf.layer(L.breaker);
    dxf.insert(blockName(rowStyles[row]), [BUS_X + 2, mid], { scale: ROW_SYM_SCALE });
    dxf.layer(L.sld);
    arrowOut(dxf, [BUS_X + 2 + BRK_W * ROW_SYM_SCALE, mid]);

    dxf.layer(L.text);
    bodyLines[row].forEach((lines, i) => cell(i, mid, lines));
  });

  const bodyBottom = bodyTop - circuits.length * rowH;

  // bus vertikal utuh dari SLD sampai baris terakhir
  dxf.layer(L.sld);
  dxf.line([BUS_X, busTop], [BUS_X, bodyBottom]);

  // ---- baris ringkasan
  summaries.forEach((s, i) => {
    const mid = bodyBottom - i * rowH - rowH / 2;
    dxf.layer(L.summary);
    // label diratakan kanan tepat sebelum kolom angka yang diisi baris ini —
    // baris TOTAL mengisi kolom fixture, jadi labelnya mundur ke kolom CABLE
    const labelX = (s.qty ? colX[FIXTURE_COL0] : colX[idxR]) - PAD;
    dxf.text(s.label, [labelX, mid], { height: TXT_HEAD, align: "right" });
    summaryLines[i].forEach((lines, k) => cell(k, mid, lines, TXT_HEAD));
  });

  const tableBottom = bodyBottom - summaries.length * rowH;

  // ---- grid tabel
  dxf.layer(L.grid);
  const rowLines = 1 + circuits.length + summaries.length; // header + body + summary
  for (let i = 0; i <= rowLines; i++) {
    const y = i === 0 ? headTop : headBottom - (i - 1) * rowH;
    dxf.line([0, y], [tableWidth, y]);
  }
  for (let i = 0; i <= tableCols.length; i++) {
    const gx = i === tableCols.length ? tableWidth : colX[i];
    dxf.line([gx, headTop], [gx, tableBottom]);
  }

  // ---- catatan rumus
  dxf.layer(L.text);
  const notes = [
    t("RUMUS PERHITUNGAN:", "CALCULATION FORMULAS:"),
    `TOTAL WATT = SIGMA(R) + SIGMA(S) + SIGMA(T) = ${round1(subR)} + ${round1(subS)} + ${round1(subT)} = ${round1(totalWatt)} W`,
    `TOTAL VA = TOTAL WATT / cos phi = ${round1(totalWatt)} / ${pf} = ${round1(totalVA)} VA`,
    `CONNECTED AMPERE = TOTAL VA / ${is3ph ? "(sqrt3 x V)" : "V"} = ${round1(totalVA)} / ${
      is3ph ? `(1.732 x ${volt})` : volt
    } = ${round1(ampere)} A`,
    `AMPERE per circuit = (R + S + T) / ${panelVoltageLN(panel)} ${t("untuk 1 fase", "for single-phase")}${
      is3ph ? `; / (${pf} x 1.732 x ${volt}) ${t("untuk 3 fase", "for three-phase")}` : ""
    }`,
    t(
      `BREAKER SELECTION = rating standar terdekat di atas ampere circuit (${BREAKER_RATINGS.join(", ")} A)`,
      `BREAKER SELECTION = nearest standard rating above the circuit ampere (${BREAKER_RATINGS.join(", ")} A)`
    ),
    t(
      "Satuan gambar: milimeter, skala 1:1. Simbol breaker = block BRK_*.",
      "Drawing units: millimeters, 1:1 scale. Breaker symbols = block BRK_*."
    ),
  ];
  notes.forEach((line, i) => {
    dxf.text(line, [0, tableBottom - 6 - i * 4.5], { height: 2.2 });
  });
  const notesBottom = tableBottom - 6 - notes.length * 4.5;

  // ---- judul + frame
  const titleY = busTop + 62;
  dxf.layer(L.title);
  if (projectName) dxf.text(projectName, [CONTENT_LEFT, titleY + 8], { height: 3.2 });
  dxf.text(
    `${panel.panel_code}${panel.ip_rating ? ` (${panel.ip_rating})` : ""}`,
    [CONTENT_LEFT, titleY],
    { height: 5 }
  );
  dxf.layer(L.text);
  const subtitle = [panel.box_type, panel.location && `LOCATION ${panel.location}`]
    .filter(Boolean)
    .join(" - ");
  if (subtitle) dxf.text(subtitle, [CONTENT_LEFT, titleY - 6], { height: 2.6 });
  dxf.text(
    `${[panel.voltage, panel.phase, panel.wire, panel.freq].filter(Boolean).join(", ")} - cos phi ${pf}`,
    [CONTENT_LEFT, titleY - 11],
    { height: 2.6 }
  );

  const margin = 12;
  const frameLeft = CONTENT_LEFT - margin;
  const frameRight = tableWidth + margin;
  const frameTop = titleY + 8 + margin;
  const frameBottom = notesBottom - margin;
  dxf.layer(L.frame);
  dxf.rect(frameLeft, frameBottom, frameRight - frameLeft, frameTop - frameBottom);

  download(dxf.toDxfString(), panel.panel_code || "panel-schedule");
}

function download(content: string, baseName: string) {
  const blob = new Blob([content], { type: "image/vnd.dxf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${baseName.replace(/[\\/:*?"<>|]/g, "_")}.dxf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
