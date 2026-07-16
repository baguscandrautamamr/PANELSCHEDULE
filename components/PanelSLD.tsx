"use client";

import type { Panel } from "@/lib/types";

/**
 * Strip header SLD (SVG) — source panel -> incoming cable -> main breaker
 * -> MCB rating -> fuse + lampu R/Y/B. Cabang per-circuit TIDAK di sini —
 * itu dirender sebagai kolom pertama di PanelScheduleTable supaya baris
 * breaker selalu sejajar persis dengan baris circuit di tabel (satu <tr>
 * yang sama), tidak bisa meleset walau ada baris yang wrap 2 baris teks.
 */
export default function PanelSLD({ panel }: { panel: Panel }) {
  const width = 640;
  const height = 112;
  const lampColors: [string, string][] = [
    ["R", "#dc2626"],
    ["Y", "#eab308"],
    ["B", "#2563eb"],
  ];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full text-neutral-800"
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

      {/* incoming: source -> main breaker */}
      {panel.source_panel && (
        <text x={16} y={58} fontSize={10} fill="currentColor">
          {panel.source_panel}
        </text>
      )}
      <line x1={16} y1={64} x2={190} y2={64} stroke="currentColor" strokeWidth={1.2} />
      {panel.incoming_cable && (
        <text x={16} y={78} fontSize={9} fill="currentColor">
          {panel.incoming_cable}
        </text>
      )}

      {/* main breaker */}
      <g stroke="currentColor" strokeWidth={1.2} fill="none">
        <line x1={96} y1={64} x2={106} y2={64} />
        <line x1={106} y1={64} x2={122} y2={55} />
        <line x1={122} y1={64} x2={136} y2={64} />
        {(panel.main_breaker_type ?? "").toUpperCase().includes("MCCB") && (
          <rect x={102} y={51} width={26} height={18} />
        )}
      </g>
      <text x={96} y={48} fontSize={9} fill="currentColor">
        {panel.main_breaker_type}
      </text>

      {/* MCB Rating — sync dari param Rating main breaker di Revit */}
      {panel.main_breaker_rating && (
        <g>
          <rect x={72} y={76} width={92} height={30} fill="none" stroke="currentColor" strokeWidth={0.75} />
          <text x={78} y={89} fontSize={7.5} fill="currentColor">
            MCB Rating
          </text>
          <text x={78} y={101} fontSize={9} fontWeight={700} fill="currentColor">
            {panel.main_breaker_rating}
          </text>
        </g>
      )}

      {/* fuse + indicator lamp R/Y/B */}
      <line x1={190} y1={64} x2={190} y2={30} stroke="currentColor" strokeWidth={1} />
      <rect x={186} y={34} width={8} height={14} fill="none" stroke="currentColor" />
      <text x={202} y={32} fontSize={8} fill="currentColor">
        {panel.fuse_rating ?? "F"}
      </text>
      {lampColors.map(([label, color], i) => (
        <g key={label}>
          <line x1={190} y1={30} x2={228 + i * 18} y2={18} stroke="currentColor" strokeWidth={0.75} />
          <circle cx={228 + i * 18} cy={14} r={5} fill="none" stroke={color} strokeWidth={1.5} />
          <text x={228 + i * 18} y={17} textAnchor="middle" fontSize={7} fill={color}>
            {label}
          </text>
        </g>
      ))}

      {/* stub bus turun ke tabel di bawahnya */}
      <line x1={190} y1={64} x2={190} y2={height} stroke="currentColor" strokeWidth={2.5} />
      <text x={198} y={height - 4} fontSize={8} fill="currentColor" className="opacity-70">
        ke breaker (tabel di bawah) ▼
      </text>
    </svg>
  );
}
