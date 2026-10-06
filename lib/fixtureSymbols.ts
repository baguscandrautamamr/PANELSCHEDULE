/**
 * Simbol fixture di header kolom FIXTURE — geometrinya disalin dari header
 * DWG template panel schedule proyek (PGR-DWG-DC-ME-00-LV-6004.2
 * LP-WAREHOUSE-3). Dipakai bersama oleh tabel website (SVG) dan export DXF
 * (block FIX_*), jadi simbol di web dan di CAD sama persis.
 *
 * Satuan = satuan template (tinggi teks 150), origin di tengah sel simbol,
 * sumbu Y ke atas (seperti CAD).
 *
 *   ["L", x1, y1, x2, y2]               garis
 *   ["P", closed, [x1, y1, x2, y2, …]]   polyline
 *   ["C", x, y, r]                       lingkaran
 *   ["A", x, y, r, sudutAwal, sudutAkhir] busur (derajat, berlawanan jarum jam)
 *   ["T", x, y, tinggi, teks]            teks kecil (kiri-bawah)
 */
export type SymbolPrim =
  | ["L", number, number, number, number]
  | ["P", boolean, number[]]
  | ["C", number, number, number]
  | ["A", number, number, number, number, number]
  | ["T", number, number, number, string];

export const FIXTURE_SYMBOLS = {
  HIGHBAY: [
    ["L", 143, 124, 143, -215],
    ["L", -337, -215, 143, -215],
    ["L", -337, -215, -337, 124],
    ["L", -337, 124, 143, 124],
    ["L", -387, -265, 193, -265],
    ["L", 193, 174, 193, -265],
    ["L", -387, -265, -387, 174],
    ["L", -387, 174, 193, 174],
    ["C", -99, -46, 368],
    ["C", -99, -46, 418],
    ["C", -103, -44, 417],
  ],
  HIGHBAY_BATTERY: [
    ["L", 137, 124, 137, -215],
    ["L", -343, -215, 137, -215],
    ["L", -343, -215, -343, 124],
    ["L", -343, 124, 137, 124],
    ["L", -393, -265, 187, -265],
    ["L", 187, 174, 187, -265],
    ["L", -393, -265, -393, 174],
    ["L", -393, 174, 187, 174],
    ["C", -105, -46, 368],
    ["C", -105, -46, 418],
    ["L", 137, 124, -343, 124],
    ["L", -343, 124, -343, -215],
    ["L", -343, -215, 137, -215],
    ["L", 137, -215, 137, 124],
    ["C", -108, -44, 417],
  ],
  RECESSED: [
    ["L", -536, -281, 734, -281],
    ["L", -536, -135, 734, -135],
    ["L", 734, -135, 734, -281],
    ["L", -536, -135, -536, -281],
    ["L", -536, -140, -536, -276],
  ],
  RECESSED_BATTERY: [
    ["L", -559, -303, 711, -157],
    ["L", -559, -303, 711, -303],
    ["L", -559, -157, 711, -157],
    ["L", 711, -157, 711, -303],
    ["L", -559, -157, -559, -303],
    ["L", 711, -157, -559, -157],
    ["L", -559, -157, -559, -230],
    ["L", 711, -230, 711, -157],
    ["L", -559, -230, -559, -298],
  ],
  SURFACE_BATTERY: [
    ["L", -572, -157, 698, -303],
    ["L", -572, -303, 698, -157],
    ["L", -572, -303, 698, -303],
    ["L", -572, -157, 698, -157],
    ["L", 698, -157, 698, -303],
    ["L", -572, -157, -572, -303],
    ["L", 698, -157, -572, -157],
    ["L", -572, -157, -572, -230],
    ["L", -572, -230, 698, -230],
    ["L", 698, -230, 698, -157],
    ["L", -572, -230, -572, -298],
    ["L", -572, -298, 698, -298],
  ],
  DOWNLIGHT: [
    ["L", 48, -165, -35, -83],
    ["A", 48, -177, 125, 131, -139],
    ["L", -46, -259, 48, -165],
    ["L", 48, -165, 142, -259],
    ["A", 48, -177, 125, -41, 49],
    ["L", 130, -83, 48, -165],
    ["C", 48, -177, 125],
    ["L", -35, -83, 142, -259],
    ["L", 130, -83, -46, -259],
    ["C", 48, -177, 175],
  ],
  EXIT: [
    ["L", 206, -386, 206, -421],
    ["L", -102, -421, -102, -386],
    ["L", 206, -386, -102, -386],
    ["L", -102, -421, 206, -421],
    ["L", -471, 190, 529, 190],
    ["L", -471, -403, -471, 190],
    ["L", 529, -403, -471, -403],
    ["L", 529, 190, 529, -403],
    ["T", -200, -200, 200, "EXIT"],
  ],
  EMERGENCY_LAMP: [
    ["P", true, [397, -409, -434, -409, -434, 6, 397, 6]],
  ],
  OUTLET_SINGLE: [
    ["A", -12, -327, 203, 0, 180],
    ["L", -12, -124, -12, 45],
    ["L", -114, -39, 89, -39],
    ["L", 191, -327, -216, -327],
  ],
  OUTLET_DOUBLE: [
    ["A", -12, -327, 203, 0, 180],
    ["L", -12, -124, -12, 45],
    ["L", -114, -39, 89, -39],
    ["L", 191, -327, -216, -327],
    ["T", 180, -119, 150, "2"],
  ],
  OUTLET_IT: [
    ["A", 5, -225, 169, 0, 180],
    ["L", 5, -56, 5, 84],
    ["L", 89, 14, -80, 14],
    ["L", -164, -225, 174, -225],
    ["L", -248, -225, -164, -225],
    ["L", 174, -225, 258, -225],
    ["L", -80, -20, 89, -20],
    ["L", -80, 48, 89, 48],
    ["L", -164, -225, 174, -225],
    ["L", -80, -20, 89, -20],
    ["L", -80, 48, 89, 48],
    ["T", 171, -13, 150, "IT"],
  ],
  OUTLET_INDUSTRIAL: [
    ["A", 5, -225, 169, 0, 180],
    ["L", 5, -56, 5, 84],
    ["L", 89, 14, -80, 14],
    ["L", -164, -225, 174, -225],
    ["L", -248, -225, -164, -225],
    ["L", 174, -225, 258, -225],
    ["L", -80, -20, 89, -20],
    ["L", -80, 48, 89, 48],
    ["L", -164, -225, 174, -225],
    ["L", -80, -20, 89, -20],
    ["L", -80, 48, 89, 48],
  ],
  OUTLET_VESDA: [
    ["A", 5, -225, 169, 0, 180],
    ["L", 5, -56, 5, 84],
    ["L", 89, 14, -80, 14],
    ["L", -164, -225, 174, -225],
    ["L", -248, -225, -164, -225],
    ["L", 174, -225, 258, -225],
    ["L", -80, -20, 89, -20],
    ["L", -80, 48, 89, 48],
    ["L", -164, -225, 174, -225],
    ["L", -80, -20, 89, -20],
    ["L", -80, 48, 89, 48],
    ["T", 221, 17, 150, "VD"],
  ],
  HIGH_SPEED_DOOR: [
    ["L", -214, 235, 165, 235],
    ["L", 165, 235, 165, -121],
    ["L", 165, -121, -214, -121],
    ["L", -214, 235, -214, -121],
    ["P", false, [-214, 235, 165, -121]],
    ["P", false, [-214, -121, 165, 235]],
    ["T", 245, 218, 150, "B"],
  ],
  FIRE_SPEED_DOOR: [
    ["L", -214, 235, 165, 235],
    ["L", 165, 235, 165, -121],
    ["L", 165, -121, -214, -121],
    ["L", -214, 235, -214, -121],
    ["P", false, [-214, 235, 165, -121]],
    ["P", false, [-214, -121, 165, 235]],
    ["T", 245, 218, 150, "C"],
  ],
  SECTIONAL_DOOR: [
    ["L", -214, 235, 165, 235],
    ["L", 165, 235, 165, -121],
    ["L", 165, -121, -214, -121],
    ["L", -214, 235, -214, -121],
    ["P", false, [-214, 235, 165, -121]],
    ["P", false, [-214, -121, 165, 235]],
    ["T", 245, 218, 150, "A"],
  ],
  OUTLET_INDUSTRIAL_3P: [
    ["A", 58, -225, 169, 0, 180],
    ["L", 58, -56, 58, 84],
    ["L", 143, 14, -26, 14],
    ["L", -110, -225, 227, -225],
    ["L", -195, -225, -110, -225],
    ["L", 227, -225, 312, -225],
    ["L", -26, -20, 143, -20],
    ["L", -26, 48, 143, 48],
    ["L", -110, -225, 227, -225],
    ["L", -26, -20, 143, -20],
    ["L", -26, 48, 143, 48],
  ],
  FLY_CATCHER: [
    ["A", -12, -327, 203, 0, 180],
    ["L", -12, -124, -12, 45],
    ["L", -114, -39, 89, -39],
    ["L", 191, -327, -216, -327],
    ["T", 180, -96, 150, "FT"],
  ],
} satisfies Record<string, SymbolPrim[]>;

export type FixtureSymbolName = keyof typeof FIXTURE_SYMBOLS;

/**
 * Pilih simbol dari nama family/type fixture Revit (fixture_type + label).
 * Dicocokkan lewat kata kunci; null kalau tidak ada yang cocok — header
 * kolom itu cuma berisi teks seperti sebelumnya.
 */
export function fixtureSymbolFor(type: string, label?: string | null): FixtureSymbolName | null {
  const t = `${type} ${label ?? ""}`.toUpperCase().replace(/[_-]+/g, " ");
  const has = (...words: string[]) => words.some((w) => t.includes(w));
  const battery = has("BATTERY", "BATERAI", "EMERGENCY", "C/W B", "W/ B");

  if (has("EXIT")) return "EXIT";
  if (has("HIGH SPEED DOOR", "HIGHSPEED DOOR", "ROLLING DOOR", "SHUTTER")) return "HIGH_SPEED_DOOR";
  if (has("FIRE SPEED DOOR", "FIRE DOOR")) return "FIRE_SPEED_DOOR";
  if (has("SECTIONAL DOOR", "DOCK", "DOOR")) return "SECTIONAL_DOOR";
  if (has("FLY CATCHER", "INSECT")) return "FLY_CATCHER";
  if (has("VESDA")) return "OUTLET_VESDA";
  if (has("HIGHBAY", "HIGH BAY", "LOWBAY", "LOW BAY")) return battery ? "HIGHBAY_BATTERY" : "HIGHBAY";
  if (has("DOWNLIGHT", "DOWN LIGHT", "SPOT")) return "DOWNLIGHT";
  if (has("RECESS")) return battery ? "RECESSED_BATTERY" : "RECESSED";
  if (has("EMERGENCY LAMP", "EMERGENCY LIGHT")) return "EMERGENCY_LAMP";
  if (has("OUTLET", "RECEPTACLE", "SOCKET", "STOP KONTAK", "STOPKONTAK", "KOTAK KONTAK")) {
    if (has("FOR IT", " IT ", "DATA", "UPS")) return "OUTLET_IT";
    if (has("3P", "3 P", "3PH", "3 PH", "32A", "3%%C", "3Ø")) return "OUTLET_INDUSTRIAL_3P";
    if (has("INDUSTRIAL", "CEE")) return "OUTLET_INDUSTRIAL";
    if (has("DOUBLE", "DUPLEX", "GANDA")) return "OUTLET_DOUBLE";
    return "OUTLET_SINGLE";
  }
  if (has("LED", "LIGHT", "LAMP", "LUMINAIRE", "TL", "BATTEN", "LINEAR", "SURFACE")) {
    if (has("SURFACE", "BATTEN") || battery) return battery ? "SURFACE_BATTERY" : "RECESSED";
    return "RECESSED";
  }
  return null;
}
