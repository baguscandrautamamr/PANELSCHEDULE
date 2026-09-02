import ExcelJS from "exceljs";
import type { Circuit, Panel } from "./types";
import { fixtureKey } from "./types";
import { is3Phase, panelPowerFactor, panelVoltage } from "./panelCalc";
import { solveFixtureWatts } from "./fixtureWatt";
import { COLUMN_WIDTH, pxToExcelWidth, type ColumnWidth } from "./panelColumns";
import { makeT, type Lang } from "./i18n";

interface FixtureCol {
  key: string;
  type: string;
  label: string | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

const HEAD_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFDCE6F1" },
};
const SUM_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF2F2F2" },
};
/** sel yang boleh diubah user (jadi acuan formula) — dibedakan warnanya */
const INPUT_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFF2CC" },
};

/** Lebar kolom Excel (satuan ~jumlah karakter) dari isi terpanjang. */
/** Perkiraan teks angka seperti tampilan Excel dengan format ribuan + 1 desimal. */
const numberText = (v: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);

/**
 * Lebar kolom Excel = lebar kolom yang sama di website (lib/panelColumns),
 * melebar seperlunya kalau isinya panjang sampai batas kolom itu. Kolom yang
 * lebarnya tetap (FIXTURE) tidak ikut melebar — judulnya yang turun baris.
 */
function colWidth(w: ColumnWidth, values: (string | null | undefined)[] = []) {
  const min = pxToExcelWidth(w.px);
  const max = pxToExcelWidth(w.maxPx);
  const longest = values.reduce((m, v) => Math.max(m, (v ?? "").length), 0);
  return Math.min(max, Math.max(min, longest + 2));
}

/**
 * Perkiraan jumlah baris hasil wrap teks di kolom selebar `width`, meniru cara
 * Excel: putus di spasi, dan kata yang lebih panjang dari kolom dipotong di
 * tengah kata. Dipakai untuk menghitung tinggi baris header — kalau tinggi
 * di-set terlalu pendek, Excel memotong teksnya (tidak auto-fit sendiri).
 */
function wrappedLines(value: string, width: number) {
  const usable = Math.max(1, width - 1);
  let lines = 0;

  for (const paragraph of value.split("\n")) {
    lines += 1;
    let used = 0;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (word.length > usable) {
        // kata panjang: pindah baris lalu dipotong sepanjang kolom
        if (used > 0) lines += 1;
        let rest = word.length;
        while (rest > usable) {
          lines += 1;
          rest -= usable;
        }
        used = rest;
      } else if (used === 0) {
        used = word.length;
      } else if (used + 1 + word.length <= usable) {
        used += 1 + word.length;
      } else {
        lines += 1;
        used = word.length;
      }
    }
  }
  return lines;
}

/**
 * Export panel schedule ke .xlsx dengan layout sama seperti tabel web:
 * header bertingkat (FIXTURE / DEMAND LOAD), garis di semua sel, lebar kolom
 * mengikuti isi, dan baris ringkasan hanya sekali di paling bawah.
 */
export async function exportPanelToExcel(
  panel: Panel,
  circuits: Circuit[],
  cols: FixtureCol[],
  projectName: string | null,
  lang: Lang = "id"
) {
  const t = makeT(lang);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Panel Schedule Web";
  wb.created = new Date();

  const sheetName =
    (panel.panel_code || "Panel Schedule").slice(0, 31).replace(/[[\]*?/\\:]/g, "_") ||
    "Panel Schedule";
  const ws = wb.addWorksheet(sheetName, {
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.3,
        right: 0.3,
        top: 0.4,
        bottom: 0.4,
        header: 0.2,
        footer: 0.2,
      },
    },
  });

  // ---------------------------------------------------------------- kolom
  const nFix = cols.length;
  const C_NO = 1;
  const C_FUNC = 2;
  const C_BRK = 3;
  const C_CABLE = 4;
  const C_FIX0 = 5;
  const C_R = C_FIX0 + nFix;
  const C_REMARKS = C_R + 3;
  const nCols = C_REMARKS;

  const qtyOf = (c: Circuit, key: string) =>
    (c.circuit_fixtures ?? [])
      .filter((f) => fixtureKey(f) === key)
      .reduce((s, f) => s + f.quantity, 0);

  const breakerText = (c: Circuit) =>
    [c.breaker_type, c.breaker_rating].filter(Boolean).join(" ");

  // Watt/unit tiap kolom FIXTURE: dari parameter Revit kalau ada, kalau tidak
  // dihitung balik dari demand load circuit (lihat lib/fixtureWatt).
  const { watt: wattByCol, source: wattSource } = solveFixtureWatts(circuits, cols);
  const wattIsDerived = wattSource.map((s) => s === "derived");
  const derivedCount = wattIsDerived.filter(Boolean).length;

  const wFunc = colWidth(COLUMN_WIDTH.function, [
    ...circuits.map((c) => c.function_name),
    "FUNCTION",
  ]);
  const wCable = colWidth(COLUMN_WIDTH.cable, [
    ...circuits.map((c) => c.outgoing_cable),
    "CABLE",
  ]);
  const wRemarks = colWidth(COLUMN_WIDTH.remarks, [
    ...circuits.map((c) => c.remarks),
    "REMARKS",
  ]);
  const wFix = colWidth(COLUMN_WIDTH.fixture);

  ws.getColumn(C_NO).width = colWidth(COLUMN_WIDTH.no);
  ws.getColumn(C_FUNC).width = wFunc;
  ws.getColumn(C_BRK).width = colWidth(COLUMN_WIDTH.breaker, [
    ...circuits.map(breakerText),
    "BREAKER",
  ]);
  ws.getColumn(C_CABLE).width = wCable;
  for (let i = 0; i < nFix; i++) ws.getColumn(C_FIX0 + i).width = wFix;
  // kolom R/S/T: pastikan muat angka terbesar yang muncul di baris ringkasan
  // (TOTAL VA) dengan format ribuan + 1 desimal
  const sumWatt = circuits.reduce(
    (s, c) => s + Number(c.phase_r || 0) + Number(c.phase_s || 0) + Number(c.phase_t || 0),
    0
  );
  const wPhase = colWidth(COLUMN_WIDTH.phase, [
    numberText(sumWatt / panelPowerFactor(panel)),
  ]);
  for (let i = 0; i < 3; i++) ws.getColumn(C_R + i).width = wPhase;
  ws.getColumn(C_REMARKS).width = wRemarks;
  // ExcelJS tidak ikut menulis lebar kolom yang nilainya persis 9 (dianggap
  // default-nya sendiri), sedangkan default Excel 8.43 — jadi default sheet-nya
  // di-set 9 supaya kolom seperti itu tetap selebar yang dihitung di sini.
  ws.properties.defaultColWidth = 9;

  // ---------------------------------------------------------------- judul
  let r = 0;
  function titleRow(text: string, opts?: { bold?: boolean; size?: number }) {
    r += 1;
    const row = ws.getRow(r);
    row.getCell(1).value = text;
    row.getCell(1).font = { bold: opts?.bold ?? false, size: opts?.size ?? 11 };
    row.getCell(1).alignment = { vertical: "middle" };
    ws.mergeCells(r, 1, r, nCols);
    row.height = (opts?.size ?? 11) + 6;
  }

  if (projectName) titleRow(projectName, { bold: true, size: 13 });
  titleRow(`${panel.panel_code}${panel.ip_rating ? ` (${panel.ip_rating})` : ""}`, {
    bold: true,
    size: 12,
  });

  const line2 = [panel.box_type, panel.location && `LOCATION ${panel.location}`]
    .filter(Boolean)
    .join(" - ");
  if (line2) titleRow(line2);

  const line3 = [
    panel.source_panel,
    panel.main_breaker_type &&
      `${panel.main_breaker_type} ${panel.main_breaker_rating ?? ""}`.trim(),
    panel.fuse_rating,
  ]
    .filter(Boolean)
    .join(" | ");
  if (line3) titleRow(line3);
  if (panel.incoming_cable) titleRow(panel.incoming_cable);

  const pf = panelPowerFactor(panel);
  const is3ph = is3Phase(panel);
  const volt = panelVoltage(panel);
  titleRow(
    `${[panel.voltage, panel.phase, panel.wire, panel.freq].filter(Boolean).join(", ")} - cos phi ${pf}`
  );

  // -------------------------------------------------- parameter perhitungan
  // Dibuat sebagai sel angka tersendiri, bukan cuma teks: TOTAL VA dan
  // CONNECTED AMPERE di bawah mengacu ke sel ini, jadi kalau cos phi atau
  // tegangan diubah di Excel, hasilnya ikut berubah.
  function paramRow(label: string, value: number, numFmt: string) {
    r += 1;
    const row = ws.getRow(r);
    row.getCell(1).value = label;
    row.getCell(1).font = { size: 10, bold: true };
    row.getCell(1).alignment = { vertical: "middle", horizontal: "right" };
    row.getCell(1).border = THIN;
    const cell = row.getCell(C_BRK);
    cell.value = value;
    cell.numFmt = numFmt;
    cell.font = { size: 10 };
    cell.fill = INPUT_FILL;
    cell.border = THIN;
    cell.alignment = { vertical: "middle", horizontal: "center" };
    ws.getRow(r).getCell(2).border = THIN;
    ws.mergeCells(r, 1, r, C_FUNC);
    row.height = 15;
    return r;
  }

  const rPf = paramRow("cos phi", pf, "0.00");
  const rVolt = paramRow(`V ${is3ph ? "(L-L)" : "(L-N)"}`, volt, "#,##0");
  r += 1; // baris kosong pemisah

  // ---------------------------------------------------------------- header
  const headTop = r + 1;
  const headBottom = headTop + 1;
  r = headBottom;

  const put = (row: number, col: number, value: ExcelJS.CellValue) => {
    ws.getRow(row).getCell(col).value = value;
  };

  put(headTop, C_NO, "NO.");
  put(headTop, C_FUNC, "FUNCTION");
  put(headTop, C_BRK, "BREAKER");
  put(headTop, C_CABLE, "CABLE");
  put(headTop, C_REMARKS, "REMARKS");

  if (nFix > 0) {
    put(headTop, C_FIX0, "FIXTURE");
    cols.forEach((col, i) => {
      put(headBottom, C_FIX0 + i, [col.type, col.label].filter(Boolean).join("\n"));
    });
  }

  put(headTop, C_R, "DEMAND LOAD (WATT)");
  (["R", "S", "T"] as const).forEach((label, i) => {
    put(headBottom, C_R + i, `${label} (WATT)`);
  });

  for (let row = headTop; row <= headBottom; row++) {
    for (let c = 1; c <= nCols; c++) {
      const cell = ws.getRow(row).getCell(c);
      cell.font = { bold: true, size: 10 };
      cell.fill = HEAD_FILL;
      cell.border = THIN;
      cell.alignment = {
        vertical: "middle",
        horizontal: "center",
        wrapText: true,
      };
    }
  }

  // Semua sel di rentang merge ikut di-style di loop atas (bukan cuma sel
  // master), supaya kotak hasil merge punya garis lengkap di keempat sisinya.
  for (const c of [C_NO, C_FUNC, C_BRK, C_CABLE, C_REMARKS]) {
    ws.mergeCells(headTop, c, headBottom, c);
  }
  if (nFix > 0) ws.mergeCells(headTop, C_FIX0, headTop, C_FIX0 + nFix - 1);
  ws.mergeCells(headTop, C_R, headTop, C_R + 2);

  ws.getRow(headTop).height = 18;
  // tinggi baris nama fixture dihitung dari teks terpanjang supaya tidak terpotong
  const fixLines = cols.reduce(
    (m, col) =>
      Math.max(m, wrappedLines([col.type, col.label].filter(Boolean).join("\n"), wFix)),
    2
  );
  // +1 baris cadangan: lebar kolom Excel dihitung dari lebar karakter font,
  // bukan jumlah karakter, jadi wrap-nya bisa sedikit lebih panjang dari hitungan
  ws.getRow(headBottom).height = Math.min(160, Math.max(30, (fixLines + 1) * 11 + 4));

  const L = (col: number) => ws.getColumn(col).letter;

  // ------------------------------------------------- baris pengali WATT/UNIT
  // Jadi acuan formula demand load R/S/T di bawah, sekaligus bisa diubah user.
  // Panel tanpa kolom fixture tidak perlu baris ini (tidak ada yang dikalikan).
  let rWattUnit = 0;
  if (nFix > 0) {
    r += 1;
    rWattUnit = r;
    const row = ws.getRow(r);
    row.getCell(1).value = "WATT / UNIT";
    cols.forEach((col, i) => {
      row.getCell(C_FIX0 + i).value = wattByCol[i];
    });
    for (let col = 1; col <= nCols; col++) {
      const cell = row.getCell(col);
      const isFix = col >= C_FIX0 && col < C_R;
      cell.border = THIN;
      // watt hasil turunan (bukan dari data) ditulis miring supaya kelihatan
      // bahwa angkanya hasil hitungan balik, bukan dari parameter Revit
      cell.font = {
        bold: true,
        size: 9,
        italic: isFix && wattIsDerived[col - C_FIX0],
      };
      cell.fill = isFix ? INPUT_FILL : SUM_FILL;
      cell.alignment = {
        vertical: "middle",
        horizontal: col <= C_CABLE ? "right" : "center",
      };
      if (isFix) cell.numFmt = "#,##0.#";
    }
    ws.mergeCells(r, 1, r, C_CABLE);
    row.height = 14;
  }

  // ---------------------------------------------------------------- isi
  const bodyTop = r + 1;
  /** Rentang sel qty FIXTURE satu baris & rentang sel WATT / UNIT-nya. */
  const qtyRange = (row: number) => `${L(C_FIX0)}${row}:${L(C_R - 1)}${row}`;
  const wattRange = `${L(C_FIX0)}$${rWattUnit}:${L(C_R - 1)}$${rWattUnit}`;
  /** Total watt circuit = SUM(qty x watt/unit) sepanjang kolom fixture. */
  const sumProduct = (row: number) => `SUMPRODUCT(${qtyRange(row)},${wattRange})`;
  /**
   * Jumlah kolom yang ada qty-nya tapi WATT / UNIT-nya masih kosong. Selama
   * masih ada (>0), demand load-nya belum bisa dihitung dari qty x watt.
   */
  const blankWatt = (row: number) =>
    `SUMPRODUCT((${qtyRange(row)}<>"")*(${wattRange}=""))`;

  let fallbackRows = 0;
  let pendingRows = 0;
  for (const c of circuits) {
    r += 1;
    const row = ws.getRow(r);
    row.getCell(C_NO).value = c.circuit_no;
    row.getCell(C_FUNC).value = c.function_name;
    row.getCell(C_BRK).value = breakerText(c);
    row.getCell(C_CABLE).value = c.outgoing_cable ?? "";
    cols.forEach((col, i) => {
      row.getCell(C_FIX0 + i).value = qtyOf(c, col.key) || null;
    });

    const phases = [Number(c.phase_r) || 0, Number(c.phase_s) || 0, Number(c.phase_t) || 0];
    const revitTotal = phases[0] + phases[1] + phases[2];
    const used = cols
      .map((col, i) => (qtyOf(c, col.key) > 0 ? i : -1))
      .filter((i) => i >= 0);
    const allWattKnown = used.length > 0 && used.every((i) => wattByCol[i] != null);
    const derived = used.reduce((s, i) => s + qtyOf(c, cols[i].key) * (wattByCol[i] ?? 0), 0);
    const matches =
      revitTotal > 0 && Math.abs(derived - revitTotal) <= Math.max(0.5, revitTotal * 0.01);

    /**
     * Pembagian hasil qty x watt/unit ke tiap fase. Fase yang berbeban sama rata
     * (1, 2, atau 3 pole balance) dibagi rata; kalau tidak, dipakai porsi
     * masing-masing fase seperti di model Revit.
     */
    const live = phases.filter((v) => v > 0);
    const equalShare = live.length > 0 && live.every((v) => Math.abs(v - live[0]) < 0.05);
    const shareExpr = (value: number) =>
      equalShare
        ? live.length === 1
          ? sumProduct(r)
          : `${sumProduct(r)}/${live.length}`
        : `${sumProduct(r)}*${Math.round((value / revitTotal) * 1e6) / 1e6}`;

    /**
     * Demand load per fase ditulis sebagai:
     *  - FORMULA murni  : watt/unit semua kolom sudah diketahui DAN hasilnya cocok
     *                     dengan angka Revit;
     *  - FORMULA + fallback : masih ada kolom yang WATT / UNIT-nya kosong. Selama
     *                     kosong yang tampil angka Revit apa adanya, begitu user
     *                     mengisi watt-nya di baris WATT / UNIT sel ini langsung
     *                     berubah jadi hasil qty x watt/unit;
     *  - ANGKA MATI     : watt sudah lengkap tapi hasilnya tidak sama dengan angka
     *                     Revit (beban tidak berasal dari fixture, dsb) — angka
     *                     Revit dipertahankan supaya schedule tidak jadi salah.
     */
    const mode =
      nFix === 0 || revitTotal <= 0 || used.length === 0
        ? "static"
        : allWattKnown
          ? matches
            ? "formula"
            : "static"
          : "pending";
    if (revitTotal > 0 && mode === "static") fallbackRows += 1;
    if (mode === "pending") pendingRows += 1;

    phases.forEach((value, i) => {
      const cell = row.getCell(C_R + i);
      if (!value) {
        cell.value = null;
        return;
      }
      const result = round1(value);
      cell.value =
        mode === "formula"
          ? { formula: shareExpr(value), result }
          : mode === "pending"
            ? { formula: `IF(${blankWatt(r)}>0,${result},${shareExpr(value)})`, result }
            : value;
    });

    row.getCell(C_REMARKS).value = c.remarks ?? "";

    for (let col = 1; col <= nCols; col++) {
      const cell = row.getCell(col);
      cell.border = THIN;
      cell.font = { size: 10, color: { argb: c.is_spare ? "FF999999" : "FF000000" } };
      // kolom teks di-wrap supaya isi panjang tidak tertutup kolom sebelahnya
      const wrap = col === C_FUNC || col === C_CABLE || col === C_REMARKS;
      cell.alignment = {
        vertical: "middle",
        horizontal:
          col === C_NO || (col >= C_FIX0 && col < C_R)
            ? "center"
            : col >= C_R && col < C_REMARKS
              ? "right"
              : col === C_BRK
                ? "center"
                : "left",
        wrapText: wrap,
      };
      if (col >= C_R && col < C_REMARKS) cell.numFmt = "#,##0.#";
      if (col >= C_FIX0 && col < C_R) cell.numFmt = "#,##0";
    }
  }

  const bodyBottom = r;

  // ---------------------------------------------------------------- ringkasan
  const subR = circuits.reduce((s, c) => s + Number(c.phase_r || 0), 0);
  const subS = circuits.reduce((s, c) => s + Number(c.phase_s || 0), 0);
  const subT = circuits.reduce((s, c) => s + Number(c.phase_t || 0), 0);
  const totalWatt = subR + subS + subT;
  const totalVA = totalWatt / pf;
  const ampere = is3ph ? totalVA / (Math.sqrt(3) * volt) : totalVA / volt;

  // Semua angka ringkasan ditulis sebagai FORMULA Excel (bukan angka mati),
  // supaya kalau ada watt/qty yang diedit di Excel, total ikut terhitung ulang.
  // `result` diisi juga sebagai nilai cache, jadi angkanya sudah kelihatan
  // walau dibuka di aplikasi yang tidak menghitung ulang formula.
  const hasRows = circuits.length > 0;
  const colRange = (col: number) => `${L(col)}${bodyTop}:${L(col)}${bodyBottom}`;
  /** Sel formula; kalau panel belum ada circuit, tulis angka biasa saja. */
  const f = (formula: string, result: number): ExcelJS.CellValue =>
    hasRows ? { formula, result } : result;

  /** Baris ringkasan: label rata kanan + nilai, semua bergaris & tebal. */
  function summaryRow(
    label: string,
    fill: (row: ExcelJS.Row) => void,
    labelUntil: number
  ) {
    r += 1;
    const row = ws.getRow(r);
    row.getCell(1).value = label;
    fill(row);
    for (let col = 1; col <= nCols; col++) {
      const cell = row.getCell(col);
      cell.border = THIN;
      cell.fill = SUM_FILL;
      cell.font = { bold: true, size: 10 };
      cell.alignment = {
        vertical: "middle",
        horizontal: col <= labelUntil ? "right" : col === C_REMARKS ? "left" : "center",
      };
      if (col >= C_R && col < C_REMARKS) cell.numFmt = "#,##0.#";
    }
    ws.mergeCells(r, 1, r, labelUntil);
    row.height = 16;
    return r;
  }

  // TOTAL qty fixture — label mundur ke kolom CABLE supaya tidak menimpa angkanya
  summaryRow(
    "TOTAL",
    (row) =>
      cols.forEach((col, i) => {
        const c = C_FIX0 + i;
        row.getCell(c).value = f(
          `SUM(${colRange(c)})`,
          circuits.reduce((s, cc) => s + qtyOf(cc, col.key), 0)
        );
      }),
    C_CABLE
  );

  const rSub = summaryRow(
    "SUB TOTAL",
    (row) => {
      row.getCell(C_R).value = f(`SUM(${colRange(C_R)})`, round1(subR));
      row.getCell(C_R + 1).value = f(`SUM(${colRange(C_R + 1)})`, round1(subS));
      row.getCell(C_R + 2).value = f(`SUM(${colRange(C_R + 2)})`, round1(subT));
    },
    C_R - 1
  );

  // TOTAL WATT = SUB TOTAL R + S + T
  const rWatt = summaryRow(
    "TOTAL WATT",
    (row) =>
      (row.getCell(C_R).value = f(
        `SUM(${L(C_R)}${rSub}:${L(C_R + 2)}${rSub})`,
        round1(totalWatt)
      )),
    C_R - 1
  );
  ws.mergeCells(rWatt, C_R, rWatt, C_R + 2);

  // TOTAL VA = TOTAL WATT / cos phi (sel parameter)
  const rVA = summaryRow(
    "TOTAL VA",
    (row) =>
      (row.getCell(C_R).value = f(
        `${L(C_R)}${rWatt}/${L(C_BRK)}$${rPf}`,
        round1(totalVA)
      )),
    C_R - 1
  );
  ws.mergeCells(rVA, C_R, rVA, C_R + 2);

  // CONNECTED AMPERE = TOTAL VA / (akar3 x V) untuk 3 fase, atau / V untuk 1 fase
  const ampereFormula = is3ph
    ? `${L(C_R)}${rVA}/(SQRT(3)*${L(C_BRK)}$${rVolt})`
    : `${L(C_R)}${rVA}/${L(C_BRK)}$${rVolt}`;
  const rAmp = summaryRow(
    "CONNECTED AMPERE",
    (row) => (row.getCell(C_R).value = f(ampereFormula, round1(ampere))),
    C_R - 1
  );
  ws.mergeCells(rAmp, C_R, rAmp, C_R + 2);

  // ---------------------------------------------------------------- catatan
  r += 1;
  // Catatan sengaja tidak memuat angka hasil: angkanya hidup di sel formula
  // di atas, jadi kalau ada yang diedit catatan ini tidak jadi basi.
  const cellRef = (col: number, row: number) => `${L(col)}${row}`;
  const notes = [
    t(
      "Rumus perhitungan (angka di kolom DEMAND LOAD & baris ringkasan adalah formula Excel, ikut berubah kalau data diedit):",
      "Calculation formulas (the numbers in the DEMAND LOAD columns & summary rows are Excel formulas — they follow any edit):"
    ),
    ...(nFix > 0
      ? [
          t(
            `DEMAND LOAD R/S/T per circuit = SUMPRODUCT(qty kolom FIXTURE x baris WATT / UNIT di baris ${rWattUnit}), dibagi rata ke fase yang berbeban (mis. /3 untuk circuit 3 fase seimbang)`,
            `DEMAND LOAD R/S/T per circuit = SUMPRODUCT(FIXTURE column qty x the WATT / UNIT row at row ${rWattUnit}), split evenly across the energized phases (e.g. /3 for a balanced three-phase circuit)`
          ),
          pendingRows > 0
            ? t(
                `${pendingRows} circuit memakai kolom FIXTURE yang WATT / UNIT-nya masih kosong (sel kuning di baris ${rWattUnit}). Sel demand load-nya sudah berisi formula: selama watt-nya kosong yang tampil angka dari Revit, dan begitu watt-nya diisi angkanya langsung berubah jadi qty x watt/unit — SUB TOTAL, TOTAL WATT, TOTAL VA, dan CONNECTED AMPERE ikut menyesuaikan.`,
                `${pendingRows} circuits use FIXTURE columns whose WATT / UNIT is still empty (the yellow cells on row ${rWattUnit}). Their demand load cells already hold a formula: while the watt is empty they show the figure from Revit, and the moment you type the watt they switch to qty x watt/unit — SUB TOTAL, TOTAL WATT, TOTAL VA and CONNECTED AMPERE follow.`
              )
            : t(
                "Semua kolom FIXTURE sudah punya angka WATT / UNIT.",
                "Every FIXTURE column already has a WATT / UNIT figure."
              ),
          fallbackRows > 0
            ? t(
                `${fallbackRows} circuit tetap memakai angka demand load dari Revit (angka mati, bukan formula) karena bebannya tidak berasal dari fixture di tabel ini — mis. beban langsung dari equipment — jadi qty x watt/unit tidak akan pernah sama dengan nilai Revit.`,
                `${fallbackRows} circuits keep the demand load figure from Revit (a plain number, not a formula) because their load does not come from the fixtures in this table — e.g. a load straight from equipment — so qty x watt/unit would never match the Revit value.`
              )
            : t(
                "Semua circuit yang berbeban memakai formula qty x watt/unit.",
                "Every loaded circuit uses the qty x watt/unit formula."
              ),
          ...(derivedCount > 0
            ? [
                t(
                  `Angka WATT / UNIT yang dicetak MIRING (${derivedCount} kolom) tidak ada di data Revit — dihitung balik dari demand load / qty circuit yang memakai kolom itu. Sebaiknya dicek ulang terhadap spesifikasi fixture.`,
                  `The ITALIC WATT / UNIT figures (${derivedCount} columns) are not in the Revit data — they are back-calculated from demand load / qty of the circuits that use those columns. Please check them against the fixture specification.`
                ),
              ]
            : []),
        ]
      : []),
    t(
      `SUB TOTAL R/S/T (${cellRef(C_R, rSub)}..${cellRef(C_R + 2, rSub)}) = SUM per kolom fase, baris ${bodyTop}-${bodyBottom}`,
      `SUB TOTAL R/S/T (${cellRef(C_R, rSub)}..${cellRef(C_R + 2, rSub)}) = SUM per phase column, rows ${bodyTop}-${bodyBottom}`
    ),
    `TOTAL WATT (${cellRef(C_R, rWatt)}) = SUB TOTAL R + S + T`,
    t(
      `TOTAL VA (${cellRef(C_R, rVA)}) = TOTAL WATT / cos phi (sel ${cellRef(C_BRK, rPf)})`,
      `TOTAL VA (${cellRef(C_R, rVA)}) = TOTAL WATT / cos phi (cell ${cellRef(C_BRK, rPf)})`
    ),
    t(
      `CONNECTED AMPERE (${cellRef(C_R, rAmp)}) = TOTAL VA / ${
        is3ph ? `(SQRT(3) x V L-L)` : "V L-N"
      } (sel ${cellRef(C_BRK, rVolt)})`,
      `CONNECTED AMPERE (${cellRef(C_R, rAmp)}) = TOTAL VA / ${
        is3ph ? `(SQRT(3) x V L-L)` : "V L-N"
      } (cell ${cellRef(C_BRK, rVolt)})`
    ),
    t(
      `Sel berwarna kuning (cos phi ${cellRef(C_BRK, rPf)}, tegangan ${cellRef(C_BRK, rVolt)}${
        nFix > 0 ? `, baris WATT / UNIT ${rWattUnit}` : ""
      }) boleh diisi/diubah — angka di bawahnya ikut menyesuaikan.`,
      `The yellow cells (cos phi ${cellRef(C_BRK, rPf)}, voltage ${cellRef(C_BRK, rVolt)}${
        nFix > 0 ? `, WATT / UNIT row ${rWattUnit}` : ""
      }) can be filled in or edited — everything below follows.`
    ),
  ];
  notes.forEach((text, i) => {
    r += 1;
    const cell = ws.getRow(r).getCell(1);
    cell.value = text;
    cell.font = { size: 10, bold: i === 0 };
    cell.alignment = { vertical: "middle" };
    ws.mergeCells(r, 1, r, nCols);
  });

  // ---------------------------------------------------------------- tampilan
  // header tetap terlihat saat di-scroll & saat dicetak multi-halaman
  ws.views = [{ state: "frozen", xSplit: C_CABLE, ySplit: headBottom }];
  ws.pageSetup.printTitlesRow = `${headTop}:${headBottom}`;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(panel.panel_code || "panel-schedule").replace(/[\\/:*?"<>|]/g, "_")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
