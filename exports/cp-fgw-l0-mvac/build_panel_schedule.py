"""Rebuild CP-FGW-L0-MVAC panel schedule from latest cooling-load / fan Excel.

Input: orig.dxf = ME-D-LV-6002-R1 DWG converted with LibreDWG (dwg2dxf).
"""
import math, re, collections
import ezdxf
from ezdxf import bbox
from classify import classify, X0, PITCH as P, BUS1, BPITCH as BP

doc = ezdxf.readfile("orig.dxf")
msp = doc.modelspace()
groups = collections.defaultdict(list)
for e in msp:
    k = classify(e)
    if k:
        groups[k].append(e)

def cl(c): return X0 + c * P
def by(b): return BUS1 - b * BP

# ------------------------------------------------------------------ loads
V3, V1, PF = 380.0, 220.0, 0.8
def amps(kw, ph): return kw * 1000 / ((math.sqrt(3) * V3 if ph == 3 else V1) * PF)

circuits = []
EMERG = set(range(9, 29))  # fans that were ACTIVE ON EMERGENCY in previous issue
for i in range(1, 46):
    em = i in EMERG
    circuits.append(dict(kind="fan3", ph=3, kw=3.7, type="EXHAUST FAN", tag=f"EF D-001.{i:02d}",
                         room="FG WH (D-012) WALL FAN", loc="FINISH GOOD WH @ GF", emerg=em))
circuits.append(dict(kind="fan3", ph=3, kw=1.1, type="EXHAUST FAN", tag="EF D-002",
                     room="SUGAR STORAGE", loc="FINISH GOOD WH @ GF", emerg=False))
AC = [  # tag, room, type, phase, kW (Excel power consumption, kW)
    ("IU/OU D-002", "DRIVER RM (D-002)", "CEILING CASSETTE", 3, 2.97),
    ("IU/OU D-005", "WAREHOUSE COUNTER OFF. (D-010)", "CEILING CASSETTE", 3, 2.97),
    ("IU/OU D-101", "MEETING ROOM (D-101)", "CEILING CASSETTE", 3, 4.18),
    ("IU/OU D-001", "TAX OFF (D-001)", "WALL MOUNTED", 1, 0.89),
    ("IU/OU D-003", "LOGISTIC OFF. MANAGER (D-008)", "WALL MOUNTED", 1, 0.89),
    ("IU/OU D-004", "LOGISTIC OFF. (D-009)", "WALL MOUNTED", 1, 2.0),
    ("IU/OU D-006", "SUPERVISOR (D-011)", "WALL MOUNTED", 1, 1.0),
    ("IU/OU D-007", "ELECTRICAL ROOM (D-017)", "WALL MOUNTED", 1, 0.89),
    ("IU/OU D-102", "PANTRY (D-102)", "WALL MOUNTED", 1, 2.0),
    ("IU/OU D-105", "SUPERVISOR OFFICE 1 (D-107)", "WALL MOUNTED", 1, 2.0),
    ("IU/OU D-106", "SUPERVISOR OFFICE 2 (D-108)", "WALL MOUNTED", 1, 2.0),
    ("IU/OU D-107", "OFFICE (D-106)", "WALL MOUNTED", 1, 2.0),
    ("IU/OU D-108", "MANAGER OFFICE 1 (D-109)", "WALL MOUNTED", 1, 2.0),
    ("IU/OU D-109", "MANAGER OFFICE 2 (D-110)", "WALL MOUNTED", 1, 0.89),
]
for tag, room, typ, ph, kw in AC:
    loc = "FINISH GOOD WH @ " + ("1F" if re.search(r"D-1\d\d\)", room) else "GF")
    circuits.append(dict(kind="ac3" if ph == 3 else "ac1", ph=ph, kw=kw,
                         type=f"AC {typ}", tag=tag, room=room, loc=loc))
FANS1 = [
    ("EF D-003", "DRIVER TOILET (D-003)", 0.07, "EXHAUST FAN", "GF"),
    ("EF D-004", "TOILET & JANITOR (D-005,006,007)", 0.07, "EXHAUST FAN", "GF"),
    ("EF/CF D-101", "LOCKER (D-103)", 0.05 + 0.07, "EXHAUST + CEILING FAN", "1F"),
    ("EF/CF D-102", "ARCHIVE ROOM (D-105)", 0.07 + 0.07, "EXHAUST + CEILING FAN", "1F"),
    ("EF D-103", "PANTRY (D-102)", 0.08, "EXHAUST FAN", "1F"),
]
for tag, room, kw, typ, lvl in FANS1:
    circuits.append(dict(kind="fan1", ph=1, kw=kw, type=typ, tag=tag, room=room,
                         loc=f"FINISH GOOD WH @ {lvl}"))
NSPARE = 4 * 17 - len(circuits)
assert NSPARE == 3, NSPARE

# phase balance for 1-phase circuits (largest first onto lightest phase)
load = {"R": 0.0, "S": 0.0, "T": 0.0}
for c in sorted([c for c in circuits if c["ph"] == 1], key=lambda c: -c["kw"]):
    p = min(load, key=load.get); c["phase"] = p; load[p] += c["kw"]

for n, c in enumerate(circuits, 1):
    c["cct"] = f"CP-FGW-L0-MVAC-{n:02d}"
    I = amps(c["kw"], c["ph"])
    c["I"] = I
    if c["kind"] == "fan3":
        c.update(brk="MCB-3P", amp="16A" if I <= 10 else "20A", st="DOL")
        frc = c["emerg"]
        c.update(c1="1x3C-4mm2 (FRC)" if frc else "1x3C-4mm2",
                 c2="Cu/MGT/XLPE/LSZH" if frc else "Cu/XLPE/PVC",
                 c3="+1C-4mm2 Cu/PVC G/Y")
    elif c["kind"] == "ac3":
        c.update(brk="MCB-3P", amp="16A", st="DOL",
                 c1="1x5C-4mm2", c2="Cu/XLPE/PVC", c3="INCLUDING (N+E)")
    else:
        c.update(brk="MCB-1P", amp="16A" if I > 8 else "10A", st="DOL",
                 c1="1x3C-4mm2", c2="Cu/XLPE/PVC", c3="INCLUDING (E)")

Pt = sum(c["kw"] for c in circuits)
Pact = Pt * 0.9 * 1.2
Iact = Pact * 1000 / (math.sqrt(3) * V3 * PF)
print(f"circuits={len(circuits)} spare={NSPARE} Pt={Pt:.2f} Pact={Pact:.2f} I={Iact:.1f}A")
print("1P phase load kW:", {k: round(v, 2) for k, v in load.items()})

# ------------------------------------------------------------------ text helpers
def is_num(t): return re.fullmatch(r"\d+\.\d+", t) is not None

def role(t):
    if t in ("RYB", "R", "S", "T"): return "ph"
    if t.startswith("MCB-"): return "brk"
    if re.fullmatch(r"\d+A", t): return "amp"
    if t.endswith("kA"): return "ka"
    if t in ("SS", "DOL"): return "st"
    if t in ("C", "24DC", "MOA", "SPARE", "FUTURE"): return None
    if t in ("EXHAUST FAN", "INDOOR UNIT", "OUTDOOR UNIT"): return "type"
    if re.match(r"(EF|IU|OU) D-", t): return "tag"
    if t.startswith("CP-FGW") or t == "-": return "cct"
    if t.startswith("FINISH GOOD"): return "loc"
    if t in ("NORMAL", "ACTIVE ON"): return "r1"
    if t == "EMERGENCY": return "r2"
    if is_num(t): return "pw"
    if t.startswith("1x"): return "c1"
    if t.startswith("Cu/"): return "c2"
    if t.startswith("+1C") or t.startswith("INCLUDING"): return "c3"
    return "room"

MAXW, CF = 3000.0, 0.72
BASE_H = {}

def set_text(e, txt):
    h0 = BASE_H.setdefault(id(e), e.dxf.height)
    e.dxf.text = txt
    wf = e.dxf.get("width", 1.0)
    w = len(txt) * h0 * CF * wf
    e.dxf.height = h0 if w <= MAXW else MAXW / (len(txt) * CF * wf)

def fill(ents, c):
    texts = [e for e in ents if e.dxftype() == "TEXT"]
    r1 = r2 = None
    for e in texts:
        r = role(e.dxf.text)
        if r is None or r == "ka":
            continue
        if r == "r1": r1 = e; continue
        if r == "r2": r2 = e; continue
        if r == "ph":
            set_text(e, "RYB" if c["ph"] == 3 else c["phase"]); continue
        if r == "pw":
            set_text(e, f"{c['kw']:.3f}"); continue
        set_text(e, c[r])
    if c["kind"] == "fan3" and r1 is not None:
        if c["emerg"]:
            r1.dxf.text = "ACTIVE ON"
            if r2 is not None: r2.dxf.text = "EMERGENCY"
        else:
            r1.dxf.text = "NORMAL"
            if r2 is not None:
                for a in ("insert", "align_point"):
                    if r1.dxf.hasattr(a) and r2.dxf.hasattr(a):
                        p1, p2 = r1.dxf.get(a), r2.dxf.get(a)
                        r1.dxf.set(a, ((p1[0] + p2[0]) / 2 + 0, (p1[1] + p2[1]) / 2, 0))
                r1.dxf.align_point = (r1.dxf.align_point[0] + 163, r1.dxf.align_point[1], 0)
                msp.delete_entity(r2)
                ents.remove(r2)
    elif r1 is None and c["kind"] == "fan3":
        pass

def copy_group(src_key, dst_b, dst_c):
    sb, sc = src_key
    dx, dy = cl(dst_c) - cl(sc), by(dst_b) - by(sb)
    out = []
    for e in groups[src_key]:
        n = e.copy()
        n.translate(dx, dy, 0)
        msp.add_entity(n)
        out.append(n)
    return out

# ------------------------------------------------------------------ build columns
layout = [circuits[i * 17:(i + 1) * 17] for i in range(4)]
layout[3] += [None] * NSPARE

TEMPLATE = {"fan3": (1, 6), "ac1": (2, 0), "ac3": (2, 9), "fan1": (2, 10), None: (2, 13)}
placed = {}
for b in range(4):
    for c in range(17):
        ckt = layout[b][c]
        kind = ckt["kind"] if ckt else None
        if b == 0 or (b == 1 and c >= 6):
            ents = groups[(b, c)]          # existing fan column, edit in place
        else:
            ents = copy_group(TEMPLATE[kind], b, c)
        placed[(b, c)] = (ents, ckt)
# remove old columns that were replaced (block 2 IU cols, all of block 3)
for (b, c), ents in list(groups.items()):
    if (b == 1 and c < 6) or b == 2:
        for e in ents:
            msp.delete_entity(e)
for (b, c), (ents, ckt) in placed.items():
    if ckt:
        fill(ents, ckt)
    else:
        for e in ents:
            if e.dxftype() == "TEXT" and e.dxf.text == "R":
                e.dxf.text = "RST"[c % 3]

# ------------------------------------------------------------------ block-level geometry
def band(e):
    ext = bbox.extents([e])
    return ext.center.y if ext.has_data else None

def move(e, dx, dy):
    e.translate(dx, dy, 0)

def add_copy(e, dx, dy):
    n = e.copy(); n.translate(dx, dy, 0); msp.add_entity(n); return n

# table grid: rebuild blocks 3/4 from block 2 grid
b2_table = [e for e in msp.query("LINE[layer=='E-TABLE' | layer=='E-TABLE-L']") if -17000 < band(e) < -10000]
for e in list(msp.query("LINE[layer=='E-TABLE' | layer=='E-TABLE-L']")):
    if band(e) < -22250:
        msp.delete_entity(e)
for e in b2_table:
    add_copy(e, 0, -BP); add_copy(e, 0, -2 * BP)

# left-column labels, busbar caption, start hook for block 4 (copy block 3)
for e in list(msp):
    if classify(e) is not None: continue
    y = band(e)
    if y is None or not (-38167 < y < -19000): continue
    if e.dxftype() == "TEXT" and e.dxf.layer == "E-TEXT" and e.dxf.insert.x < -24000:
        add_copy(e, 0, -BP)
    elif e.dxf.layer == "0" and e.dxftype() == "LWPOLYLINE" and e.dxf.get("elevation", 0) == 0 and bbox.extents([e]).extmax.x < -24000:
        add_copy(e, 0, -BP)

# spare bracket + note under the spare ways, earth symbol at frame corner
for e in list(msp):
    y = band(e)
    if y is None or classify(e) is not None: continue
    ext = bbox.extents([e])
    if e.dxf.layer == "ACT-E-LINE 01" or (e.dxftype() == "TEXT" and e.dxf.text.startswith("20% (SPARE")):
        move(e, 3 * P if e.dxftype() != "TEXT" else 3 * P - 2600, -BP)
    elif ext.extmin.x > 37800 and ext.center.y < -37000:
        move(e, 0, -BP)

# frame
for e in msp.query("*[layer=='E-FRAME']"):
    if e.dxftype() == "LWPOLYLINE":
        pts = [(x, y - BP if y < -38000 else y, *rest) for (x, y, *rest) in e.get_points("xyseb")]
        e.set_points(pts, format="xyseb")
    elif e.dxftype() == "LINE":
        if abs(e.dxf.start.x - e.dxf.end.x) < 1:
            s, t = e.dxf.start, e.dxf.end
            e.dxf.end = (t.x, t.y - BP if t.y < -38000 else t.y, 0)
            e.dxf.start = (s.x, s.y - BP if s.y < -38000 else s.y, 0)
        elif abs(e.dxf.start.y - (-22250.2653)) < 1:
            add_copy(e, 0, -BP)

# busbar
bus = list(msp.query("LWPOLYLINE[layer=='E-BUSBAR']"))
proto = bus[0].copy()
for e in bus: msp.delete_entity(e)
def poly(pts, w=100.0):
    n = proto.copy(); n.set_points([(x, y) for x, y in pts], format="xy"); n.dxf.const_width = w; msp.add_entity(n)
for k in range(4):
    y = by(k)
    x0 = -25283 if k == 0 else -25829
    x1 = 35929 if k < 3 else cl(16) + 3129
    poly([(x0, y), (x1, y)], 50.0 if k == 0 else 100.0)
    if k < 3:
        poly([(35929, y), (35929, y - 14537), (-25829, y - 14537), (-25829, by(k + 1))])

# fire-alarm control line (dashed segments, same pattern as original)
ctrl = list(msp.query("LINE[layer=='E-CTRL']"))
cproto = ctrl[0].copy()
for e in ctrl: msp.delete_entity(e)
def dash(p0, p1):
    (x0, y0), (x1, y1) = p0, p1
    L = math.hypot(x1 - x0, y1 - y0); ux, uy = (x1 - x0) / L, (y1 - y0) / L
    s = 0.0
    while s < L:
        e = min(s + 635.0, L)
        n = cproto.copy(); n.dxf.start = (x0 + ux * s, y0 + uy * s, 0); n.dxf.end = (x0 + ux * e, y0 + uy * e, 0)
        msp.add_entity(n); s += 952.5
XR, CY0 = 36758.0, 10250.0
fan_blocks = sorted({b for (b, c), (_, k) in placed.items() if k and k["kind"] == "fan3"})
for b in fan_blocks:
    first = min(c for (bb, c), (_, k) in placed.items() if bb == b and k and k["kind"] == "fan3")
    dash((cl(first) + 2318, CY0 - b * BP), (XR, CY0 - b * BP))
dash((XR, CY0 - max(fan_blocks) * BP), (XR, 18697.0))

# ------------------------------------------------------------------ header / incomer
HDR = {
    "Pt = 562.64 kW": f"Pt = {Pt:.2f} kW",
    "Pact = 607.65 kW": f"Pact = {Pact:.2f} kW",
    "ACB-3P": "MCCB-3P",
    "1250A": "500A",
    "3Nos. CT 1250/5A": "3Nos. CT 500/5A",
    "0-1250A": "0-500A",
    "4x(1x4C-240mm2 Cu/MGT/XLPE/LSZH (FRC)) + 2x(1C-120mm2 Cu/LSZH G/Y)":
        "2x(1x4C-240mm2 Cu/MGT/XLPE/LSZH (FRC)) + 1x(1C-120mm2 Cu/LSZH G/Y)",
    "380V, 1250A Cu BUSBAR, 3Ph + 100% N, 50%(E)": "380V, 630A Cu BUSBAR, 3Ph + 100% N, 50%(E)",
}
for e in msp.query("TEXT"):
    if classify(e) is None and e.dxf.text in HDR:
        e.dxf.text = HDR[e.dxf.text]

# ------------------------------------------------------------------ paperspace viewport (fit 4 blocks)
for vp in doc.layouts.get("Layout1").query("VIEWPORT"):
    if vp.dxf.view_height == 80000.0:
        tx, ty = vp.dxf.view_target_point.x, vp.dxf.view_target_point.y
        ytop, ybot, S = 24449.7, -38426 - BP, 155.0
        # content spans paper y 53..578 mm; title label moved below it
        ymid_paper = (578.0 + 53.0) / 2
        vp.dxf.view_height = vp.dxf.height * S
        yc = (ytop + ybot) / 2 - (ymid_paper - vp.dxf.center.y) * S
        vp.dxf.view_center_point = (vp.dxf.view_center_point.x + tx, yc, 0)
        vp.dxf.view_target_point = (0, 0, 0)
for ins in doc.layouts.get("Layout1").query("INSERT[name=='JUDUL']"):
    ins.translate(0, -51.0, 0)  # moves attributes too

auditor = doc.audit()
print("audit errors:", len(auditor.errors), "fixes:", len(auditor.fixes))
doc.saveas("ME-D-LV-6002-R2-CP-FGW-L0-MVAC.dxf")

import json
json.dump([{k: v for k, v in c.items()} for c in circuits], open("circuits.json", "w"), indent=1, default=str)
