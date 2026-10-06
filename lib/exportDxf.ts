import { DxfBuilder, type Pt } from "./dxf";
import type { Circuit, Panel } from "./types";
import { fixtureKey } from "./types";
import {
  BREAKER_RATINGS,
  is3Phase,
  panelPowerFactor,
  panelVoltage,
  panelVoltageLN,
} from "./panelCalc";
import { circuitSpec, mainBreakerSpec } from "./circuitSpec";
import { FIXTURE_GROUP, fixtureGroup } from "./fixtureOrder";
import { makeT, type Lang } from "./i18n";

interface FixtureCol {
  key: string;
  type: string;
  label: string | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const nf = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/*
 * Tata letak mengikuti template gambar panel schedule proyek
 * (PGR-DWG-DC-ME-00-LV-6004.2 PANEL SCHEDULE LP-WAREHOUSE-3):
 *
 *   SLD box (kiri): tag GF, voltmeter/ammeter, fuse + lampu R/Y/B, incoming
 *   (kabel vertikal -> main breaker -> CT -> bus), lalu tiap circuit:
 *   nomor, simbol breaker, teks breaker di atas garis feeder, teks kabel di
 *   luar box sampai tepi tabel.
 *   Tabel (kanan): FUNCTION | fixture LIGHTING/RECEPTACLE | D.F | R S T | REMARKS
 *   Di bawah: SUB TOTAL / TOTAL WATT / TOTAL VA / CONNECTED AMPERE, legend di kanan.
 *
 * Semua koordinat di file ini memakai SATUAN TEMPLATE (tinggi teks 250, jarak
 * baris 600) supaya bisa dicocokkan langsung dengan DWG template, lalu dikali
 * SCALE jadi milimeter (teks 2,5mm, baris 6mm).
 */
const SCALE = 0.01;

// ---------------------------------------------------------------- layer
const L = {
  frame: "PS-FRAME",
  title: "PS-TITLE",
  sld: "PS-SLD",
  breaker: "PS-BREAKER",
  grid: "PS-TABLE-GRID",
  text: "PS-TEXT",
  summary: "PS-SUMMARY",
  legend: "PS-LEGEND",
} as const;

// ---------------------------------------------------------------- geometri template
const TXT = 250;
const TXT_SMALL = 200;
const TXT_FIX = 150;
const ROW = 600;
/**
 * Perkiraan lebar karakter relatif tinggi teks untuk text style TX-AN
 * (Arial Narrow) — dilebihkan sedikit dari rata-rata huruf kapital (~0,5).
 */
const CHAR_W = 0.55;

const BOX_LEFT = 90630;
const BOX_RIGHT = 102413;
const BOX_TOP = -69836;
const BUS_X = 96052;
const BUS_TOP = -71863;
const NO_X = 96299;
const BRK_X = 96882;
const BRK_TEXT_X = 99885;
/** jarak ujung kanan simbol RCBO/RCCB ke awal teks breaker */
const RCD_TEXT_GAP = 800;
const CABLE_TEXT_X = 104148;
const TABLE_LEFT = 105993;
const TABLE_TOP = -69947;
const GROUP_BOTTOM = -70595;
const HEAD_BOTTOM = -72241;
const MAIN_Y = -75629;
const FEED_X = 89715;

const FUNC_W = 4841;
const FIX_W = 2000;
const DF_W = 1000;
const PH_W = 2000;
const REM_W = 1673;

const textW = (s: string, h: number) => s.length * h * CHAR_W;

/** Pecah teks supaya muat di lebar tertentu (dipotong di spasi / pemisah nama family). */
function wrapText(value: string, width: number, height: number): string[] {
  const max = Math.max(1, Math.floor(width / (height * CHAR_W)));
  const lines: string[] = [];
  let cur = "";
  for (const word of value.split(/\s+/).filter(Boolean)) {
    const joined = cur ? `${cur} ${word}` : word;
    if (joined.length <= max) {
      cur = joined;
      continue;
    }
    if (cur) lines.push(cur);
    let rest = word;
    while (rest.length > max) {
      const head = rest.slice(0, max);
      const sep = Math.max(head.lastIndexOf("_"), head.lastIndexOf("-"), head.lastIndexOf("/"));
      const cut = sep >= Math.floor(max / 2) ? sep + 1 : max;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    cur = rest;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

// ---------------------------------------------------------------- breaker
interface BreakerStyle {
  kind: "MCB" | "MCCB" | "RCD";
  poles: number;
}

function parseBreaker(breakerType: string | null): BreakerStyle {
  const t = (breakerType ?? "").toUpperCase();
  const kind: BreakerStyle["kind"] = t.includes("MCCB")
    ? "MCCB"
    : t.includes("RCBO") || t.includes("RCCB")
      ? "RCD"
      : "MCB";
  const m = t.match(/(\d+)\s*P/);
  const poles = m ? Math.min(4, Math.max(1, parseInt(m[1], 10))) : 1;
  return { kind, poles };
}

const blockName = (s: BreakerStyle) => `BRK_${s.kind}_${s.poles}P`;
/** panjang block breaker (titik sambung kiri -> kanan), satuan template */
const blockLen = (s: BreakerStyle) => (s.kind === "RCD" ? 1684 : 1300);

/**
 * Builder yang menerima koordinat satuan template dan menulisnya dalam mm.
 * Block juga didefinisikan dalam satuan template (dikali SCALE).
 */
class TplDxf {
  readonly dxf = new DxfBuilder();
  private inBlock = false;

  private p(x: number, y: number): Pt {
    return this.inBlock
      ? [x * SCALE, y * SCALE]
      : [(x - BOX_LEFT) * SCALE, (y - BOX_TOP) * SCALE];
  }
  layer(name: string) {
    this.dxf.layer(name);
  }
  line(x1: number, y1: number, x2: number, y2: number) {
    this.dxf.line(this.p(x1, y1), this.p(x2, y2));
  }
  poly(pts: [number, number][], closed = false) {
    const all = closed ? [...pts, pts[0]] : pts;
    for (let i = 0; i + 1 < all.length; i++) this.line(...all[i], ...all[i + 1]);
  }
  rect(x: number, y: number, w: number, h: number) {
    this.poly(
      [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ],
      true
    );
  }
  circle(x: number, y: number, r: number) {
    this.dxf.circle(this.p(x, y), r * SCALE);
  }
  arc(x: number, y: number, r: number, a0: number, a1: number) {
    this.dxf.arc(this.p(x, y), r * SCALE, a0, a1);
  }
  text(
    value: string,
    x: number,
    y: number,
    h = TXT,
    opts: { align?: "left" | "center" | "right"; vAlign?: 0 | 2; rotation?: number } = {}
  ) {
    this.dxf.text(value, this.p(x, y), {
      height: h * SCALE,
      align: opts.align,
      vAlign: opts.vAlign ?? 2,
      rotation: opts.rotation,
    });
  }
  /** `scale` relatif satuan template (1 = ukuran block di template) */
  insert(name: string, x: number, y: number, scale = 1) {
    this.dxf.insert(name, this.p(x, y), { scale });
  }
  beginBlock(name: string) {
    this.dxf.beginBlock(name);
    this.inBlock = true;
  }
  endBlock() {
    this.dxf.endBlock();
    this.inBlock = false;
  }
}

/** Block breaker dengan geometri block MCB-1P/MCB-3P/ELCB-2P/ELCB-4P/MCCB-3P template. */
function defineBreakerBlock(d: TplDxf, s: BreakerStyle) {
  d.beginBlock(blockName(s));
  d.layer(L.breaker);
  if (s.kind === "RCD") {
    // ELCB-2P / ELCB-4P
    d.line(0, 0, 292, 0);
    d.line(209, 82, 374, -82);
    d.line(374, 82, 209, -82);
    d.line(417, 467, 1225, 0);
    d.line(1225, 0, 1684, 0);
    const slashes = s.poles >= 4 ? [-174, -87, 0, 87] : [-43, 43];
    for (const dx of slashes) d.line(749 + dx, 443 - dx * 0.58, 604 + dx, 190 - dx * 0.58);
    d.rect(1351, 222, 295, 295);
    d.line(1568, 462, 1568, 277);
    d.line(1404, 369, 1504, 369);
    d.line(1429, 342, 1479, 342);
    d.line(1442, 316, 1467, 316);
    d.line(1454, 316, 1454, 298);
    d.line(1454, 369, 1454, 450);
    d.line(1395, 222, 1395, 3);
    d.line(1602, 222, 1602, 3);
    d.arc(1532, 3, 70, 180, 360);
    d.arc(1498, 26, 30, 0, 180);
    d.arc(1465, 3, 70, 180, 360);
    d.line(1351, 369, 1003, 369);
    d.line(1003, 369, 1003, 150);
    d.poly([
      [1061, 229],
      [1003, 150],
      [946, 229],
    ]);
  } else {
    // MCB-1P / MCB-3P (MCCB = MCB + tanda trip unit)
    d.line(0, 0, 250, 0);
    d.line(179, 71, 321, -71);
    d.line(321, 71, 179, -71);
    d.line(357, 400, 1050, 0);
    d.line(1050, 0, 1300, 0);
    const slashes = s.poles >= 3 ? [-87, 0, 87] : s.poles === 2 ? [-43, 43] : [0];
    for (const dx of slashes) d.line(679 + dx, 358 - dx * 0.58, 554 + dx, 142 - dx * 0.58);
    if (s.kind === "MCCB") {
      const o = 1050; // geometri MCCB-3P template ber-origin di ujung kanan kontak
      d.line(o - 395, 517, o - 430, 454);
      d.line(o - 473, 381, o - 520, 300);
      d.line(o - 481, 567, o - 606, 350);
      d.poly([
        [o - 430, 454],
        [o - 387, 429],
        [o - 430, 356],
        [o - 473, 381],
      ]);
      d.line(o - 481, 567, o - 481, 502);
      d.line(o - 481, 567, o - 537, 534);
      d.line(o - 395, 517, o - 395, 452);
      d.line(o - 395, 517, o - 451, 484);
    }
  }
  d.endBlock();
}

function defineFixedBlocks(d: TplDxf) {
  // IL — indicator lamp
  d.beginBlock("IL");
  d.layer(L.sld);
  d.circle(0, 0, 139);
  d.line(-148, 148, -99, 99);
  d.line(99, -99, 148, -148);
  d.line(-148, -148, -99, -99);
  d.line(99, 99, 148, 148);
  d.endBlock();

  // SS — selector switch
  d.beginBlock("SS");
  d.layer(L.sld);
  d.poly(
    [
      [0, 201],
      [-64, 0],
      [0, -201],
      [64, 0],
    ],
    true
  );
  d.arc(0, 0, 79, 0, 360);
  d.endBlock();

  // PT — potential transformer
  d.beginBlock("PT");
  d.layer(L.sld);
  d.line(0, 150, 112, 150);
  d.line(0, 0, 112, 0);
  d.line(0, -150, 112, -150);
  d.arc(112, 75, 75, 270, 90);
  d.arc(112, -75, 75, 270, 90);
  d.line(441, 150, 328, 150);
  d.line(441, 0, 328, 0);
  d.line(441, -150, 328, -150);
  d.arc(328, 75, 75, 90, 270);
  d.arc(328, -75, 75, 90, 270);
  d.line(188, -215, 34, -369);
  d.line(444, -215, 290, -369);
  d.line(34, -369, 188, -369);
  d.line(290, -369, 444, -369);
  d.line(34, -369, 34, -486);
  d.line(-58, -486, 126, -486);
  d.line(-12, -521, 80, -521);
  d.line(11, -556, 57, -556);
  d.endBlock();

  // SA — surge arrester (origin di ujung atas)
  d.beginBlock("SA");
  d.layer(L.sld);
  d.rect(-75, -400, 150, 400);
  d.line(-75, 0, 0, -286);
  d.line(75, 0, 0, -286);
  d.line(0, -400, 0, -615);
  d.line(-94, -615, 94, -615);
  d.line(-47, -663, 47, -663);
  d.line(-23, -710, 23, -710);
  d.endBlock();

  // FUSE — vertikal, origin di tengah
  d.beginBlock("FUSE");
  d.layer(L.sld);
  d.rect(-200, -320, 400, 640);
  for (const y of [-110, 0, 110]) d.line(-320, y, 320, y);
  d.endBlock();

  // DONUT — titik sambung bus
  d.beginBlock("DONUT");
  d.layer(L.sld);
  d.circle(0, 0, 75);
  d.circle(0, 0, 35);
  d.endBlock();
}

// ---------------------------------------------------------------- export
/**
 * Export panel schedule ke DXF (AutoCAD R12) dengan gaya template gambar
 * proyek. Skala 1:1 milimeter; breaker jadi block BRK_* supaya bisa di-count
 * / di-replace di CAD.
 */
export function exportPanelToDxf(
  panel: Panel,
  circuits: Circuit[],
  cols: FixtureCol[],
  projectName: string | null,
  lang: Lang = "id"
) {
  const t = makeT(lang);
  const d = new TplDxf();
  d.dxf.addLayer(L.frame, 7);
  d.dxf.addLayer(L.title, 5);
  d.dxf.addLayer(L.sld, 7);
  d.dxf.addLayer(L.breaker, 7);
  d.dxf.addLayer(L.grid, 7);
  d.dxf.addLayer(L.text, 5);
  d.dxf.addLayer(L.summary, 5);
  d.dxf.addLayer(L.legend, 5);

  const main = mainBreakerSpec(panel, circuits);
  const specs = circuits.map((c) => circuitSpec(panel, c));

  // ---- block: semua jenis breaker (legend memakai semuanya)
  defineFixedBlocks(d);
  const legendStyles: [BreakerStyle, string, string][] = [
    [{ kind: "MCCB", poles: 3 }, "MCCB 3P", "MOULDED CASE CIRCUIT BREAKER 3 POLES"],
    [{ kind: "MCB", poles: 1 }, "MCB 1P", "MINIATURE CIRCUIT BREAKER 1 POLE"],
    [{ kind: "MCB", poles: 3 }, "MCB 3P", "MINIATURE CIRCUIT BREAKER 3 POLE"],
    [{ kind: "RCD", poles: 2 }, "RCBO", "RESIDUAL CURRENT CIRCUIT BREAKER OVERLOAD 2 POLE"],
    [{ kind: "RCD", poles: 4 }, "RCCB", "RESIDUAL CURRENT CIRCUIT BREAKER 4 POLE"],
  ];
  const styles = new Map<string, BreakerStyle>();
  const remember = (s: BreakerStyle) => {
    styles.set(blockName(s), s);
    return s;
  };
  legendStyles.forEach(([s]) => remember(s));
  const mainStyle = remember(parseBreaker(main.type));
  const rowStyles = specs.map((s) => remember(parseBreaker(s.rule.breakerType)));
  for (const s of styles.values()) defineBreakerBlock(d, s);

  // ---- kolom tabel
  const qtyOf = (c: Circuit, key: string) =>
    (c.circuit_fixtures ?? [])
      .filter((f) => fixtureKey(f) === key)
      .reduce((s, f) => s + f.quantity, 0);

  const funcW = Math.max(
    FUNC_W,
    ...circuits.map((c) => Math.ceil(textW(c.function_name, TXT) + 600))
  );
  const remW = Math.max(
    REM_W,
    ...circuits.map((c) => Math.min(6000, Math.ceil(textW(c.remarks ?? "", TXT) + 400)))
  );
  const xFunc = TABLE_LEFT;
  const xFix0 = xFunc + funcW;
  const xDf = xFix0 + cols.length * FIX_W;
  const xR = xDf + DF_W;
  const xRem = xR + 3 * PH_W;
  const tableRight = xRem + remW;

  // ---- tinggi: bus turun ~2800 di bawah circuit terakhir, box & tabel sama bawahnya
  const rowMid = (i: number) => HEAD_BOTTOM - ROW / 2 - i * ROW;
  const lastMid = circuits.length ? rowMid(circuits.length - 1) : HEAD_BOTTOM;
  const busBottom = Math.min(lastMid - 2800, MAIN_Y - 4500);
  const minBottom = busBottom - 1700;
  const tableRows = Math.max(circuits.length + 1, Math.ceil((HEAD_BOTTOM - minBottom) / ROW));
  const tableBottom = HEAD_BOTTOM - tableRows * ROW;

  // ================================================================ judul
  d.layer(L.title);
  if (projectName) d.text(projectName, BOX_LEFT + 96, -68400, 300, { vAlign: 0 });
  d.text(
    `${panel.panel_code}${panel.ip_rating ? ` (${panel.ip_rating})` : ""}`,
    BOX_LEFT + 96,
    -69119,
    500,
    { vAlign: 0 }
  );
  if (panel.location) {
    const loc = panel.location.replace(/^LOCATION\s+(AT\s+)?/i, "");
    d.text(`(LOCATION AT ${loc})`, BOX_LEFT + 96, -69593, 300, { vAlign: 0 });
  }

  // ================================================================ SLD box
  d.layer(L.frame);
  d.rect(BOX_LEFT, tableBottom, BOX_RIGHT - BOX_LEFT, BOX_TOP - tableBottom);
  if (panel.symbol_tag) {
    d.layer(L.sld);
    d.rect(90833, -71016, 1030, 942);
    d.layer(L.text);
    d.text(panel.symbol_tag, 91348, -70545, 500, { align: "center" });
  }

  // bus + rating panel di ujung bawah bus
  d.layer(L.sld);
  d.line(BUS_X, BUS_TOP, BUS_X, busBottom);
  d.layer(L.text);
  const ratingTxt = [main.rating != null ? `${main.rating}A` : null, panel.voltage, panel.phase]
    .filter(Boolean)
    .join(", ");
  const sysTxt = [panel.wire, panel.freq].filter(Boolean).join(", ");
  d.text(`${ratingTxt},`, BUS_X - 553, busBottom - 45, TXT, { rotation: 90, vAlign: 0 });
  if (sysTxt) d.text(sysTxt, BUS_X - 209, busBottom - 45, TXT, { rotation: 90, vAlign: 0 });

  // ---- incoming: dari sumber (bawah) naik, belok ke bus lewat main breaker
  const feedBottom = MAIN_Y - 6691;
  d.layer(L.sld);
  d.line(FEED_X, feedBottom, FEED_X, MAIN_Y);
  d.arc(FEED_X - 60, feedBottom, 60, 180, 360);
  d.arc(FEED_X + 60, feedBottom, 60, 0, 180);
  d.circle(BOX_LEFT, MAIN_Y, 100);
  const mainX = 91043;
  d.line(FEED_X, MAIN_Y, mainX, MAIN_Y);
  d.layer(L.breaker);
  d.insert(blockName(mainStyle), mainX, MAIN_Y);
  d.layer(L.sld);
  d.line(mainX + blockLen(mainStyle), MAIN_Y, BUS_X, MAIN_Y);
  d.insert("DONUT", BUS_X, MAIN_Y);

  d.layer(L.text);
  d.text(main.type, 91686, -76046, TXT, { align: "center" });
  d.text(main.rating != null ? `${main.rating}A` : main.breaker, 91686, -76512, TXT, {
    align: "center",
  });
  if (main.cable) {
    d.text(main.cable, FEED_X - 89, feedBottom + 860, TXT, { rotation: 90, vAlign: 0 });
  }
  if (panel.source_panel) {
    d.text("FROM", FEED_X, feedBottom - 600, TXT, { align: "center" });
    d.text(panel.source_panel.replace(/^FROM\s+/i, ""), FEED_X, feedBottom - 1000, TXT, {
      align: "center",
    });
  }

  // ---- fuse + lampu indikator R/Y/B
  const fuseX = 92971;
  const lampLineY = -73585;
  d.layer(L.sld);
  d.line(fuseX, MAIN_Y, fuseX, lampLineY);
  d.insert("FUSE", fuseX, -74455);
  d.line(91415, lampLineY, fuseX, lampLineY);
  d.layer(L.text);
  d.text(panel.fuse_rating ?? "F 2A", fuseX - 420, -74455, TXT, { align: "right" });
  (["R", "Y", "B"] as const).forEach((label, i) => {
    const lx = 91415 + i * 526;
    d.layer(L.sld);
    d.line(lx, lampLineY, lx, -73317);
    d.insert("IL", lx, -73213, 0.75);
    d.layer(L.text);
    d.text(label, lx, -72900, TXT, { align: "center" });
  });

  // ---- surge arrester
  const saX = 94161;
  d.layer(L.sld);
  d.line(saX, MAIN_Y, saX, -76471);
  d.insert("SA", saX, -76471);
  d.layer(L.text);
  d.text("SA", 93466, -77165, TXT, { vAlign: 0 });

  // ---- voltmeter (VSS + PT) dari bus
  const vY = -72629;
  d.layer(L.sld);
  d.circle(93982, vY, 214);
  d.line(94196, vY, 94522, vY);
  d.insert("SS", 94634, vY, 0.75);
  d.line(94747, vY, 95085, vY);
  d.insert("PT", 95085, vY, 0.75);
  d.line(95416, vY, BUS_X, vY);
  d.insert("DONUT", BUS_X, vY);
  d.layer(L.text);
  d.text("V", 93982, vY, TXT_SMALL, { align: "center" });
  d.text("0~400V", 93944, -72306, TXT_SMALL, { align: "center" });
  d.text("VSS", 94408, -73089, TXT_SMALL, { vAlign: 0 });
  d.text("PT", 95089, -72404, TXT_SMALL, { vAlign: 0 });

  // ---- ammeter (ASS) + CT
  if (main.ct) {
    const aY = -74565;
    const ctX = 95516;
    d.layer(L.sld);
    d.circle(93982, aY, 214);
    d.line(94196, aY, 94522, aY);
    d.insert("SS", 94634, aY, 0.75);
    d.line(94747, aY, ctX, aY);
    d.line(ctX, aY, ctX, MAIN_Y + 200);
    d.line(ctX - 75, MAIN_Y - 100, ctX - 75, MAIN_Y + 100);
    d.line(ctX + 75, MAIN_Y - 100, ctX + 75, MAIN_Y + 100);
    d.layer(L.text);
    d.text("A", 93982, aY, TXT_SMALL, { align: "center" });
    d.text(main.ammeter ?? "", 93944, -74242, TXT_SMALL, { align: "center" });
    d.text("ASS", 94408, -75030, TXT_SMALL, { vAlign: 0 });
    d.text("CT", ctX, -76050, TXT_SMALL, { align: "center" });
    d.text(main.ct, ctX, -76330, TXT_SMALL, { align: "center" });
  }

  // ================================================================ cabang circuit
  circuits.forEach((c, i) => {
    const y = rowMid(i);
    const spec = specs[i];
    const style = rowStyles[i];
    d.layer(L.sld);
    d.line(BUS_X, y, BRK_X, y);
    d.layer(L.breaker);
    d.insert(blockName(style), BRK_X, y);
    d.layer(L.sld);
    d.line(BRK_X + blockLen(style), y, spec.cableText ? TABLE_LEFT : BOX_RIGHT, y);

    d.layer(L.text);
    d.text(String(c.circuit_no), NO_X, y + 125, TXT, { vAlign: 0 });
    if (style.kind === "RCD") {
      // RCBO/RCCB: simbolnya panjang, teks rata kiri dengan jarak tetap dari
      // ujung simbol supaya tidak menempel (seperti gambar template yang dirapikan)
      d.text(spec.breaker, BRK_X + blockLen(style) + RCD_TEXT_GAP, y + 142, TXT, { vAlign: 0 });
    } else {
      d.text(spec.breaker, BRK_TEXT_X, y + 142, TXT, { align: "center", vAlign: 0 });
    }
    if (spec.cableText) {
      d.text(spec.cableText, CABLE_TEXT_X, y + 131, TXT, { align: "center", vAlign: 0 });
    }
  });

  // ================================================================ tabel
  d.layer(L.grid);
  d.line(xFunc, TABLE_TOP, tableRight, TABLE_TOP);
  d.line(xFix0, GROUP_BOTTOM, xRem, GROUP_BOTTOM);
  for (let i = 0; i <= tableRows; i++) {
    const y = HEAD_BOTTOM - i * ROW;
    d.line(xFunc, y, tableRight, y);
  }

  // kelompok kolom fixture (LIGHTING / RECEPTACLE / lain-lain)
  const groupName = (g: number) =>
    g === FIXTURE_GROUP.lighting
      ? "LIGHTING"
      : g === FIXTURE_GROUP.electrical
        ? "RECEPTACLE"
        : "OTHERS";
  const groups: { name: string; from: number; to: number }[] = [];
  cols.forEach((col, k) => {
    const name = groupName(fixtureGroup(col, circuits));
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.to = k;
    else groups.push({ name, from: k, to: k });
  });

  // garis vertikal: penuh di batas kelompok, dari bawah baris kelompok di dalamnya
  const fullX = new Set<number>([xFunc, xFix0, xDf, xR, xRem, tableRight]);
  for (const g of groups) fullX.add(xFix0 + g.from * FIX_W);
  const innerX: number[] = [];
  for (let k = 1; k < cols.length; k++) innerX.push(xFix0 + k * FIX_W);
  innerX.push(xR + PH_W, xR + 2 * PH_W);
  for (const x of fullX) d.line(x, TABLE_TOP, x, tableBottom);
  for (const x of innerX) if (!fullX.has(x)) d.line(x, GROUP_BOTTOM, x, tableBottom);

  // judul kolom
  d.layer(L.text);
  const headMid = (TABLE_TOP + HEAD_BOTTOM) / 2;
  const subMid = (GROUP_BOTTOM + HEAD_BOTTOM) / 2;
  const grpMid = (TABLE_TOP + GROUP_BOTTOM) / 2;
  d.text("FUNCTION", xFunc + funcW / 2, headMid, TXT, { align: "center" });
  d.text("D.F", xDf + DF_W / 2, headMid, TXT, { align: "center" });
  d.text("REMARKS", xRem + remW / 2, headMid, TXT, { align: "center" });
  d.text("DEMAND LOAD  (WATT)", xR + 1.5 * PH_W, grpMid, TXT, { align: "center" });
  (["R", "S", "T"] as const).forEach((p, k) =>
    d.text(p, xR + k * PH_W + PH_W / 2, subMid, TXT, { align: "center" })
  );
  for (const g of groups) {
    const x0 = xFix0 + g.from * FIX_W;
    const x1 = xFix0 + (g.to + 1) * FIX_W;
    d.text(g.name, (x0 + x1) / 2, grpMid, TXT, { align: "center" });
  }
  cols.forEach((col, k) => {
    const cx = xFix0 + k * FIX_W + FIX_W / 2;
    const lines = [
      ...wrapText(col.type, FIX_W - 200, TXT_FIX),
      ...(col.label ? wrapText(col.label, FIX_W - 200, TXT_FIX) : []),
    ].slice(0, 8);
    const lh = TXT_FIX * 1.5;
    lines.forEach((line, j) =>
      d.text(line, cx, subMid + ((lines.length - 1) / 2 - j) * lh, TXT_FIX, { align: "center" })
    );
  });

  // isi baris
  circuits.forEach((c, i) => {
    const y = rowMid(i);
    d.text(c.function_name, xFunc + 264, y, TXT);
    cols.forEach((col, k) => {
      const q = qtyOf(c, col.key);
      if (q) d.text(String(q), xFix0 + k * FIX_W + FIX_W / 2, y, TXT, { align: "center" });
    });
    const loads = [c.phase_r, c.phase_s, c.phase_t].map((w) => Number(w) || 0);
    if (loads.some((w) => w > 0)) d.text("1.0", xDf + DF_W / 2, y, TXT, { align: "center" });
    loads.forEach((w, k) => {
      if (w) d.text(nf.format(round1(w)), xR + k * PH_W + PH_W / 2, y, TXT, { align: "center" });
    });
    if (c.remarks) d.text(c.remarks, xRem + 200, y, TXT);
  });

  // total qty fixture di baris terakhir tabel
  const qtyY = rowMid(tableRows - 1);
  cols.forEach((col, k) => {
    const total = circuits.reduce((s, c) => s + qtyOf(c, col.key), 0);
    if (total) {
      d.text(String(total), xFix0 + k * FIX_W + FIX_W / 2, qtyY, TXT, { align: "center" });
    }
  });

  // ================================================================ ringkasan
  const pf = panelPowerFactor(panel);
  const subR = circuits.reduce((s, c) => s + Number(c.phase_r || 0), 0);
  const subS = circuits.reduce((s, c) => s + Number(c.phase_s || 0), 0);
  const subT = circuits.reduce((s, c) => s + Number(c.phase_t || 0), 0);
  const totalWatt = subR + subS + subT;
  const totalVA = totalWatt / pf;
  const is3ph = is3Phase(panel);
  const volt = panelVoltage(panel);
  const ampere = main.ampere;

  const summaries: [string, number[]][] = [
    ["SUB TOTAL", [subR, subS, subT]],
    ["TOTAL WATT", [totalWatt]],
    ["TOTAL  VA", [totalVA]],
    ["CONNECTED AMPERE", [ampere]],
  ];
  summaries.forEach(([label, values], i) => {
    const top = tableBottom - i * ROW;
    const mid = top - ROW / 2;
    d.layer(L.grid);
    d.line(xR, top - ROW, xR + 3 * PH_W, top - ROW);
    for (let k = 0; k <= 3; k++) d.line(xR + k * PH_W, top, xR + k * PH_W, top - ROW);
    d.layer(L.summary);
    d.text(label, xR - 400, mid, TXT, { align: "right" });
    if (values.length === 3) {
      values.forEach((v, k) =>
        d.text(nf.format(round1(v)), xR + (k + 1) * PH_W - 300, mid, TXT, { align: "right" })
      );
    } else {
      d.text(nf.format(round1(values[0])), xR + 2 * PH_W - 300, mid, TXT, { align: "right" });
    }
  });
  const summaryBottom = tableBottom - summaries.length * ROW;

  // ================================================================ catatan rumus
  d.layer(L.text);
  const notes = [
    t("RUMUS PERHITUNGAN:", "CALCULATION FORMULAS:"),
    `TOTAL WATT = SIGMA(R) + SIGMA(S) + SIGMA(T) = ${round1(subR)} + ${round1(subS)} + ${round1(subT)} = ${round1(totalWatt)} W`,
    `TOTAL VA = TOTAL WATT / cos phi = ${round1(totalWatt)} / ${pf} = ${round1(totalVA)} VA`,
    `CONNECTED AMPERE = TOTAL VA / ${is3ph ? "(sqrt3 x V)" : "V"} = ${round1(totalVA)} / ${
      is3ph ? `(1.732 x ${volt})` : volt
    } = ${round1(ampere)} A`,
    t(
      `MAIN BREAKER = CONNECTED AMPERE x 1,2 = ${round1(ampere * 1.2)} A -> ${main.breaker}; kabel incoming ${main.cable}`,
      `MAIN BREAKER = CONNECTED AMPERE x 1.2 = ${round1(ampere * 1.2)} A -> ${main.breaker}; incoming cable ${main.cable}`
    ),
    t(
      `BREAKER circuit = rating standar di atas ampere circuit x 1,2 (${BREAKER_RATINGS.join(", ")} A); ampere 1 fase = W / ${panelVoltageLN(panel)}`,
      `Circuit BREAKER = standard rating above circuit ampere x 1.2 (${BREAKER_RATINGS.join(", ")} A); single-phase ampere = W / ${panelVoltageLN(panel)}`
    ),
    t(
      "Kabel = NYY katalog KMI, ukuran terkecil dengan KHA di atas rating breaker. Satuan gambar mm, skala 1:1.",
      "Cable = NYY per KMI catalogue, smallest size with ampacity above the breaker rating. Drawing units mm, 1:1."
    ),
  ];
  notes.forEach((line, i) =>
    d.text(line, xFunc, summaryBottom - 800 - i * 450, TXT_SMALL, { vAlign: 0 })
  );

  // ================================================================ legend
  const lgX = tableRight + 1500;
  let lgY = TABLE_TOP;
  d.layer(L.legend);
  d.text("LEGEND :", lgX, lgY, TXT, { vAlign: 0 });
  lgY -= 1100;
  for (const [s, short, desc] of legendStyles) {
    d.layer(L.breaker);
    d.insert(blockName(s), lgX + 100, lgY);
    d.layer(L.legend);
    d.text(short, lgX + 150, lgY + 700, TXT_SMALL, { vAlign: 0 });
    d.text(`: ${desc}`, lgX + 2300, lgY + 150, TXT);
    lgY -= 1085;
  }
  d.insert("FUSE", lgX + 700, lgY);
  d.text(":  FUSE", lgX + 2300, lgY, TXT);
  lgY -= 750;
  d.insert("IL", lgX + 700, lgY, 0.94);
  d.text(":  INDICATOR LAMP", lgX + 2300, lgY, TXT);

  download(d.dxf.toDxfString(), panel.panel_code || "panel-schedule");
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
