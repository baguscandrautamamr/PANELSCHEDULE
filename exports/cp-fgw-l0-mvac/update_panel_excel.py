"""Update PANEL SCHEDULE PP-HVAC (sheet CP-FGW-L0-MVAC + CABLE SIZING) to the R2 circuit list.

Usage: python3 update_panel_excel.py <input.xlsx> <output.xlsx>
circuits.json is written by build_panel_schedule.py (same circuits as the DXF).
"""
import json, sys
from copy import copy
from pathlib import Path
import openpyxl

src, dst = sys.argv[1], sys.argv[2]
circuits = json.load(open(Path(__file__).with_name("circuits.json")))

MODEL = {  # IU/OU tag -> Daikin model (cooling load sheet)
    "IU/OU D-001": "FTKE50AV1F/RKE50AV1", "IU/OU D-002": "FCF100CVM/RZF100CYM",
    "IU/OU D-003": "FTKE25AV1F/RKE25AV1", "IU/OU D-004": "FTKE50AV1F/RKE50AV1",
    "IU/OU D-005": "FCF100CVM/RZF100CYM", "IU/OU D-006": "FTKE35AV1F/RKE35AV1",
    "IU/OU D-007": "FTKE25AV1F/RKE25AV1", "IU/OU D-101": "FCF125CVM/RZF125CYM",
    "IU/OU D-102": "FTKE50AV1F/RKE50AV1", "IU/OU D-105": "FTKE50AV1F/RKE50AV1",
    "IU/OU D-106": "FTKE50AV1F/RKE50AV1", "IU/OU D-107": "FTKE60AV1F/RKE60AV1",
    "IU/OU D-108": "FTKE50AV1F/RKE50AV1", "IU/OU D-109": "FTKE25AV1F/RKE25AV1",
}
FAN1_REMARK = {
    "EF D-003": "INLINE CENTRIFUGAL CABINET FAN",
    "EF D-004": "INLINE CENTRIFUGAL CABINET FAN",
    "EF/CF D-101": "SIROCCO VENT. FAN 50W + CEILING PROPELLER FAN 70W",
    "EF/CF D-102": "SIROCCO VENT. FAN 70W + CEILING PROPELLER FAN 70W",
    "EF D-103": "CEILING MOUNTED SIROCCO VENTILATING FAN",
}

wb = openpyxl.load_workbook(src)
ws = wb["CP-FGW-L0-MVAC"]
FIRST, OLD_LAST, OLD_TAIL_END = 10, 59, 80
n_rows = len(circuits) + 3                     # + spare
NEW_LAST = FIRST + n_rows - 1
shift = NEW_LAST - OLD_LAST

# move the totals / notes block down, keeping merges and row heights
tail = [r for r in ws.merged_cells.ranges if r.min_row > OLD_LAST]
for r in tail:
    ws.unmerge_cells(str(r))
heights = {r: ws.row_dimensions[r].height for r in range(OLD_LAST + 1, OLD_TAIL_END + 1)}
ws.move_range(f"A{OLD_LAST + 1}:M{OLD_TAIL_END}", rows=shift, translate=True)
for r, h in heights.items():
    ws.row_dimensions[r + shift].height = h
    ws.row_dimensions[r].height = None
for r in tail:
    r.shift(0, shift)
    ws.merge_cells(str(r))

# data rows
tmpl = {c.column: c for c in ws[FIRST]}
for row in range(FIRST, NEW_LAST + 1):
    for col in range(1, 12):
        cell = ws.cell(row, col)
        t = tmpl[col]
        cell.font, cell.fill, cell.border = copy(t.font), copy(t.fill), copy(t.border)
        cell.alignment, cell.number_format = copy(t.alignment), t.number_format
        cell.value = None
    ws.row_dimensions[row].height = 15.0

for i, c in enumerate(circuits):
    r = FIRST + i
    tag = c["tag"]
    if c["kind"] == "fan3":
        func = f"{tag}   {c['room'].replace('FG WH (D-012) WALL FAN', 'WALL FAN FINISH GOOD WAREHOUSE (D-012)')}"
        if c.get("emerg"):
            rem = "ACTIVE ON EMERGENCY, F400/120, CLASS H MOTOR, CONNECT TO FIRE ALARM"
        else:
            rem = "NORMAL OPERATION, CONNECT TO FIRE ALARM"
        rem = "WALL MOUNTED INDUSTRIAL FAN, " + rem
    elif c["kind"] in ("ac1", "ac3"):
        func = f"{tag}   {c['room']}"
        rem = f"{c['type'].replace('AC ', '')}, {MODEL[tag]}"
    else:
        func = f"{tag}   {c['room']}"
        rem = FAN1_REMARK[tag]
    cable = f"{c['c1']} {c['c2']} {c['c3']}"
    ws.cell(r, 1, i + 1)
    ws.cell(r, 2, f"{c['brk']} {c['amp']} 6kA")
    ws.cell(r, 3, cable)
    ws.cell(r, 4, func)
    ws.cell(r, 5, round(c["kw"] * 1000, 1))
    ws.cell(r, 6, "3 PH" if c["ph"] == 3 else "1 PH")
    if c["ph"] == 3:
        for col in "GHI":
            ws[f"{col}{r}"] = f"=$E{r}/3"
    else:
        ws[f"{'GHI'['RST'.index(c['phase'])]}{r}"] = f"=$E{r}"
    ws.cell(r, 10, rem)
    ws.cell(r, 11, c["st"])
for k in range(3):
    r = FIRST + len(circuits) + k
    ws.cell(r, 1, len(circuits) + k + 1)
    ws.cell(r, 4, "SPARE")

# totals and notes (rows moved by `shift`)
T = OLD_LAST + 1 + shift                       # SUB TOTAL row
for col in "GHI":
    ws[f"{col}{T}"] = f"=SUM({col}{FIRST}:{col}{NEW_LAST})"
ws[f"G{T + 8}"] = "MCCB-3P 500A"
N = T + 10                                     # first note row ("1.  ...")
ws[f"A{N + 1}"] = (f"1.  Isi sheet ini mengikuti gambar ME-D-LV-6002 R2 (CP-FGW-L0-MVAC): {len(circuits)} circuit + 3 spare. "
                   "Beban dari HBE Cooling Load Calculation (Daikin split) & Fan Equipment Schedule FG Warehouse.")
ws[f"A{N + 2}"] = ("2.  DEMAND LOAD R/S/T = beban circuit; circuit 3 fase dibagi rata 3 (=$E/3). "
                   "Beban 1 fase mengikuti label fasa di gambar (diseimbangkan R/S/T).")
ws[f"A{N + 4}"] = ("4.  STARTER: beban 5 kW ke atas memakai SOFT STARTER (SS) dengan bypass, di bawah 5 kW memakai DOL. "
                   "R2: semua beban < 5 kW -> DOL (fan 3.7 kW).")
ws[f"A{N + 5}"] = ("5.  Kabel motor 3 fase: 1x3C + 1C earthing. Fan 3.7 kW: FLA 7.0 A -> MCB-3P 16A, 3C-4mm2. "
                   "AC 3 fase (RZF-CYM, 3N~): 1x5C-4mm2 incl. N+E, MCB-3P 16A. AC 1 fase: 3C-4mm2, 10A/16A.")
ws[f"A{N + 7}"] = ("6.  Incoming: MCCB-3P 500A 36kA dari MDB-FGW-L0, kabel 2x(1x4C-240mm2) + 1x(1C-120mm2 G/Y), "
                   "CT 500/5A, busbar 630A. Lihat sheet CABLE SIZING. Breaker feeder di MDB-FGW-L0 perlu disesuaikan.")
ws[f"A{N + 8}"] = ("7.  EF D-001.09~28 ACTIVE ON EMERGENCY (kabel FRC) + EF D-001.01~08 & 29~45 NORMAL, "
                   "semua dengan kontaktor 24VDC interlock ke fire alarm. Status EF D-001.29~45 perlu dikonfirmasi.")

ws[f"A{N + 9}"] = ("8.  Sesuai note 12 sheet FAN: BS EN 12101-3 F400/120, motor class H, kabel tahan api, "
                   "emergency overload bypass - starter DOL fan smoke perlu bypass overload darurat.")

# cable sizing sheet follows the new design ampere row
cs = wb["CABLE SIZING"]
design_row = T + 7
for r, (cfg, runs, mm2, iz, cg, r90, x) in {
    13: ("2x(4C x 240mm²) Cu/XLPE/PVC + 1x(1C x 120mm²) G/Y", 2, 240, 538, 0.88, 0.0961, 0.07),
    14: ("2x(4C x 185mm²) Cu/XLPE/PVC + 1x(1C x 95mm²) G/Y", 2, 185, 456, 0.88, 0.1247, 0.072),
}.items():
    cs[f"C{r}"], cs[f"D{r}"], cs[f"E{r}"] = cfg, f"='CP-FGW-L0-MVAC'!G{design_row}", 500
    cs[f"G{r}"], cs[f"H{r}"], cs[f"I{r}"], cs[f"J{r}"], cs[f"M{r}"], cs[f"N{r}"] = runs, mm2, iz, cg, r90, x

wb.save(dst)
print(f"rows {FIRST}-{NEW_LAST}, subtotal row {T}, design ampere row {design_row}")
