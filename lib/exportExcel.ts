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

/** Export panel schedule ke .xlsx — kolom sama seperti tabel web (minus kolom SLD, itu visual saja). */
export async function exportPanelToExcel(
  panel: Panel,
  circuits: Circuit[],
  cols: FixtureCol[],
  projectName: string | null
) {
  const wb = new ExcelJS.Workbook();
  const sheetName =
    (panel.panel_code || "Panel Schedule").slice(0, 31).replace(/[[\]*?/\\:]/g, "_") ||
    "Panel Schedule";
  const ws = wb.addWorksheet(sheetName);

  const nCols = 4 + cols.length + 3 + 1; // NO/FUNCTION/BREAKER/CABLE + fixtures + R/S/T + REMARKS
  const idxR = 4 + cols.length; // 0-indexed posisi kolom R

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };

  function textRow(text: string, opts?: { bold?: boolean; size?: number }) {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, nCols);
    row.getCell(1).font = { bold: opts?.bold ?? false, size: opts?.size ?? 11 };
  }

  if (projectName) textRow(projectName, { bold: true, size: 13 });
  textRow(`${panel.panel_code}${panel.ip_rating ? ` (${panel.ip_rating})` : ""}`, {
    bold: true,
    size: 12,
  });
  const line2 = [panel.box_type, panel.location && `LOCATION ${panel.location}`]
    .filter(Boolean)
    .join(" - ");
  if (line2) textRow(line2);
  const line3 = [
    panel.source_panel,
    panel.main_breaker_type &&
      `${panel.main_breaker_type} ${panel.main_breaker_rating ?? ""}`.trim(),
    panel.fuse_rating,
  ]
    .filter(Boolean)
    .join(" | ");
  if (line3) textRow(line3);
  if (panel.incoming_cable) textRow(panel.incoming_cable);

  const pf = Number(panel.power_factor ?? 0.8) || 0.8;
  textRow(
    [panel.voltage, panel.phase, panel.wire, panel.freq].filter(Boolean).join(", ") +
      ` - cos phi ${pf}`
  );
  ws.addRow([]);

  const headerRow = ws.addRow([
    "NO.",
    "FUNCTION",
    "BREAKER",
    "CABLE",
    ...cols.map((c) => [c.type, c.label].filter(Boolean).join(" - ")),
    "R (WATT)",
    "S (WATT)",
    "T (WATT)",
    "REMARKS",
  ]);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
    cell.border = thinBorder;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });

  const qtyOf = (c: Circuit, key: string) =>
    (c.circuit_fixtures ?? [])
      .filter((f) => fixtureKey(f) === key)
      .reduce((s, f) => s + f.quantity, 0);

  for (const c of circuits) {
    const row = ws.addRow([
      c.circuit_no,
      c.function_name,
      [c.breaker_type, c.breaker_rating].filter(Boolean).join(" "),
      c.outgoing_cable ?? "",
      ...cols.map((col) => qtyOf(c, col.key) || null),
      c.phase_r || null,
      c.phase_s || null,
      c.phase_t || null,
      c.remarks ?? "",
    ]);
    row.eachCell((cell) => {
      cell.border = thinBorder;
    });
    if (c.is_spare) row.font = { color: { argb: "FFAAAAAA" } };
  }

  const totalQty = (key: string) => circuits.reduce((s, c) => s + qtyOf(c, key), 0);
  const subR = circuits.reduce((s, c) => s + Number(c.phase_r || 0), 0);
  const subS = circuits.reduce((s, c) => s + Number(c.phase_s || 0), 0);
  const subT = circuits.reduce((s, c) => s + Number(c.phase_t || 0), 0);
  const totalWatt = subR + subS + subT;
  const totalVA = totalWatt / pf;
  const is3ph = is3Phase(panel);
  const volt = panelVoltage(panel);
  const ampere = is3ph ? totalVA / (Math.sqrt(3) * volt) : totalVA / volt;

  const totalRow = new Array(nCols).fill("");
  totalRow[3] = "TOTAL";
  cols.forEach((col, i) => {
    totalRow[4 + i] = totalQty(col.key) || "";
  });
  ws.addRow(totalRow).font = { bold: true };

  function summaryRow(label: string, values: number[]) {
    const arr = new Array(nCols).fill("");
    arr[idxR - 1] = label;
    values.forEach((v, i) => {
      arr[idxR + i] = v;
    });
    ws.addRow(arr).font = { bold: true };
  }

  summaryRow("SUB TOTAL", [round1(subR), round1(subS), round1(subT)]);
  summaryRow("TOTAL WATT", [round1(totalWatt)]);
  summaryRow("TOTAL VA", [round1(totalVA)]);
  summaryRow("CONNECTED AMPERE", [round1(ampere)]);

  ws.addRow([]);
  textRow("Rumus perhitungan:", { bold: true });
  textRow(
    `TOTAL WATT = SIGMA(R) + SIGMA(S) + SIGMA(T) = ${round1(subR)} + ${round1(subS)} + ${round1(subT)} = ${round1(totalWatt)} W`
  );
  textRow(
    `TOTAL VA = TOTAL WATT / cos phi = ${round1(totalWatt)} / ${pf} = ${round1(totalVA)} VA`
  );
  textRow(
    `CONNECTED AMPERE = TOTAL VA / ${is3ph ? "(akar3 x V)" : "V"} = ${round1(totalVA)} / ${
      is3ph ? `(1.732 x ${volt})` : volt
    } = ${round1(ampere)} A`
  );

  ws.columns.forEach((col, i) => {
    col.width = i === 1 ? 28 : i === 3 ? 20 : 14;
  });

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
