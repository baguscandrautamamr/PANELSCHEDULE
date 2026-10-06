"use client";

import type { Circuit, Panel } from "@/lib/types";
import { mainBreakerSpec } from "@/lib/circuitSpec";

/**
 * Bagian incoming SLD — posisinya sama dengan template gambar (dan export
 * DXF): dirender di sel paling kiri tabel (rowSpan semua circuit), langsung
 * menempel ke bus vertikal di kolom SLD, jadi meter/main breaker sejajar
 * dengan baris circuit 1-6 seperti di drawing.
 *
 * Koordinat SVG = satuan template DWG (lib/exportDxf), y dibalik.
 * Lebar = jarak kabel incoming ke bus (88900 .. 96052), skala 0,05 px/unit.
 */
const X0 = 88900;
const BUS_X = 96052;
const Y0 = 71950; // sedikit di atas baris circuit pertama (y template dibalik)
const K = 0.05;
const MAIN_Y = 75629;
const FEED_X = 89715;
export const INCOMING_WIDTH = Math.round((BUS_X - X0) * K);

export default function PanelSLD({ panel, circuits }: { panel: Panel; circuits: Circuit[] }) {
  const main = mainBreakerSpec(panel, circuits);
  const isMccb = main.type.startsWith("MCCB");
  const poles = parseInt(main.type.match(/(\d)P/)?.[1] ?? "3", 10);
  const svgH = 5300;
  const mainPx = (MAIN_Y - Y0) * K;
  const feedPx = (FEED_X - X0) * K;

  const brk = 91043; // titik sambung kiri main breaker
  const slash = (i: number) => {
    const dx = (i - (poles - 1) / 2) * 87;
    return `M${brk + 679 + dx} ${MAIN_Y - 358 + dx * 0.58} L${brk + 554 + dx} ${MAIN_Y - 142 + dx * 0.58}`;
  };
  const rating = [main.rating != null ? `${main.rating}A` : null, panel.voltage, panel.phase]
    .filter(Boolean)
    .join(", ");
  const sys = [panel.wire, panel.freq].filter(Boolean).join(", ");

  return (
    <div
      className="relative h-full text-blue-800"
      style={{ width: INCOMING_WIDTH, minHeight: 450 }}
      aria-label={`Single line diagram incoming ${panel.panel_code}`}
    >
      <svg
        viewBox={`${X0} ${Y0} ${BUS_X - X0} ${svgH}`}
        width={INCOMING_WIDTH}
        height={svgH * K}
        className="absolute left-0 top-0"
      >
        <g stroke="#262626" strokeWidth={20} fill="none">
          {/* garis utama: kabel incoming -> main breaker -> bus */}
          <line x1={FEED_X} y1={MAIN_Y} x2={brk} y2={MAIN_Y} />
          <circle cx={90630} cy={MAIN_Y} r={100} />
          <line x1={brk} y1={MAIN_Y} x2={brk + 250} y2={MAIN_Y} />
          <path d={`M${brk + 179} ${MAIN_Y - 71} l142 142 M${brk + 321} ${MAIN_Y - 71} l-142 142`} />
          <line x1={brk + 357} y1={MAIN_Y - 400} x2={brk + 1050} y2={MAIN_Y} />
          {Array.from({ length: poles }, (_, i) => (
            <path key={i} d={slash(i)} />
          ))}
          {isMccb && (
            <path
              d={`M${brk + 655} ${MAIN_Y - 517} l-35 63 M${brk + 569} ${MAIN_Y - 567} l-125 217 M${brk + 620} ${MAIN_Y - 454} l43 25 l-43 73 l-43 -25`}
            />
          )}
          <line x1={brk + 1050} y1={MAIN_Y} x2={BUS_X} y2={MAIN_Y} />
          <circle cx={BUS_X - 75} cy={MAIN_Y} r={75} />

          {/* fuse + lampu R/Y/B */}
          <line x1={92971} y1={MAIN_Y} x2={92971} y2={73585} />
          <rect x={92771} y={74135} width={400} height={640} />
          {[74345, 74455, 74565].map((y) => (
            <line key={y} x1={92651} y1={y} x2={93291} y2={y} />
          ))}
          <line x1={91415} y1={73585} x2={92971} y2={73585} />
          {[91415, 91941, 92467].map((x) => (
            <g key={x}>
              <line x1={x} y1={73585} x2={x} y2={73317} />
              <circle cx={x} cy={73213} r={104} />
              <path d={`M${x - 111} ${73102} l37 37 M${x + 111} ${73324} l-37 -37 M${x - 111} ${73324} l37 -37 M${x + 111} ${73102} l-37 37`} />
            </g>
          ))}

          {/* surge arrester */}
          <line x1={94161} y1={MAIN_Y} x2={94161} y2={76471} />
          <rect x={94086} y={76471} width={150} height={400} />
          <path d="M94086 76471 L94161 76757 L94236 76471 M94161 76871 V77086 M94067 77086 h188 M94114 77134 h94 M94138 77181 h46" />

          {/* voltmeter + VSS + PT */}
          <circle cx={93982} cy={72629} r={214} stroke="#16a34a" />
          <line x1={94196} y1={72629} x2={94522} y2={72629} />
          <path d="M94634 72478 l-48 151 l48 151 l48 -151 z" />
          <line x1={94747} y1={72629} x2={95085} y2={72629} />
          <path d="M95085 72517 h84 M95085 72629 h84 M95085 72741 h84 M95416 72517 h-84 M95416 72629 h-84 M95416 72741 h-84" />
          <line x1={95416} y1={72629} x2={BUS_X} y2={72629} />

          {/* ammeter + ASS + CT */}
          {main.ct && (
            <>
              <circle cx={93982} cy={74565} r={214} stroke="#16a34a" />
              <line x1={94196} y1={74565} x2={94522} y2={74565} />
              <path d="M94634 74414 l-48 151 l48 151 l48 -151 z" />
              <path d={`M94747 74565 H95516 V${MAIN_Y - 200}`} />
              <path d={`M95441 ${MAIN_Y - 100} v200 M95591 ${MAIN_Y - 100} v200`} />
            </>
          )}
        </g>

        <g fill="currentColor" fontFamily="Arial, sans-serif">
          <text x={93982} y={72700} fontSize={230} textAnchor="middle">V</text>
          <text x={93944} y={72330} fontSize={230} textAnchor="middle">0~400V</text>
          <text x={94408} y={73089} fontSize={230}>VSS</text>
          <text x={95089} y={72404} fontSize={230}>PT</text>
          {main.ct && (
            <>
              <text x={93982} y={74636} fontSize={230} textAnchor="middle">A</text>
              <text x={93944} y={74266} fontSize={230} textAnchor="middle">{main.ammeter}</text>
              <text x={94408} y={75030} fontSize={230}>ASS</text>
              <text x={95516} y={76120} fontSize={230} textAnchor="middle">CT</text>
              <text x={95516} y={76400} fontSize={230} textAnchor="middle">{main.ct}</text>
            </>
          )}
          <text x={92551} y={74540} fontSize={280} textAnchor="end">
            {panel.fuse_rating ?? "F 2A"}
          </text>
          {(["R", "Y", "B"] as const).map((l, i) => (
            <text key={l} x={91415 + i * 526} y={72990} fontSize={280} textAnchor="middle">
              {l}
            </text>
          ))}
          <text x={93466} y={77165} fontSize={280}>SA</text>
          <text x={91686} y={76130} fontSize={280} textAnchor="middle">{main.type}</text>
          <text x={91686} y={76600} fontSize={280} textAnchor="middle">
            {main.rating != null ? `${main.rating}A` : main.breaker}
          </text>
        </g>
      </svg>

      {/* kabel incoming turun sampai bawah sel, teksnya vertikal di sampingnya */}
      <div
        className="absolute w-px bg-neutral-800"
        style={{ left: feedPx, top: mainPx, bottom: 52 }}
      />
      {main.cable && (
        <div
          className="absolute whitespace-nowrap text-[12px] leading-none"
          style={{
            left: feedPx - 15,
            bottom: 64,
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
          }}
        >
          {main.cable}
        </div>
      )}
      {/* ujung kabel incoming (~) + sumbernya, seperti template */}
      <svg
        width={24}
        height={10}
        className="absolute"
        style={{ left: feedPx - 12, bottom: 48 }}
        viewBox="0 0 24 10"
      >
        <path d="M0 3 Q6 9 12 3 Q18 -3 24 3" stroke="#262626" fill="none" strokeWidth={1} />
      </svg>
      <div
        className="absolute bottom-1 whitespace-nowrap text-center text-[12px] leading-tight"
        style={{ left: feedPx, transform: "translateX(-50%)" }}
      >
        FROM
        <br />
        {panel.source_panel ? panel.source_panel.replace(/^FROM\s+/i, "") : "-"}
      </div>

      {/* rating panel di ujung bawah bus */}
      <div
        className="absolute bottom-2 right-1 whitespace-nowrap text-[12px] leading-tight"
        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
      >
        {rating},
        <br />
        {sys}
      </div>
    </div>
  );
}
