"use client";

/**
 * Compound vs Compound — head-to-head dos físicos C1..C5.
 * Wire: /api/compare?a=C3&b=C4.
 *
 * Métricas das 5 dimensões do radar:
 * - Low Deg:        1 - mean(deg) / max_obs       (mais alto = menos degrada)
 * - Longevity:      mean(stint_length) / 35       (mais alto = stints mais longos)
 * - Speed:          1 - rank(C1..C5) / 5          (C5 mais rápido, C1 mais lento)
 * - Versatility:    distinct_circuits / 24
 * - Predictability: 1 - stddev(deg) / 0.05
 *
 * Linha histórica + histograma de stint length completam.
 */
import React, { useEffect, useMemo, useState } from "react";
import { PageHeader, Card, EmptyState } from "@/design/components/shell";
import { LineChart, Sparkline, makeScale } from "@/design/lib/charts";

const PHYSICAL = ["C1", "C2", "C3", "C4", "C5"];

// Speed ranking: C5 mais macio = mais rápido em lap único
const SPEED_RANK = { C1: 0.2, C2: 0.35, C3: 0.55, C4: 0.78, C5: 0.95 };

export default function PageCompare() {
  const [a, setA] = useState("C3");
  const [b, setB] = useState("C4");
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(`/api/compare?a=${a}&b=${b}`).then((r) => r.json()).then(setData);
  }, [a, b]);

  if (!data) {
    return (
      <main className="page">
        <PageHeader eyebrow="NEW · COMPOUND VS COMPOUND" title="Loading…" />
      </main>
    );
  }

  if (data.error) {
    return (
      <main className="page">
        <PageHeader eyebrow="NEW · COMPOUND VS COMPOUND" title="Error" />
        <EmptyState title={data.error} />
      </main>
    );
  }

  return (
    <main className="page">
      <PageHeader
        eyebrow="NEW · COMPOUND VS COMPOUND"
        title="Head-to-head · physical compounds"
        desc="Side-by-side de dois compounds Pirelli físicos. Útil quando a Pirelli debate trocar de C3 pra C4 num GP — vê o que muda nas 5 dimensões que importam."
      />

      <div className="grid grid-12 gap-lg">
        <div className="col-6">
          <CompareSelector label="A" value={a} setValue={setA} pkg={data.a} />
        </div>
        <div className="col-6">
          <CompareSelector label="B" value={b} setValue={setB} pkg={data.b} />
        </div>
      </div>

      <div className="grid grid-12 mt-20 gap-lg">
        <div className="col-8">
          <Card title="5-dimension profile" sub="0 → 1 NORMALIZED">
            <RadarComparison aName={a} aPkg={data.a} bName={b} bPkg={data.b} />
          </Card>
        </div>
        <div className="col-4">
          <Card title="Verdict" sub="WHO WINS WHAT">
            <Verdict aName={a} aPkg={data.a} bName={b} bPkg={data.b} />
          </Card>
        </div>
      </div>

      <div className="grid grid-2 mt-20 gap-lg">
        <Card title="Degradation over the era · A vs B" sub="S/LAP">
          {(data.a.evolution.length + data.b.evolution.length) === 0
            ? <EmptyState title="No historical data" />
            : <LineChart
                series={[
                  { key: a, label: a, color: `var(--${a.toLowerCase()})`,
                    points: data.a.evolution.map((r) => ({ x: r.year, y: r.avg_deg_s })) },
                  { key: b, label: b, color: `var(--${b.toLowerCase()})`,
                    points: data.b.evolution.map((r) => ({ x: r.year, y: r.avg_deg_s })) },
                ]}
                width={520} height={260}
                yFormat={(v) => v.toFixed(3)}
                xFormat={(v) => String(v)}
              />}
        </Card>
        <Card title="Stint length distribution" sub="HISTOGRAM OF OBSERVED LAPS">
          <Histogram
            seriesA={{ label: a, color: `var(--${a.toLowerCase()})`,
                       values: data.a.stints.map((s) => s.stint_length) }}
            seriesB={{ label: b, color: `var(--${b.toLowerCase()})`,
                       values: data.b.stints.map((s) => s.stint_length) }}
          />
        </Card>
      </div>
    </main>
  );
}

function CompareSelector({ label, value, setValue, pkg }) {
  const color = `var(--${value.toLowerCase()})`;
  const latest = pkg.evolution[pkg.evolution.length - 1];
  const avgStint = pkg.stints.length
    ? pkg.stints.reduce((acc, s) => acc + s.stint_length, 0) / pkg.stints.length : 0;
  const avgDeg = pkg.stints.length
    ? pkg.stints.reduce((acc, s) => acc + s.deg_per_lap_s, 0) / pkg.stints.length : 0;

  return (
    <div className="card" style={{ borderTop: `3px solid ${color}` }}>
      <div style={{ padding: "16px 20px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)",
                                            letterSpacing: "0.1em" }}>COMPOUND {label}</span>
          <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
            {PHYSICAL.map((c) => (
              <span key={c} className={`chip${value === c ? " active" : ""}`}
                    onClick={() => setValue(c)}
                    style={{
                      background: value === c ? `var(--${c.toLowerCase()})` : undefined,
                      color: value === c ? "rgba(15,15,18,0.85)" : undefined,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}>
                {c}
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 14 }}>
          <Stat label={latest ? `${latest.year} DEG` : "LATEST DEG"}
                value={latest ? latest.avg_deg_s.toFixed(3) : "—"} unit="s/lap" />
          <Stat label="AVG STINT" value={avgStint.toFixed(1)} unit="laps" />
          <Stat label="OBSERVED"  value={pkg.stints.length}   unit="stints" />
        </div>
        <div style={{ marginTop: 12 }}>
          {pkg.evolution.length > 0 && (
            <Sparkline points={pkg.evolution.map((r) => ({ x: r.year, y: r.avg_deg_s }))}
                       color={color} width={420} height={50} area />
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, unit }) {
  return (
    <div>
      <div className="mono muted" style={{ fontSize: 10 }}>{label}</div>
      <div className="mono" style={{ fontSize: 22, color: "var(--fg)" }}>
        {value}
        <span className="muted" style={{ fontSize: 10, marginLeft: 4 }}>{unit}</span>
      </div>
    </div>
  );
}

// ─── Dimensões e cálculos ─────────────────────────────────────────────────────

function dims(pkg, name) {
  const ds = pkg.stints.map((s) => s.deg_per_lap_s);
  const ss = pkg.stints.map((s) => s.stint_length);
  const mean = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const stddev = (arr) => {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
  };

  return [
    { key: "low_deg",   label: "Low Deg",
      val: Math.max(0, Math.min(1, 1 - mean(ds) / 0.16)) },
    { key: "longevity", label: "Longevity",
      val: Math.max(0, Math.min(1, mean(ss) / 35)) },
    { key: "speed",     label: "Speed",
      val: SPEED_RANK[name] ?? 0.5 },
    { key: "versatil",  label: "Versatility",
      val: Math.max(0, Math.min(1, new Set(pkg.stints.map((s) => s.circuit_key)).size / 24)) },
    { key: "predict",   label: "Predictability",
      val: Math.max(0, Math.min(1, 1 - stddev(ds) / 0.05)) },
  ];
}

function RadarComparison({ aName, aPkg, bName, bPkg }) {
  const aDims = dims(aPkg, aName);
  const bDims = dims(bPkg, bName);
  const labels = aDims.map((d) => d.label);
  return (
    <RadarChart
      dims={labels}
      series={[
        { label: aName, color: `var(--${aName.toLowerCase()})`, values: aDims.map((d) => d.val) },
        { label: bName, color: `var(--${bName.toLowerCase()})`, values: bDims.map((d) => d.val) },
      ]}
    />
  );
}

function Verdict({ aName, aPkg, bName, bPkg }) {
  const aDims = dims(aPkg, aName);
  const bDims = dims(bPkg, bName);
  return (
    <>
      {aDims.map((d, i) => {
        const va = d.val, vb = bDims[i].val;
        const winner = va > vb ? aName : bName;
        const wColor = `var(--${winner.toLowerCase()})`;
        return (
          <div key={i} style={{
            display: "grid",
            gridTemplateColumns: "1fr 70px 28px",
            alignItems: "center", padding: "8px 0",
            borderBottom: "1px solid var(--border-soft)",
          }}>
            <span style={{ fontSize: 12.5 }}>{d.label}</span>
            <div style={{ flex: 1, height: 6, background: "var(--bg-2)",
                           borderRadius: 3, overflow: "hidden" }}>
              <div style={{
                width: `${Math.abs(va - vb) * 100}%`,
                height: "100%", background: wColor,
              }} />
            </div>
            <span className="mono" style={{ color: wColor, fontWeight: 600, textAlign: "right" }}>
              {winner}
            </span>
          </div>
        );
      })}
    </>
  );
}

function RadarChart({ dims, series, size = 340 }) {
  const cx = size / 2, cy = size / 2, R = size / 2 - 50;
  const angle = (i) => -Math.PI / 2 + (i / dims.length) * Math.PI * 2;
  const point = (i, r) => [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))];
  const rings = [0.25, 0.5, 0.75, 1];
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size }}>
      {rings.map((rg, i) => {
        const pts = dims.map((_, j) => point(j, rg * R).join(",")).join(" ");
        return <polygon key={i} points={pts} fill="none"
                        stroke="var(--border-soft)" strokeWidth="0.7" />;
      })}
      {dims.map((_, i) => {
        const [x, y] = point(i, R);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y}
                     stroke="var(--border-soft)" strokeWidth="0.7" />;
      })}
      {dims.map((d, i) => {
        const [x, y] = point(i, R + 20);
        return <text key={i} x={x} y={y + 3}
                     fontFamily="var(--font-mono)" fontSize="10"
                     textAnchor={Math.abs(x - cx) < 5 ? "middle" : x > cx ? "start" : "end"}
                     fill="var(--fg-3)">{d}</text>;
      })}
      {series.map((s, si) => {
        const pts = s.values.map((v, i) => point(i, v * R).join(",")).join(" ");
        return (
          <g key={si}>
            <polygon points={pts} fill={s.color} opacity="0.18"
                     stroke={s.color} strokeWidth="1.6" />
            {s.values.map((v, i) => {
              const [x, y] = point(i, v * R);
              return <circle key={i} cx={x} cy={y} r="3" fill={s.color} />;
            })}
          </g>
        );
      })}
      <g transform={`translate(${size / 2}, ${size - 12})`}>
        {series.map((s, i) => (
          <g key={i} transform={`translate(${(i - series.length / 2 + 0.5) * 80}, 0)`}>
            <circle cx={0} cy={-4} r="4" fill={s.color} />
            <text x={8} y={0} fontFamily="var(--font-mono)" fontSize="11"
                  fill="var(--fg-2)">{s.label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function Histogram({ seriesA, seriesB }) {
  const W = 520, H = 240, pad = { t: 12, r: 12, b: 32, l: 38 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const bins = 14;
  const allV = [...seriesA.values, ...seriesB.values];
  if (!allV.length) return null;
  const min = Math.min(...allV), max = Math.max(...allV);
  const step = (max - min) / bins || 1;
  const hist = (vs) => {
    const bs = Array(bins).fill(0);
    vs.forEach((v) => {
      const i = Math.min(bins - 1, Math.max(0, Math.floor((v - min) / step)));
      bs[i]++;
    });
    return bs;
  };
  const a = hist(seriesA.values), b = hist(seriesB.values);
  const maxC = Math.max(...a, ...b, 1);
  const bw = innerW / bins;
  const x = (i) => pad.l + i * bw;
  const y = (v) => pad.t + innerH - (v / maxC) * innerH;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%">
      <g className="axis">
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
          const lap = min + (max - min) * p;
          return <text key={i} x={x(p * bins)} y={pad.t + innerH + 16}
                       textAnchor="middle">L{Math.round(lap)}</text>;
        })}
      </g>
      {a.map((v, i) => (
        <rect key={"a" + i} x={x(i) + 1} y={y(v)}
              width={bw / 2 - 1} height={pad.t + innerH - y(v)}
              fill={seriesA.color} opacity="0.85" />
      ))}
      {b.map((v, i) => (
        <rect key={"b" + i} x={x(i) + bw / 2} y={y(v)}
              width={bw / 2 - 1} height={pad.t + innerH - y(v)}
              fill={seriesB.color} opacity="0.85" />
      ))}
      <g transform={`translate(${pad.l + innerW - 100}, ${pad.t + 4})`}>
        <rect x={0} y={0} width={10} height={10} fill={seriesA.color} />
        <text x={14} y={9} fontFamily="var(--font-mono)" fontSize="10" fill="var(--fg-2)">
          {seriesA.label}
        </text>
        <rect x={50} y={0} width={10} height={10} fill={seriesB.color} />
        <text x={64} y={9} fontFamily="var(--font-mono)" fontSize="10" fill="var(--fg-2)">
          {seriesB.label}
        </text>
      </g>
    </svg>
  );
}
