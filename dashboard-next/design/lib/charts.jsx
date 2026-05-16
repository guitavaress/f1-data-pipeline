/* Chart primitives — small, opinionated SVG charts that match the
   telemetry/paddock aesthetic.

   Adaptação mínima do design/lib/charts.jsx do prototype Claude Design:
   - 'use client' (componentes interativos via React)
   - imports React no topo (era global UMD no prototype)
   - exports ES no final (era Object.assign(window, ...) no prototype)
   - lógica/visual idênticos. */
"use client";

import React from "react";

export const COMPOUND_COLOR = {
  SOFT:   "var(--c-soft)",
  MEDIUM: "var(--c-medium)",
  HARD:   "var(--c-hard)",
  INTERMEDIATE: "var(--c-inter)",
  WET:    "var(--c-wet)",
  C1: "var(--c1)", C2: "var(--c2)", C3: "var(--c3)", C4: "var(--c4)", C5: "var(--c5)",
};

export function niceTicks(min, max, count = 5) {
  const range = max - min || 1;
  const step = Math.pow(10, Math.floor(Math.log10(range / count)));
  const err = (count * step) / range;
  const stepAdj = err <= 0.15 ? step * 10 : err <= 0.35 ? step * 5 : err <= 0.75 ? step * 2 : step;
  const t = [];
  for (let v = Math.ceil(min / stepAdj) * stepAdj; v <= max + 1e-9; v += stepAdj) t.push(+v.toFixed(8));
  return t.length ? t : [min, max];
}

export function makeScale(domain, range) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return v => r0 + ((v - d0) / span) * (r1 - r0);
}

// =========================================================================
// LineChart
// =========================================================================
export function LineChart({ series, width = 600, height = 280, yLabel = "", xLabel = "",
                    yFormat = v => v, xFormat = v => v, padding = { t: 18, r: 18, b: 32, l: 48 } }) {
  const innerW = width - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;

  const allX = series.flatMap(s => s.points.map(p => p.x));
  const allY = series.flatMap(s => s.points.map(p => p.y));
  if (!allX.length) return null;

  const xDomain = [Math.min(...allX), Math.max(...allX)];
  const yDomain = [
    Math.min(0, Math.min(...allY) * 0.95),
    Math.max(...allY) * 1.08,
  ];
  const x = makeScale(xDomain, [padding.l, padding.l + innerW]);
  const y = makeScale(yDomain, [padding.t + innerH, padding.t]);

  const xTicks = (() => {
    const span = xDomain[1] - xDomain[0];
    if (span <= 10) {
      const out = [];
      for (let i = xDomain[0]; i <= xDomain[1]; i++) out.push(i);
      return out;
    }
    return niceTicks(xDomain[0], xDomain[1], 6);
  })();
  const yTicks = niceTicks(yDomain[0], yDomain[1], 5);

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} width="100%" preserveAspectRatio="xMidYMid meet">
      <g className="grid">
        {yTicks.map((t, i) => (
          <line key={i} x1={padding.l} x2={padding.l + innerW} y1={y(t)} y2={y(t)} />
        ))}
      </g>
      <g className="axis">
        {yTicks.map((t, i) => (
          <text key={i} x={padding.l - 8} y={y(t) + 3} textAnchor="end">{yFormat(t)}</text>
        ))}
        {xTicks.map((t, i) => (
          <text key={i} x={x(t)} y={padding.t + innerH + 16} textAnchor="middle">{xFormat(t)}</text>
        ))}
      </g>
      {series.map((s, si) => {
        const pts = s.points.filter(p => p.y != null);
        if (!pts.length) return null;
        const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.x)},${y(p.y)}`).join(" ");
        return (
          <g key={si}>
            <path d={d} fill="none" stroke={s.color} strokeWidth="1.6"
                  strokeDasharray={s.dashed ? "3 3" : undefined} />
            {pts.map((p, i) => (
              <circle key={i} cx={x(p.x)} cy={y(p.y)} r="2.5" fill={s.color}>
                <title>{`${s.label} · ${xFormat(p.x)} · ${yFormat(p.y)}`}</title>
              </circle>
            ))}
          </g>
        );
      })}
      {yLabel ? (
        <text x={12} y={padding.t - 4} fill="var(--fg-3)" fontSize="9.5">{yLabel}</text>
      ) : null}
    </svg>
  );
}

// =========================================================================
// BarChart (grouped)
// =========================================================================
export function BarChart({ data, width = 600, height = 240, yFormat = v => v,
                   padding = { t: 12, r: 12, b: 32, l: 44 }, showZero = true }) {
  const innerW = width - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;
  const allV = data.flatMap(d => d.groups.map(g => g.value));
  if (!allV.length) return null;

  const maxV = Math.max(...allV);
  const minV = Math.min(0, Math.min(...allV));
  const yD = [minV, maxV * 1.1];
  const y = makeScale(yD, [padding.t + innerH, padding.t]);

  const bandW = innerW / data.length;
  const groupCount = data[0]?.groups.length || 1;
  const barW = (bandW * 0.7) / groupCount;
  const yTicks = niceTicks(yD[0], yD[1], 4);

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} width="100%" preserveAspectRatio="xMidYMid meet">
      <g className="grid">
        {yTicks.map((t, i) => (
          <line key={i} x1={padding.l} x2={padding.l + innerW} y1={y(t)} y2={y(t)} />
        ))}
      </g>
      <g className="axis">
        {yTicks.map((t, i) => (
          <text key={i} x={padding.l - 8} y={y(t) + 3} textAnchor="end">{yFormat(t)}</text>
        ))}
        {data.map((d, i) => (
          <text key={i} x={padding.l + bandW * (i + 0.5)} y={padding.t + innerH + 16}
                textAnchor="middle">{d.label}</text>
        ))}
        {showZero && minV < 0 && (
          <line x1={padding.l} x2={padding.l + innerW} y1={y(0)} y2={y(0)}
                stroke="var(--fg-4)" strokeWidth="0.8" />
        )}
      </g>
      {data.map((d, i) => (
        <g key={i}>
          {d.groups.map((g, gi) => {
            const xPos = padding.l + bandW * (i + 0.15) + gi * barW;
            const yPos = g.value >= 0 ? y(g.value) : y(0);
            const h = Math.abs(y(g.value) - y(0));
            return (
              <rect key={gi} x={xPos} y={yPos} width={barW - 2} height={h}
                    fill={g.color} rx="1">
                <title>{`${g.key} · ${yFormat(g.value)}`}</title>
              </rect>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

// =========================================================================
// Heatmap
// =========================================================================
export function Heatmap({ rows, cols, width = 600, cellH = 26, colorScale = "redgreen",
                  yFormat = v => v, valueFormat = v => v?.toFixed?.(3) ?? "" }) {
  const padL = 150, padR = 12, padT = 24, padB = 8;
  const innerW = width - padL - padR;
  const cellW = innerW / cols.length;
  const height = padT + padB + rows.length * cellH;

  const allV = rows.flatMap(r => r.values.map(v => v.value)).filter(v => v != null);
  const minV = Math.min(...allV);
  const maxV = Math.max(...allV);

  function color(v) {
    if (v == null) return "var(--bg-2)";
    const t = (v - minV) / ((maxV - minV) || 1);
    if (colorScale === "redgreen") {
      const hue = 145 - t * 115;
      const chroma = 0.10 + t * 0.06;
      return `oklch(${0.62 + t * 0.08} ${chroma} ${hue})`;
    }
    return `oklch(0.65 0.12 ${30 + t * 60})`;
  }

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} width="100%" preserveAspectRatio="xMidYMid meet">
      <g className="axis">
        {cols.map((c, i) => (
          <text key={i} x={padL + cellW * (i + 0.5)} y={padT - 8} textAnchor="middle">{c}</text>
        ))}
        {rows.map((r, i) => (
          <text key={i} x={padL - 8} y={padT + cellH * (i + 0.5) + 3.5} textAnchor="end">{yFormat(r.label)}</text>
        ))}
      </g>
      {rows.map((r, ri) => (
        <g key={ri}>
          {cols.map((c, ci) => {
            const cell = r.values.find(v => v.col === c);
            const v = cell?.value;
            return (
              <g key={ci}>
                <rect x={padL + cellW * ci + 1} y={padT + cellH * ri + 1}
                      width={cellW - 2} height={cellH - 2}
                      fill={cell?.color || color(v)} rx="2">
                  <title>{`${r.label} · ${c} · ${valueFormat(v)}`}</title>
                </rect>
                {v != null && (
                  <text x={padL + cellW * (ci + 0.5)} y={padT + cellH * (ri + 0.5) + 3.5}
                        textAnchor="middle" fill="rgba(20,20,22,0.85)"
                        fontFamily="var(--font-mono)" fontSize="9.5">
                    {valueFormat(v)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

// =========================================================================
// Scatter
// =========================================================================
export function Scatter({ points, width = 600, height = 320, optimalBands = [],
                   xFormat = v => v, yFormat = v => v,
                   xLabel = "", yLabel = "",
                   padding = { t: 16, r: 18, b: 36, l: 50 } }) {
  const innerW = width - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;
  if (!points.length) return null;

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const xD = [Math.min(...xs) * 0.95, Math.max(...xs) * 1.05];
  const yD = [0, Math.max(...ys) * 1.1];
  const x = makeScale(xD, [padding.l, padding.l + innerW]);
  const y = makeScale(yD, [padding.t + innerH, padding.t]);

  const xTicks = niceTicks(xD[0], xD[1], 6);
  const yTicks = niceTicks(yD[0], yD[1], 5);

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} width="100%" preserveAspectRatio="xMidYMid meet">
      <g className="grid">
        {yTicks.map((t, i) => (
          <line key={i} x1={padding.l} x2={padding.l + innerW} y1={y(t)} y2={y(t)} />
        ))}
      </g>
      {optimalBands.map((b, i) => (
        <g key={i}>
          <rect x={x(b.x0)} y={padding.t}
                width={x(b.x1) - x(b.x0)} height={innerH}
                fill={b.color} opacity="0.08" />
          <text x={(x(b.x0) + x(b.x1)) / 2} y={padding.t + 10}
                textAnchor="middle" fill={b.color} fontSize="9.5"
                fontFamily="var(--font-mono)">
            {b.label}
          </text>
        </g>
      ))}
      <g className="axis">
        {yTicks.map((t, i) => (
          <text key={i} x={padding.l - 8} y={y(t) + 3} textAnchor="end">{yFormat(t)}</text>
        ))}
        {xTicks.map((t, i) => (
          <text key={i} x={x(t)} y={padding.t + innerH + 16} textAnchor="middle">{xFormat(t)}</text>
        ))}
        {xLabel && (
          <text x={padding.l + innerW / 2} y={padding.t + innerH + 30}
                textAnchor="middle" fill="var(--fg-4)">{xLabel}</text>
        )}
      </g>
      {points.map((p, i) => (
        <circle key={i} cx={x(p.x)} cy={y(p.y)} r={p.r || 2.6}
                fill={p.color} opacity="0.55">
          <title>{p.label || ""}</title>
        </circle>
      ))}
    </svg>
  );
}

// =========================================================================
// Sparkline
// =========================================================================
export function Sparkline({ points, color = "var(--hot)", width = 110, height = 36,
                     showDot = true, area = false }) {
  if (!points.length) return null;
  const ys = points.map(p => p.y);
  const xs = points.map(p => p.x);
  const yD = [Math.min(...ys) * 0.95, Math.max(...ys) * 1.05];
  const xD = [Math.min(...xs), Math.max(...xs)];
  const x = makeScale(xD, [2, width - 2]);
  const y = makeScale(yD, [height - 4, 4]);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.x)},${y(p.y)}`).join(" ");
  const areaD = d + ` L${x(xs[xs.length - 1])},${height} L${x(xs[0])},${height} Z`;
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
      {area && <path d={areaD} fill={color} opacity="0.12" />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      {showDot && (
        <circle cx={x(last.x)} cy={y(last.y)} r="2.2" fill={color} />
      )}
    </svg>
  );
}

// =========================================================================
// HorizontalBars
// =========================================================================
export function HorizontalBars({ data, width = 360, rowH = 26, maxOverride = null,
                          valueFormat = v => v }) {
  const max = maxOverride ?? Math.max(...data.map(d => d.value));
  const labelW = 130;
  const padR = 50;
  const barMaxW = width - labelW - padR;
  return (
    <svg viewBox={`0 0 ${width} ${data.length * rowH + 8}`} width="100%"
         preserveAspectRatio="xMidYMid meet">
      {data.map((d, i) => {
        const w = Math.max(2, (d.value / max) * barMaxW);
        const y = i * rowH + 4;
        return (
          <g key={i}>
            <text x={labelW - 8} y={y + rowH / 2 + 3.5} textAnchor="end"
                  fontFamily="var(--font-mono)" fontSize="10.5" fill="var(--fg-2)">
              {d.label}
            </text>
            <rect x={labelW} y={y + 5} width={w} height={rowH - 12}
                  fill={d.color} rx="2" opacity="0.9">
              <title>{`${d.label} · ${valueFormat(d.value)}`}</title>
            </rect>
            <text x={labelW + w + 6} y={y + rowH / 2 + 3.5}
                  fontFamily="var(--font-mono)" fontSize="10" fill="var(--fg-3)">
              {valueFormat(d.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// =========================================================================
// DegradationCurve
// =========================================================================
export function DegradationCurve({ baseTime, degPerLap, laps, color, label,
                            width = 280, height = 110, cliff = false }) {
  const pad = { t: 8, r: 8, b: 18, l: 24 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const pts = [];
  for (let i = 0; i < laps; i++) {
    let t = baseTime + i * degPerLap;
    if (cliff && i > laps * 0.75) t += (i - laps * 0.75) ** 1.6 * degPerLap * 0.4;
    pts.push({ x: i + 1, y: t });
  }
  const yMin = Math.min(...pts.map(p => p.y));
  const yMax = Math.max(...pts.map(p => p.y));
  const x = makeScale([1, laps], [pad.l, pad.l + innerW]);
  const y = makeScale([yMin - 0.1, yMax + 0.1], [pad.t + innerH, pad.t]);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.x)},${y(p.y)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" preserveAspectRatio="xMidYMid meet">
      <g className="grid">
        <line x1={pad.l} x2={pad.l + innerW} y1={pad.t + innerH} y2={pad.t + innerH}
              stroke="var(--border-soft)" />
      </g>
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" />
      <path d={d + ` L${x(laps)},${pad.t + innerH} L${x(1)},${pad.t + innerH} Z`}
            fill={color} opacity="0.10" />
      <text x={pad.l} y={pad.t + innerH + 12} fontFamily="var(--font-mono)"
            fontSize="9" fill="var(--fg-4)">L1</text>
      <text x={pad.l + innerW} y={pad.t + innerH + 12} fontFamily="var(--font-mono)"
            fontSize="9" fill="var(--fg-4)" textAnchor="end">L{laps}</text>
      <text x={pad.l + 4} y={pad.t + 10} fontFamily="var(--font-mono)"
            fontSize="9.5" fill={color}>{label}</text>
    </svg>
  );
}
