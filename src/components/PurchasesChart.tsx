"use client";

import { useState } from "react";

export type ChartPoint = {
  label: string;
  collected: number;
  electricity: number;
  fees: number;
  kwh: number;
  count: number;
};

const ACCENT = "#059669"; // emerald-600, validated vs white surface
const W = 720;
const H = 240;
const PAD = { top: 12, right: 8, bottom: 28, left: 64 };

const ngn = (n: number) =>
  `₦${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const compact = (n: number) =>
  n >= 1e6
    ? `₦${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M`
    : n >= 1e3
      ? `₦${(n / 1e3).toFixed(n % 1e3 ? 1 : 0)}K`
      : `₦${n}`;

/** Round the axis max up to a clean 1/2/5 × 10^n step. */
function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const ticks = [];
  for (let v = 0; v <= max + step * 0.999; v += step) ticks.push(v);
  return ticks;
}

export function PurchasesChart({
  points,
  title,
}: {
  points: ChartPoint[];
  title: string;
}) {
  const [active, setActive] = useState<number | null>(null);

  const ticks = niceTicks(Math.max(...points.map((p) => p.collected), 0));
  const yMax = ticks[ticks.length - 1] || 1;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / Math.max(points.length, 1);
  const barW = Math.min(24, Math.max(2, band * 0.6));
  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;
  // Show at most ~10 x labels so they never collide.
  const labelEvery = Math.max(1, Math.ceil(points.length / 10));

  const a = active != null ? points[active] : null;

  return (
    <figure className="rounded-xl border bg-white p-4 shadow-sm">
      <figcaption className="mb-2 text-sm font-medium text-slate-700">
        {title}
      </figcaption>
      {/* Keep labels legible on phones: scroll the chart rather than shrink it. */}
      <div className="overflow-x-auto">
        <div className="relative min-w-[560px]">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full"
            role="img"
            aria-label={title}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="#e2e8f0"
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 8}
                  y={y(t)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-slate-500 text-[11px]"
                >
                  {compact(t)}
                </text>
              </g>
            ))}
            {points.map((p, i) => {
              const cx = PAD.left + band * i + band / 2;
              const top = y(p.collected);
              const h = PAD.top + plotH - top;
              const r = Math.min(4, h / 2, barW / 2);
              const x0 = cx - barW / 2;
              const base = PAD.top + plotH;
              return (
                <g
                  key={i}
                  tabIndex={0}
                  role="graphics-symbol"
                  aria-label={`${p.label}: ${ngn(p.collected)} collected`}
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="outline-none"
                >
                  {/* Hit target: the whole band, bigger than the mark */}
                  <rect
                    x={PAD.left + band * i}
                    y={PAD.top}
                    width={band}
                    height={plotH}
                    fill="transparent"
                  />
                  {h > 0 && (
                    <path
                      d={`M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barW - r} Q${x0 + barW},${top} ${x0 + barW},${top + r} V${base} Z`}
                      fill={ACCENT}
                      opacity={active == null || active === i ? 1 : 0.55}
                    />
                  )}
                  {i % labelEvery === 0 && (
                    <text
                      x={cx}
                      y={H - 8}
                      textAnchor="middle"
                      className="fill-slate-500 text-[11px]"
                    >
                      {p.label.replace("Week of ", "")}
                    </text>
                  )}
                </g>
              );
            })}
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={PAD.top + plotH}
              y2={PAD.top + plotH}
              stroke="#cbd5e1"
              strokeWidth={1}
            />
          </svg>

          {a && (
            <div
              className="pointer-events-none absolute top-2 rounded-md border bg-white px-3 py-2 text-xs shadow-md"
              style={{
                left: `${((PAD.left + band * active! + band / 2) / W) * 100}%`,
                transform:
                  active! > points.length / 2
                    ? "translateX(calc(-100% - 12px))"
                    : "translateX(12px)",
              }}
            >
              <p className="text-sm font-semibold text-slate-900">
                {ngn(a.collected)}
              </p>
              <p className="text-slate-500">{a.label}</p>
              <p className="mt-1 text-slate-600">
                {a.count} purchase{a.count === 1 ? "" : "s"} · {a.kwh} kWh
              </p>
              <p className="text-slate-600">
                {ngn(a.electricity)} electricity + {ngn(a.fees)} fees
              </p>
            </div>
          )}
        </div>
      </div>
    </figure>
  );
}
