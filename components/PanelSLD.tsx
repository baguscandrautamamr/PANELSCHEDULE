"use client";

import type { Circuit, Panel } from "@/lib/types";

/**
 * SLD dinamis (SVG) — dirender dari data circuits yang sama dengan tabel.
 * Source panel -> incoming cable -> main breaker -> fuse + lampu R/Y/B ->
 * bus vertikal -> breaker per circuit -> outgoing cable.
 */

const ROW_H = 30;
const BUS_X = 190;
const TOP = 96;

function BreakerGlyph({
  x,
  y,
  type,
}: {
  x: number;
  y: number;
  type: string | null;
}) {
  const t = (type ?? "").toUpperCase();
  const isMccb = t.includes("MCCB");
  const isRcbo = t.includes("RCBO");
  return (
    <g stroke="currentColor" strokeWidth={1.2} fill="none">
      {/* kontak breaker */}
      <line x1={x} y1={y} x2={x + 10} y2={y} />
      <line x1={x + 10} y1={y} x2={x + 26} y2={y - 9} />
      <line x1={x + 26} y1={y} x2={x + 40} y2={y} />
      {/* MCCB: kotak; RCBO: lingkaran residual */}
      {isMccb && <rect x={x + 6} y={y - 13} width={26} height={18} />}
      {isRcbo && <circle cx={x + 33} cy={y} r={4.5} />}
    </g>
  );
}

export default function PanelSLD({
  panel,
  circuits,
}: {
  panel: Panel;
  circuits: Circuit[];
}) {
  const rows = circuits;
  const height = TOP + rows.length * ROW_H + 24;
  const width = 780;
  const lampColors: [string, string][] = [
    ["R", "#dc2626"],
    ["Y", "#eab308"],
    ["B", "#2563eb"],
  ];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="text-neutral-800"
      role="img"
      aria-label={`Single line diagram panel ${panel.panel_code}`}
    >
      {/* symbol tag */}
      {panel.symbol_tag && (
        <g>
          <rect x={12} y={10} width={34} height={22} fill="none" stroke="currentColor" />
          <text x={29} y={25} textAnchor="middle" fontSize={12} fontWeight="bold" fill="currentColor">
            {panel.symbol_tag}
          </text>
        </g>
      )}

      {/* incoming: source -> main breaker -> bus */}
      <text x={16} y={58} fontSize={10} fill="currentColor">
        {panel.source_panel ?? "FROM ..."}
      </text>
      <line x1={16} y1={64} x2={BUS_X} y2={64} stroke="currentColor" strokeWidth={1.2} />
      {/* incoming cable label */}
      <text x={16} y={78} fontSize={9} fill="currentColor">
        {panel.incoming_cable ?? ""}
      </text>
      {/* main breaker */}
      <BreakerGlyph x={96} y={64} type={panel.main_breaker_type} />
      <text x={96} y={48} fontSize={9} fill="currentColor">
        {panel.main_breaker_type} {panel.main_breaker_rating}
      </text>

      {/* fuse + indicator lamp R/Y/B */}
      <line x1={160} y1={64} x2={160} y2={30} stroke="currentColor" strokeWidth={1} />
      <rect x={156} y={34} width={8} height={14} fill="none" stroke="currentColor" />
      <text x={168} y={32} fontSize={8} fill="currentColor">
        {panel.fuse_rating ?? "F"}
      </text>
      {lampColors.map(([label, color], i) => (
        <g key={label}>
          <line
            x1={160}
            y1={30}
            x2={124 + i * 18}
            y2={18}
            stroke="currentColor"
            strokeWidth={0.75}
          />
          <circle cx={124 + i * 18} cy={14} r={5} fill="none" stroke={color} strokeWidth={1.5} />
          <text x={124 + i * 18} y={17} textAnchor="middle" fontSize={7} fill={color}>
            {label}
          </text>
        </g>
      ))}

      {/* bus vertikal */}
      <line
        x1={BUS_X}
        y1={64}
        x2={BUS_X}
        y2={TOP + (rows.length - 1) * ROW_H}
        stroke="currentColor"
        strokeWidth={2.5}
      />

      {/* branch per circuit */}
      {rows.map((c, i) => {
        const y = TOP + i * ROW_H;
        return (
          <g key={c.id} className={c.is_spare ? "opacity-40" : ""}>
            <BreakerGlyph x={BUS_X} y={y} type={c.breaker_type} />
            <line
              x1={BUS_X + 40}
              y1={y}
              x2={BUS_X + 96}
              y2={y}
              stroke="currentColor"
              strokeWidth={1}
            />
            {/* panah keluar */}
            <polygon
              points={`${BUS_X + 96},${y - 3.5} ${BUS_X + 104},${y} ${BUS_X + 96},${y + 3.5}`}
              fill="currentColor"
            />
            <text x={BUS_X + 112} y={y + 3} fontSize={9} fill="currentColor">
              {c.breaker_type} {c.breaker_rating}
            </text>
            <text x={BUS_X + 210} y={y + 3} fontSize={9} fill="currentColor">
              {c.outgoing_cable ?? ""}
            </text>
            <text x={BUS_X + 360} y={y + 3} fontSize={9} fontWeight={600} fill="currentColor">
              {c.function_name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
