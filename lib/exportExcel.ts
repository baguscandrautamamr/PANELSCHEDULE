import ExcelJS from "exceljs";
import type { Circuit, Panel } from "./types";
import { fixtureKey } from "./types";
import { is3Phase, panelVoltage } from "./panelCalc";

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
function autoWidth(values: (string | null | undefined)[], min: number, max: number) {
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
  projectName: string | null
) {
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

  const revitTotalOf = (c: Circuit) =>
    (Number(c.phase_r) || 0) + (Number(c.phase_s) || 0) + (Number(c.phase_t) || 0);

  /**
   * Watt/unit satu kolom fixture menurut data (kolom watt_per_unit) — hanya
   * dipakai kalau nilainya konsisten di semua circuit.
   */
  const wattFromData = (key: string): number | null => {
    const seen = new Set<number>();
    for (const c of circuits) {
      for (const fx of c.circuit_fixtures ?? []) {
        if (fixtureKey(fx) === key && fx.watt_per_unit != null) {
          seen.add(Number(fx.watt_per_unit));
        }
      }
    }
    return seen.size === 1 ? [...seen][0] : null;
  };

  /**
   * Watt/unit yang diturunkan dari data yang ada: pada circuit yang bebannya
   * hanya berasal dari SATU kolom fixture, watt/unit = demand load Revit / qty.
   * Dipakai kalau watt_per_unit kosong di database (mis. family Revit tidak
   * punya parameter "Wattage"), dan hanya kalau semua circuit semacam itu
   * sepakat pada angka yang sama.
   */
  const wattFromLoads = (key: string): number | null => {
    const candidates: number[] = [];
    for (const c of circuits) {
      const total = revitTotalOf(c);
      if (total <= 0) continue;
      const used = cols.filter((other) => qtyOf(c, other.key) > 0);
      if (used.length !== 1 || used[0].key !== key) continue;
      const qty = qtyOf(c, key);
      if (qty > 0) candidates.push(total / qty);
    }
    if (candidates.length === 0) return null;
    const min = Math.min(...candidates);
    const max = Math.max(...candidates);
    // tidak sepakat -> jangan dipakai, lebih baik kosong daripada salah
    if (max - min > Math.max(0.5, max * 0.01)) return null;
    return Math.round(((min + max) / 2) * 10) / 10;
  };

  const wattByCol: (number | null)[] = [];
  const wattIsDerived: boolean[] = [];
  for (const col of cols) {
    const fromData = wattFromData(col.key);
    const fromLoads = wattFromLoads(col.key);
    // angka dari data diutamakan, kecuali terbukti tidak cocok dengan beban
    // circuit yang cuma memakai kolom ini
    const trustData =
      fromData != null &&
      (fromLoads == null || Math.abs(fromData - fromLoads) <= Math.max(0.5, fromLoads * 0.01));
    const watt = trustData ? fromData : (fromLoads ?? fromData);
    wattByCol.push(watt);
    wattIsDerived.push(watt != null && watt !== fromData);
  }
  const derivedCount = wattIsDerived.filter(Boolean).length;

  const wFunc = autoWidth(
    [...circuits.map((c) => c.function_name), "FUNCTION"],
    18,
    46
  );
  const wCable = autoWidth(
    [...circuits.map((c) => c.outgoing_cable), "CABLE"],
    12,
    28
  );
  const wRemarks = autoWidth([...circuits.map((c) => c.remarks), "REMARKS"], 10, 28);

  ws.getColumn(C_NO).width = 6;
  ws.getColumn(C_FUNC).width = wFunc;
  ws.getColumn(C_BRK).width = autoWidth([...circuits.map(breakerText), "BREAKER"], 12, 22);
  ws.getColumn(C_CABLE).width = wCable;
  const wFix = 13;
  for (let i = 0; i < nFix; i++) ws.getColumn(C_FIX0 + i).width = wFix;
  for (let i = 0; i < 3; i++) ws.getColumn(C_R + i).width = 12;
  ws.getColumn(C_REMARKS).width = wRemarks;

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

  const pf = Number(panel.power_factor ?? 0.8) || 0.8;
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
  /** Total watt circuit = SUM(qty x watt/unit) sepanjang kolom fixture. */
  const sumProduct = (row: number) =>
    `SUMPRODUCT(${L(C_FIX0)}${row}:${L(C_R - 1)}${row},${L(C_FIX0)}$${rWattUnit}:${L(C_R - 1)}$${rWattUnit})`;

  let fallbackRows = 0;
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

    // Demand load per fase: pakai formula qty x watt/unit HANYA kalau hasilnya
    // memang sama dengan angka dari Revit. Kalau beda (watt/unit tidak diketahui,
    // load tidak berasal dari fixture, atau fase tidak seimbang), angka Revit
    // ditulis apa adanya supaya schedule tidak jadi salah.
    const phases = [Number(c.phase_r) || 0, Number(c.phase_s) || 0, Number(c.phase_t) || 0];
    const revitTotal = phases[0] + phases[1] + phases[2];
    const derived = cols.reduce(
      (s, col, i) => s + qtyOf(c, col.key) * (wattByCol[i] ?? 0),
      0
    );
    const energized = phases.filter((v) => v > 0).length;
    const balanced3 =
      energized === 3 &&
      Math.abs(phases[0] - phases[1]) < 0.05 &&
      Math.abs(phases[1] - phases[2]) < 0.05;
    const matches =
      revitTotal > 0 && Math.abs(derived - revitTotal) <= Math.max(0.5, revitTotal * 0.01);
    const useFormula = nFix > 0 && matches && (energized === 1 || balanced3);
    if (revitTotal > 0 && !useFormula) fallbackRows += 1;

    phases.forEach((value, i) => {
      row.getCell(C_R + i).value = !value
        ? null
        : useFormula
          ? { formula: balanced3 ? `${sumProduct(r)}/3` : sumProduct(r), result: round1(value) }
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
    "Rumus perhitungan (angka di kolom DEMAND LOAD & baris ringkasan adalah formula Excel, ikut berubah kalau data diedit):",
    ...(nFix > 0
      ? [
          `DEMAND LOAD R/S/T per circuit = SUMPRODUCT(qty kolom FIXTURE x baris WATT / UNIT di baris ${rWattUnit}), dibagi 3 untuk circuit 3 fase seimbang`,
          fallbackRows > 0
            ? `Catatan: ${fallbackRows} circuit tetap memakai angka demand load dari Revit (bukan formula) karena hasil qty x watt/unit tidak sama dengan nilai Revit — mis. watt/unit tidak diketahui atau bebannya tidak berasal dari fixture.`
            : "Semua circuit yang berbeban memakai formula qty x watt/unit.",
          ...(derivedCount > 0
            ? [
                `Angka WATT / UNIT yang dicetak MIRING (${derivedCount} kolom) tidak ada di data Revit — diturunkan dari demand load / qty pada circuit yang hanya memakai kolom itu. Sebaiknya dicek ulang terhadap spesifikasi fixture.`,
              ]
            : []),
        ]
      : []),
    `SUB TOTAL R/S/T (${cellRef(C_R, rSub)}..${cellRef(C_R + 2, rSub)}) = SUM per kolom fase, baris ${bodyTop}-${bodyBottom}`,
    `TOTAL WATT (${cellRef(C_R, rWatt)}) = SUB TOTAL R + S + T`,
    `TOTAL VA (${cellRef(C_R, rVA)}) = TOTAL WATT / cos phi (sel ${cellRef(C_BRK, rPf)})`,
    `CONNECTED AMPERE (${cellRef(C_R, rAmp)}) = TOTAL VA / ${
      is3ph ? `(SQRT(3) x V L-L)` : "V L-N"
    } (sel ${cellRef(C_BRK, rVolt)})`,
    `Sel berwarna kuning (cos phi ${cellRef(C_BRK, rPf)}, tegangan ${cellRef(C_BRK, rVolt)}${
      nFix > 0 ? `, baris WATT / UNIT ${rWattUnit}` : ""
    }) boleh diubah — angka di bawahnya ikut menyesuaikan.`,
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
