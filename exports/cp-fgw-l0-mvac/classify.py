import ezdxf, collections
from ezdxf import bbox
X0, PITCH, BUS1, BPITCH = -23745.0, 3473.0, 14874.0, 18434.0
SPAN_LAYERS = {'E-TABLE', 'E-TABLE-L', 'E-BUSBAR', 'E-CTRL', 'E-FRAME'}
def classify(e):
    if e.dxf.layer in SPAN_LAYERS: return None
    ext = bbox.extents([e])
    if not ext.has_data: return None
    cx, cy = ext.center.x, ext.center.y
    w = ext.size.x
    if cx < X0 or w > PITCH * 1.05: return None
    c = int((cx - X0) // PITCH)
    if c > 16: return None
    for b in range(4):
        yb = BUS1 - b * BPITCH
        if yb - 13300 <= cy <= yb + 650:
            return (b, c)
    return None
