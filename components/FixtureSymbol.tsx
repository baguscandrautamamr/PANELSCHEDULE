import { FIXTURE_SYMBOLS, type FixtureSymbolName, type SymbolPrim } from "@/lib/fixtureSymbols";

/** Titik di busur CAD (sudut derajat, y ke atas) -> koordinat SVG (y ke bawah). */
const arcPt = (x: number, y: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return `${x + r * Math.cos(a)} ${-(y + r * Math.sin(a))}`;
};

function Prim({ p }: { p: SymbolPrim }) {
  switch (p[0]) {
    case "L":
      return <line x1={p[1]} y1={-p[2]} x2={p[3]} y2={-p[4]} />;
    case "P": {
      const pts = [];
      for (let i = 0; i + 1 < p[2].length; i += 2) pts.push(`${p[2][i]},${-p[2][i + 1]}`);
      return p[1] ? <polygon points={pts.join(" ")} /> : <polyline points={pts.join(" ")} />;
    }
    case "C":
      return <circle cx={p[1]} cy={-p[2]} r={p[3]} />;
    case "A": {
      const [, x, y, r, a0, a1] = p;
      const span = (((a1 - a0) % 360) + 360) % 360 || 360;
      if (span >= 359.9) return <circle cx={x} cy={-y} r={r} />;
      return (
        <path
          d={`M${arcPt(x, y, r, a0)} A${r} ${r} 0 ${span > 180 ? 1 : 0} 0 ${arcPt(x, y, r, a1)}`}
        />
      );
    }
    case "T":
      return (
        <text x={p[1]} y={-p[2]} fontSize={p[3] * 1.3} fill="currentColor" stroke="none">
          {p[4]}
        </text>
      );
  }
}

/** Simbol fixture template (lib/fixtureSymbols) untuk header kolom FIXTURE. */
export default function FixtureSymbol({
  name,
  className = "",
}: {
  name: FixtureSymbolName;
  className?: string;
}) {
  return (
    <svg viewBox="-780 -420 1560 980" className={className} aria-hidden>
      <g stroke="currentColor" strokeWidth={22} fill="none">
        {FIXTURE_SYMBOLS[name].map((p, i) => (
          <Prim key={i} p={p as SymbolPrim} />
        ))}
      </g>
    </svg>
  );
}
