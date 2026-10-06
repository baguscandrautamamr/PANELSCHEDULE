"use client";

import { useI18n } from "@/lib/i18n";
import type { Circuit, Panel } from "@/lib/types";
import { mainBreakerSpec } from "@/lib/circuitSpec";

/**
 * Header SLD (SVG), tata letaknya sama dengan export DXF:
 *
 *   FROM <source>  ─ kabel incoming (vertikal) ─ MAIN BREAKER ─┬─ bus
 *                                                fuse + R/Y/B ┘ │
 *                       voltmeter (VSS) + ammeter (ASS) + CT, SA ┘
 *
 * Main breaker & kabel incoming dihitung dari CONNECTED AMPERE x 1,2
 * (lib/circuitSpec#mainBreakerSpec). Cabang per-circuit dirender sebagai
 * kolom pertama PanelScheduleTable supaya sejajar dengan baris tabel.
 */
export default function PanelSLD({ panel, circuits }: { panel: Panel; circuits: Circuit[] }) {
  const { t } = useI18n();
  const main = mainBreakerSpec(panel, circuits);
  const isMccb = main.type.startsWith("MCCB");
  const poles = parseInt(main.type.match(/(\d)P/)?.[1] ?? "3", 10);

  const W = 520;
  const H = 300;
  const busY = 150; // garis horizontal utama
  const busX = 470; // bus vertikal panel
  const feedX = 40; // kabel incoming vertikal
  const brkX = 120; // main breaker
  const fuseX = 200;
  const lampColors: [string, string][] = [
    ["R", "#dc2626"],
    ["Y", "#eab308"],
    ["B", "#2563eb"],
  ];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full text-neutral-800"
      role="img"
      aria-label={`Single line diagram panel ${panel.panel_code}`}
    >
      <g stroke="currentColor" fill="none" strokeWidth={1.2}>
        {/* kabel incoming naik dari sumber */}
        <line x1={feedX} y1={H - 30} x2={feedX} y2={busY} />
        <line x1={feedX} y1={busY} x2={busX} y2={busY} />
        <circle cx={brkX - 18} cy={busY} r={3} fill="white" />

        {/* main breaker: kontak + lengan + garis pole */}
        <line x1={brkX} y1={busY} x2={brkX + 30} y2={busY - 14} stroke="white" strokeWidth={3} />
        <line x1={brkX} y1={busY} x2={brkX + 30} y2={busY - 14} />
        <path d={`M${brkX - 3} ${busY - 3} l6 6 M${brkX - 3} ${busY + 3} l6 -6`} />
        {Array.from({ length: poles }, (_, i) => (
          <line
            key={i}
            x1={brkX + 12 + i * 4}
            y1={busY - 3}
            x2={brkX + 18 + i * 4}
            y2={busY - 15}
          />
        ))}
        {isMccb && <rect x={brkX - 6} y={busY - 22} width={44} height={28} strokeDasharray="3 2" />}

        {/* fuse + lampu R/Y/B */}
        <line x1={fuseX} y1={busY} x2={fuseX} y2={40} />
        <rect x={fuseX - 5} y={70} width={10} height={24} />
        <line x1={fuseX} y1={40} x2={fuseX - 60} y2={40} />
        {lampColors.map(([, color], i) => (
          <g key={i}>
            <line x1={fuseX - 60 + i * 22} y1={40} x2={fuseX - 60 + i * 22} y2={28} />
            <rect x={fuseX - 64 + i * 22} y={20} width={8} height={8} stroke={color} />
          </g>
        ))}

        {/* surge arrester */}
        <line x1={380} y1={busY} x2={380} y2={busY + 50} />
        <polygon points={`374,${busY + 22} 386,${busY + 22} 380,${busY + 36}`} fill="currentColor" />
        <path d={`M372 ${busY + 50} h16 M375 ${busY + 54} h10 M378 ${busY + 58} h4`} />

        {/* CT di bus incoming */}
        {main.ct && (
          <circle cx={430} cy={busY} r={5} />
        )}

        {/* ammeter + selector switch dari CT */}
        {main.ammeter && (
          <>
            <line x1={430} y1={busY - 5} x2={430} y2={90} />
            <line x1={430} y1={90} x2={385} y2={90} />
            <rect x={375} y={84} width={10} height={12} />
            <line x1={375} y1={90} x2={358} y2={90} />
            <circle cx={350} cy={90} r={8} stroke="#16a34a" />
          </>
        )}

        {/* voltmeter + VSS + PT dari bus */}
        <line x1={busX} y1={40} x2={385} y2={40} />
        <rect x={375} y={34} width={10} height={12} />
        <line x1={375} y1={40} x2={358} y2={40} />
        <circle cx={350} cy={40} r={8} stroke="#16a34a" />
        <circle cx={busX} cy={40} r={2.5} fill="currentColor" />
      </g>

      {/* bus panel */}
      <line x1={busX} y1={20} x2={busX} y2={H} stroke="#1d4ed8" strokeWidth={3} />
      <circle cx={busX} cy={busY} r={2.5} fill="currentColor" />

      <g fill="currentColor" fontSize={10}>
        {panel.symbol_tag && (
          <g>
            <rect x={8} y={8} width={34} height={20} fill="none" stroke="currentColor" />
            <text x={25} y={22} textAnchor="middle" fontWeight="bold">
              {panel.symbol_tag}
            </text>
          </g>
        )}

        {/* kabel incoming — teks vertikal di samping kabel */}
        {main.cable && (
          <g>
            <rect
              x={feedX - 22}
              y={busY + 6}
              width={16}
              height={H - busY - 40}
              fill="none"
              stroke="#f59e0b"
            />
            <text
              x={feedX - 10}
              y={H - 38}
              fontSize={8.5}
              transform={`rotate(-90 ${feedX - 10} ${H - 38})`}
            >
              {main.cable}
            </text>
          </g>
        )}
        <text x={feedX + 6} y={H - 14} fontSize={10}>
          {panel.source_panel ? `FROM ${panel.source_panel.replace(/^FROM\s+/i, "")}` : ""}
        </text>

        {/* teks main breaker */}
        <rect x={brkX - 6} y={busY + 10} width={60} height={30} fill="none" stroke="#f59e0b" />
        <text x={brkX + 24} y={busY + 22} textAnchor="middle">
          {main.type}
        </text>
        <text x={brkX + 24} y={busY + 35} textAnchor="middle" fontWeight={700}>
          {main.rating != null ? `${main.rating}A` : main.breaker.replace(main.type, "").trim()}
        </text>

        <text x={fuseX + 10} y={86}>
          {panel.fuse_rating ?? "F 2A"}
        </text>
        {lampColors.map(([label, color], i) => (
          <text key={label} x={fuseX - 60 + i * 22} y={16} textAnchor="middle" fill={color}>
            {label}
          </text>
        ))}

        <text x={350} y={43.5} textAnchor="middle" fontSize={9} fill="#16a34a">
          V
        </text>
        <text x={330} y={26} fontSize={8}>
          0~400V
        </text>
        <text x={372} y={58} fontSize={7.5}>
          VSS
        </text>

        {main.ammeter && (
          <>
            <text x={350} y={93.5} textAnchor="middle" fontSize={9} fill="#16a34a">
              A
            </text>
            <text x={320} y={74} fontSize={8}>
              {main.ammeter}
            </text>
            <text x={372} y={108} fontSize={7.5}>
              ASS
            </text>
          </>
        )}
        {main.ct && (
          <text x={418} y={busY + 22} fontSize={8}>
            CT {main.ct}
          </text>
        )}
        <text x={358} y={busY + 34} fontSize={9}>
          SA
        </text>

        <text x={feedX + 6} y={busY - 30} fontSize={8} className="opacity-70">
          {t(
            `Connected ${main.ampere.toFixed(1)} A x 1,2 = ${(main.ampere * 1.2).toFixed(1)} A`,
            `Connected ${main.ampere.toFixed(1)} A x 1.2 = ${(main.ampere * 1.2).toFixed(1)} A`
          )}
        </text>
      </g>
    </svg>
  );
}
