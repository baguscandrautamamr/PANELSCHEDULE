import { DxfBuilder, type Pt } from "./dxf";
import type { Circuit, Panel } from "./types";
import { fixtureKey } from "./types";
import { is3Phase, panelPowerFactor, panelVoltage } from "./panelCalc";
import { makeT, type Lang } from "./i18n";

interface FixtureCol {
  key: string;
  type: string;
  label: string | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

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

/** Potong teks supaya muat di lebar kolom. */
function fit(value: string, width: number, height: number): string {
  const max = Math.max(1, Math.floor((width - 2 * PAD) / (height * CHAR_W)));
  return value.length <= max ? value : `${value.slice(0, Math.max(1, max - 2))}..`;
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
  width: number;
  align: "left" | "center" | "right";
}

function buildColumns(cols: FixtureCol[]): DxfCol[] {
  return [
    { title: ["SLD"], width: COL_SLD, align: "center" },
    { title: ["NO."], width: 12, align: "center" },
    { title: ["FUNCTION"], width: 58, align: "left" },
    { title: ["BREAKER"], width: 30, align: "center" },
    { title: ["CABLE"], width: 42, align: "left" },
    ...cols.map<DxfCol>((c) => ({
      title: [c.type, c.label ?? ""].filter(Boolean),
      width: 24,
      align: "center",
    })),
    { title: ["R", "(WATT)"], width: 20, align: "right" },
    { title: ["S", "(WATT)"], width: 20, align: "right" },
    { title: ["T", "(WATT)"], width: 20, align: "right" },
    { title: ["REMARKS"], width: 38, align: "left" },
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

  // ---- geometri kolom
  const tableCols = buildColumns(cols);
  const colX: number[] = [];
  let x = 0;
  for (const c of tableCols) {
    colX.push(x);
    x += c.width;
  }
  const tableWidth = x;
  const idxR = FIXTURE_COL0 + cols.length; // indeks kolom R

  /** X untuk teks di dalam sel sesuai perataan kolom. */
  const textX = (i: number) => {
    const c = tableCols[i];
    if (c.align === "left") return colX[i] + PAD;
    if (c.align === "right") return colX[i] + c.width - PAD;
    return colX[i] + c.width / 2;
  };

  const cell = (i: number, y: number, value: string, height = TXT) => {
    if (!value) return;
    dxf.text(fit(value, tableCols[i].width, height), [textX(i), y], {
      height,
      align: tableCols[i].align,
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
  const headBottom = headTop - HEAD_H;
  dxf.layer(L.text);
  tableCols.forEach((c, i) => {
    c.title.forEach((line, k) => {
      const y = c.title.length === 1 ? headBottom + HEAD_H / 2 : headBottom + HEAD_H - 3.4 - k * 3.4;
      // judul kolom selalu di tengah, tidak ikut perataan isi selnya
      dxf.text(fit(line, c.width, TXT_HEAD), [colX[i] + c.width / 2, y], {
        height: TXT_HEAD,
        align: "center",
      });
    });
  });

  // ---- baris circuit
  const qtyOf = (c: Circuit, key: string) =>
    (c.circuit_fixtures ?? [])
      .filter((f) => fixtureKey(f) === key)
      .reduce((s, f) => s + f.quantity, 0);

  const bodyTop = headBottom;
  circuits.forEach((c, row) => {
    const top = bodyTop - row * ROW_H;
    const mid = top - ROW_H / 2;

    // cabang SLD: bus -> breaker -> panah keluar
    dxf.layer(L.sld);
    dxf.line([BUS_X, mid], [BUS_X + 2, mid]);
    dxf.layer(L.breaker);
    dxf.insert(blockName(rowStyles[row]), [BUS_X + 2, mid], { scale: ROW_SYM_SCALE });
    dxf.layer(L.sld);
    arrowOut(dxf, [BUS_X + 2 + BRK_W * ROW_SYM_SCALE, mid]);

    dxf.layer(L.text);
    cell(1, mid, String(c.circuit_no));
    cell(2, mid, c.function_name);
    cell(3, mid, [c.breaker_type, c.breaker_rating].filter(Boolean).join(" "));
    cell(4, mid, c.outgoing_cable ?? "");
    cols.forEach((col, i) => {
      const q = qtyOf(c, col.key);
      if (q) cell(FIXTURE_COL0 + i, mid, String(q));
    });
    cell(idxR, mid, c.phase_r ? nf.format(round1(Number(c.phase_r))) : "");
    cell(idxR + 1, mid, c.phase_s ? nf.format(round1(Number(c.phase_s))) : "");
    cell(idxR + 2, mid, c.phase_t ? nf.format(round1(Number(c.phase_t))) : "");
    cell(idxR + 3, mid, c.remarks ?? "");
  });

  const bodyBottom = bodyTop - circuits.length * ROW_H;

  // bus vertikal utuh dari SLD sampai baris terakhir
  dxf.layer(L.sld);
  dxf.line([BUS_X, busTop], [BUS_X, bodyBottom]);

  // ---- baris ringkasan
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

  summaries.forEach((s, i) => {
    const mid = bodyBottom - i * ROW_H - ROW_H / 2;
    dxf.layer(L.summary);
    // label diratakan kanan tepat sebelum kolom angka yang diisi baris ini —
    // baris TOTAL mengisi kolom fixture, jadi labelnya mundur ke kolom CABLE
    const labelX = (s.qty ? colX[FIXTURE_COL0] : colX[idxR]) - PAD;
    dxf.text(s.label, [labelX, mid], { height: TXT_HEAD, align: "right" });
    if (s.qty) {
      cols.forEach((col, k) => {
        const total = circuits.reduce((acc, c) => acc + qtyOf(c, col.key), 0);
        if (total) cell(FIXTURE_COL0 + k, mid, String(total), TXT_HEAD);
      });
    }
    s.values.forEach((v, k) => {
      dxf.text(nf.format(v), [textX(idxR + k), mid], { height: TXT_HEAD, align: "right" });
    });
  });

  const tableBottom = bodyBottom - summaries.length * ROW_H;

  // ---- grid tabel
  dxf.layer(L.grid);
  const rowLines = 1 + circuits.length + summaries.length; // header + body + summary
  for (let i = 0; i <= rowLines; i++) {
    const y = i === 0 ? headTop : headBottom - (i - 1) * ROW_H;
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
