"""Generate HBE Hanuman Brewery Extension cooling load & fan schedule workbook."""
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

thin = Side(style="thin")
dot = Side(style="dotted")
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
ROW = Border(left=thin, right=thin, top=dot, bottom=dot)
B = Font(name="Calibri", bold=True, size=10)
N = Font(name="Calibri", size=9)
C = Alignment(horizontal="center", vertical="center", wrap_text=True)
L = Alignment(horizontal="left", vertical="center", wrap_text=True)
R = Alignment(horizontal="right", vertical="center")
BLUE = PatternFill("solid", fgColor="BDD7EE")
PEACH = PatternFill("solid", fgColor="FCE4D6")


def hdr(ws, rng, text, fill=None):
    if ":" not in rng:
        rng = f"{rng}:{rng}"
    else:
        ws.merge_cells(rng)
    cell = ws[rng.split(":")[0]]
    cell.value, cell.font, cell.alignment = text, B, C
    for row in ws[rng]:
        for c in row:
            c.border = BOX
            if fill:
                c.fill = fill


# ---------------------------------------------------------------- Sheet 1
wb = Workbook()
ws = wb.active
ws.title = "Cooling Load"

ws["A1"] = "COOLING LOAD CALCULATION"
ws["A1"].font = Font(name="Calibri", bold=True, size=12)
ws["A2"] = "PROJECT: HBE_HANUMAN BREWERY EXTENSION"
ws["A3"] = ("LOCATION : FINISH GOOD WAREHOUSE BUILDING , ST. 2004, SANGKAT O BEK KAM, "
            "KHAN SEN SOK, PHNOM PENH, CAMBODIA")
ws["A4"] = "PREPARED  BY: ANNE HERLIANA"
for r in (2, 3, 4):
    ws[f"A{r}"].font = B
for r, (k, v) in enumerate([("DATE", ": 27 Oct 2026"), ("REV.", ": 0"),
                            ("CHECKED BY", ": JAIME QUILALA")], start=2):
    ws[f"P{r}"], ws[f"Q{r}"] = k, v
    ws[f"P{r}"].font = ws[f"Q{r}"].font = N

for col, text in zip("ABCDE", ["NO.", "ROOM NO", "LEVEL", "ROOM NAME", "AREA (M²)"]):
    hdr(ws, f"{col}6:{col}7", text)
hdr(ws, "F6:J6", "CALCULATION AS PER HAP SOFTWARE", BLUE)
hdr(ws, "K6:Q6", "SELECTION EQUIPMENT DAIKIN", PEACH)
hdr(ws, "R6:R7", "REMARK")
for col, text in zip("FGHIJKLMNOPQ", [
        "DESIGN TEMP. (°C)", "SENSIBLE LOAD (KW)", "LATENT LOAD (KW)", "TOTAL LOAD (KW)",
        "AIRFLOW (CMH)", "TAG NO", "TYPE", "MODEL", "TOTAL LOAD (KW)", "QTY",
        "POWER SUPPLY VOLTAGE - PHASE", "POWER CONSUMPTION (WATT)"]):
    hdr(ws, f"{col}7", text)

GF, F1 = "Finish Good Warehouse -GF", "Finish Good Warehouse -1F"
WM, CC = "WALL MOUNTED", "CEILING CASSETTE"
V1, V3 = "220V-240V / 50 HZ", "3 PHASE , 380-415 V, 50 HZ"
rows = [
    ("D-001", GF, "TAX OFF", 26, "24±2", 3.1, 1.1, 4.2, 1015.2, "IU/OU D-001", WM, "FTKE50AV1F/RKE50AV1", 5.28, 1, V1, 0.89),
    ("D-002", GF, "DRIVER RM", 48, "24±2", 5.6, 2.9, 8.5, 1702.8, "IU/OU D-002", CC, "FCF100CVM/RZF100CYM", 10, 1, V3, 2.97),
    ("D-008", GF, "LOGISTIS OFF. MANAGER", 10, "24±2", 0.9, 0.5, 1.4, 277.2, "IU/OU D-003", WM, "FTKE25AV1F/RKE25AV1", 2.64, 1, V1, 0.89),
    ("D-009", GF, "LOGISTIS OFF.", 42, "24±2", 4, 1.1, 5.1, 1310.4, "IU/OU D-004", WM, "FTKE50AV1F/RKE50AV1", 5.6, 1, V1, 2),
    ("D-010", GF, "WAREHOUSE COUNTER OFF.", 48, "24±2", 6.8, 2, 8.8, 2239.2, "IU/OU D-005", CC, "FCF100CVM/RZF100CYM", 10, 1, V3, 2.97),
    ("D-011", GF, "SUPERVISOR", 15, "24±2", 2.3, 0.6, 2.9, 777.6, "IU/OU D-006", WM, "FTKE35AV1F/RKE35AV1", 3.6, 1, V1, 1),
    ("D-017", GF, "ELECTRICAL ROOM", 4, "22±2", 2, 0.2, 2.2, 986.4, "IU/OU D-007", WM, "FTKE25AV1F/RKE25AV1", 2.64, 1, V1, 0.89),
    ("D-101", F1, "MEETING ROOM", 57, "24±2", 6.9, 4.3, 11.2, 2088, "IU/OU D-101", CC, "FCF125CVM/RZF125CYM", 12.5, 1, V3, 4.18),
    ("D-102", F1, "PANTRY", 33, "24±2", 4.3, 2.1, 6.4, 1317.6, "IU/OU D-102", WM, "FTKE50AV1F/RKE50AV1", 9, 1, V1, 2),
    ("D-107", F1, "SUPERVISOR OFFICE 1", 15, "24±2", 4, 0.6, 4.6, 1389.6, "IU/OU D-105", WM, "FTKE50AV1F/RKE50AV1", 4.5, 1, V1, 2),
    ("D-108", F1, "SUPERVISOR OFFICE 2", 14, "24±2", 3.6, 0.5, 4.1, 1270.8, "IU/OU D-106", WM, "FTKE50AV1F/RKE50AV1", 4.5, 1, V1, 2),
    ("D-106", F1, "OFFICE", 36, "24±2", 4.5, 1.7, 6.2, 1400.4, "IU/OU D-107", WM, "FTKE60AV1F/RKE60AV1", 7.1, 1, V1, 2),
    ("D-109", F1, "MANAGER OFFICE 1", 15, "24±2", 3.6, 0.6, 4.2, 1288.8, "IU/OU D-108", WM, "FTKE50AV1F/RKE50AV1", 4.5, 1, V1, 2),
    ("D-110", F1, "MANAGER OFFICE 2", 17, "24±2", 1.6, 0.6, 2.2, 511.2, "IU/OU D-109", WM, "FTKE25AV1F/RKE25AV1", 2.64, 1, V1, 0.89),
]
FMT = {"E": "0.00", "G": "0.0", "H": "0.0", "I": "0.0", "J": "0.0", "N": "0.00", "Q": "0.00"}
start = 8
for i, data in enumerate(rows):
    r = start + i
    vals = [i + 1, *data, None]
    for j, v in enumerate(vals):
        col = get_column_letter(j + 1)
        c = ws[f"{col}{r}"]
        c.font, c.border = N, ROW
        if col == "I":  # total load = sensible + latent
            c.value = f"=G{r}+H{r}"
        else:
            c.value = v
        c.alignment = L if col in "CD" else (R if col == "E" else C)
        if col in FMT:
            c.number_format = FMT[col]
# empty spare rows like the original
for r in range(start + len(rows), start + len(rows) + 3):
    for j in range(1, 19):
        ws.cell(r, j).border = ROW

for col, w in zip("ABCDEFGHIJKLMNOPQR",
                  [5, 9, 24, 24, 9, 8, 8, 8, 8, 9, 11, 17, 21, 8, 5, 22, 14, 18]):
    ws.column_dimensions[col].width = w
ws.row_dimensions[7].height = 36
ws.freeze_panes = "A8"
ws.page_setup.orientation = "landscape"
ws.page_setup.fitToWidth = 1
ws.sheet_properties.pageSetUpPr.fitToPage = True

# ---------------------------------------------------------------- Sheet 2
fs = wb.create_sheet("Fan Schedule")
fs["A1"] = "FAN  EQUIPMENT SCHEDULE"
fs["A2"] = "FINISH GOOD WAREHOUSE"
fs["A1"].font = fs["A2"].font = Font(name="Calibri", bold=True, size=12)

for col, text in zip("ABCDEF", ["TAG NO", "ROOM NO", "ROOM NAME", "TYPE/MODEL",
                                 "AIR FLOW TOTAL CMH", "EXTERNAL STATIC PRESSURE PASCAL"]):
    hdr(fs, f"{col}3:{col}4", text)
hdr(fs, "G3:J3", "NOMINAL DATA *)")
hdr(fs, "K3:L3", "ELECTRICAL")
hdr(fs, "M3:M4", "QTY")
hdr(fs, "N3:N4", "NOTE")
for col, text in zip("GHIJKL", ["BLADE DIAMETER MM", "Speed RPM", "WEIGHT KG",
                                 "Max. Noise Level dbA @ 3m", "Estimated Fan Motor Power KW",
                                 "(V / PH / HZ)"]):
    hdr(fs, f"{col}4", text)

WI, IC = "WALL MOUNTED - INDUSTRIAL TYPE", "INLINE CENTRIFUGAL CABINET FAN"
SV, CP = "CEILING MOUNTED SIROCCO VENTILATING FANS", "CEILING PROPELLER 5 SPEED CONTROL"
fans = [
    ("EF D-001.01~45", None, "FINISH GOOD WAREHOUSE", WI, 27970, 50, 775, 1425, 72, 84, 3.7, "380-415 V/ 50 HZ", 45),
    ("EF D-002", None, "SUGAR STORAGE", WI, 18220, 50, 775, 1425, 52, 81, 1.1, "380-415 V/ 50 HZ", 1),
    ("EF D-003", None, "DRIVER TOILET", IC, 410, 100, 302, 1334, 14, 50, 0.07, "220V-240V / 50 HZ", 1),
    ("EF D-004", None, "MALE TOILET\nFEMALE TOILET\nJANITOR", IC, 650, 100, 302, 1486, 14, 53, 0.07, "220V-240V / 50 HZ", 1),
    ("EF D-102", None, "LOCKER", SV, 520, 80, None, 1169, 11, 44, 0.05, "220V-240V / 50 HZ", 1),
    ("EF D-101", None, "ARCHIEVE ROOM", SV, 630, 80, None, 1047, 14, 50, 0.07, "220V-240V / 50 HZ", 1),
    ("EF D-103", None, "PANTRY", SV, 590, 80, None, 1353, 11, 49, 0.08, "220V-240V / 50 HZ", 1),
    ("CF D-101", None, "LOCKER", CP, 12780, None, "DIA 1500 MM", None, 6.2, None, 0.07, "1/220/50", 1),
    ("CF D-102", None, "ARCHIEVE ROOM", CP, 12780, None, "DIA 1500 MM", None, 6.2, None, 0.07, "1/220/50", 1),
]
r = 6  # row 5 left blank as in original
for f in fans:
    for j, v in enumerate([*f, None]):
        c = fs.cell(r, j + 1, v)
        c.font, c.border = N, ROW
        c.alignment = L if j == 2 else C
        if j == 4:
            c.number_format = "#,##0"
        elif j == 10:
            c.number_format = "0.00"
    if "\n" in f[2]:
        fs.row_dimensions[r].height = 40
    r += 1
for j in range(1, 15):
    fs.cell(r, j).border = Border(left=thin, right=thin, top=dot, bottom=Side(style="medium"))

notes = [
    "NOTES – FAN EQUIPMENT SCHEDULE (DETAIL DESIGN)",
    "1. THE EQUIPMENT SCHEDULE INDICATED ON THE DRAWINGS SPECIFIES THE REQUIRED CAPACITY, FUNCTIONAL PERFORMANCE, AND TECHNICAL PARAMETERS FOR THE FINAL PROCUREMENT AND INSTALLATION.",
    "2. THE CONTRACTOR SHALL VERIFY ALL SITE CONDITIONS, PHYSICAL SPACE LIMITATIONS, ACTUAL SYSTEM LAYOUTS, AND TOTAL PRESSURE DROPS PRIOR TO ORDERING ANY FAN EQUIPMENT.",
    "3. FAN PERFORMANCE SHALL BE CERTIFIED BY AMCA (OR EQUIVALENT STANDARDS) TO OPERATE AT THE OPTIMUM EFFICIENCY POINT WHILE MEETING THE REQUIRED AIRFLOW, ACTUAL STATIC PRESSURE, AND PROJECT ACUSTIC/NOISE CRITERIA.",
    "4. FAN MOTORS SHALL BE HIGH-EFFICIENCY, TEFC TYPE, SUITABLE FOR CONTINUOUS OPERATION AND MATCHING THE PROVISIONED PROJEC ELECTRICAL VOLTAGE, PHASE, AND CONTROLS.",
    "5. VARIABLE SPEED DRIVES (VSDs) OR INVERTERS SHALL BE PROVIDED WHERE INDICATED FOR AIRFLOW BALANCING, AUTOMATED SYSTEM CONTROL, AND ENERGY-EFFICIENT OPERATION.",
    "6. ALL FANS SHALL BE COMPLETE WITH APPROPRIATE VIBRATION ISOLATORS, FLEXIBLE DUCT CONNECTORS, BACKDRAFT DAMPERS, INTERNAL ACCESS DOORS, MOUNTING BRACKETS, AND INDEPENDENT STRUCTURAL SUPPORTS.",
    "7. COORDINATE THE FINAL PHYSICAL INSTALLATION OF FANS WITH ARCHITECTURAL FINISHES, STRUCTURAL FRAMING, ELECTRICAL ROUTING, AND OTHER MEP SERVICES TO GUARANTEE ACCESSIBILITY FOR MAINTENANCE AND FILTER REPLACEMENT.",
    "8. THE CONTRACTOR SHALL SUBMIT FINAL EQUIPMENT SELECTION DATA, CERTIFIED PERFORMANCE CURVES, SOUND SPECTRUM DATA, MOTOR DATA SHEETS, CONTROL DIAGRAMS, AND DETAILED SHOP DRAWINGS FOR CONSULTANT APPROVAL BEFORE FABRICATION.",
    "9. ALL FANS SHALL BE RIGOROUSLY TESTED, COMMISSIONED, AND BALANCED. A COMPLETE TESTING, ADJUSTING, AND BALANCING (TAB) REPORT SHALL BE SUBMITTED TO ACHIEVE THE DESIGN DESIGNATED PARAMETERS.",
    "10. UNLESS OTHERWISE NOTED, ALL AIRFLOW VALUES ARE EXPRESSED IN CMH (M³/H) AND EXTERNAL STATIC PRESSURE IN PA.",
]
r += 2
for t in notes:
    fs.cell(r, 1, t).font = N
    r += 1

for col, w in zip("ABCDEFGHIJKLMN", [17, 10, 24, 40, 12, 12, 12, 8, 8, 9, 12, 17, 6, 20]):
    fs.column_dimensions[col].width = w
fs.row_dimensions[4].height = 48
fs.freeze_panes = "A5"
fs.page_setup.orientation = "landscape"
fs.sheet_properties.pageSetUpPr.fitToPage = True
fs.page_setup.fitToHeight = 0

wb.save("exports/HBE_Cooling_Load_and_Fan_Schedule.xlsx")
print("saved")
