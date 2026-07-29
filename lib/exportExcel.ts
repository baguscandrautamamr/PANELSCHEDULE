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
  titleRow(
    `${[panel.voltage, panel.phase, panel.wire, panel.freq].filter(Boolean).join(", ")} - cos phi ${pf}`
  );
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

  // ---------------------------------------------------------------- isi
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
    row.getCell(C_R).value = Number(c.phase_r) || null;
    row.getCell(C_R + 1).value = Number(c.phase_s) || null;
    row.getCell(C_R + 2).value = Number(c.phase_t) || null;
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

  // ---------------------------------------------------------------- ringkasan
  const subR = circuits.reduce((s, c) => s + Number(c.phase_r || 0), 0);
  const subS = circuits.reduce((s, c) => s + Number(c.phase_s || 0), 0);
  const subT = circuits.reduce((s, c) => s + Number(c.phase_t || 0), 0);
  const totalWatt = subR + subS + subT;
  const totalVA = totalWatt / pf;
  const is3ph = is3Phase(panel);
  const volt = panelVoltage(panel);
  const ampere = is3ph ? totalVA / (Math.sqrt(3) * volt) : totalVA / volt;

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
  }

  // TOTAL qty fixture — label mundur ke kolom CABLE supaya tidak menimpa angkanya
  summaryRow(
    "TOTAL",
    (row) =>
      cols.forEach((col, i) => {
        row.getCell(C_FIX0 + i).value =
          circuits.reduce((s, c) => s + qtyOf(c, col.key), 0) || null;
      }),
    C_CABLE
  );
  summaryRow(
    "SUB TOTAL",
    (row) => {
      row.getCell(C_R).value = round1(subR);
      row.getCell(C_R + 1).value = round1(subS);
      row.getCell(C_R + 2).value = round1(subT);
    },
    C_R - 1
  );
  for (const [label, value] of [
    ["TOTAL WATT", round1(totalWatt)],
    ["TOTAL VA", round1(totalVA)],
    ["CONNECTED AMPERE", round1(ampere)],
  ] as const) {
    summaryRow(label, (row) => (row.getCell(C_R).value = value), C_R - 1);
    ws.mergeCells(r, C_R, r, C_R + 2);
  }

  // ---------------------------------------------------------------- catatan
  r += 1;
  const notes = [
    "Rumus perhitungan:",
    `TOTAL WATT = SIGMA(R) + SIGMA(S) + SIGMA(T) = ${round1(subR)} + ${round1(subS)} + ${round1(subT)} = ${round1(totalWatt)} W`,
    `TOTAL VA = TOTAL WATT / cos phi = ${round1(totalWatt)} / ${pf} = ${round1(totalVA)} VA`,
    `CONNECTED AMPERE = TOTAL VA / ${is3ph ? "(akar3 x V)" : "V"} = ${round1(totalVA)} / ${
      is3ph ? `(1.732 x ${volt})` : volt
    } = ${round1(ampere)} A`,
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
