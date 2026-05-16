"use client";

/**
 * Overview — equivalente a dashboard/Home.py + design redesign.
 * Wire: /api/overview (compound_evolution + circuit_tyre_profile + KPIs).
 */
import React, { useEffect, useState } from "react";
import {
  PageHeader, KPI, Card, Segmented, CompoundChip, Legend, EmptyState,
} from "@/design/components/shell";
import {
  LineChart, Sparkline, HorizontalBars, COMPOUND_COLOR,
} from "@/design/lib/charts";

export default function PageOverview() {
  const [compounds, setCompounds] = useState(["SOFT", "MEDIUM", "HARD"]);
  const [yRange, setYRange] = useState([2018, 2026]);
  const [eraPreset, setEraPreset] = useState("modern");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const qs = new URLSearchParams({
      compounds: compounds.join(","),
      y0: String(yRange[0]),
      y1: String(yRange[1]),
    });
    setLoading(true);
    fetch(`/api/overview?${qs}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [compounds.join(","), yRange[0], yRange[1]]);

  const toggleCompound = (c) => {
    setCompounds((cur) =>
      cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]
    );
  };

  const setEra = (v) => {
    setEraPreset(v);
    if (v === "modern") setYRange([2018, 2026]);
    if (v === "recent") setYRange([2024, 2026]);
    if (v === "all")    setYRange([2018, 2026]);
  };

  if (loading || !data) {
    return (
      <main className="page">
        <PageHeader eyebrow="ANALYTICS · OVERVIEW" title="Loading…" />
      </main>
    );
  }

  const evo = data.evolution;
  const sparkData = (c) =>
    evo.filter((r) => r.compound === c).map((r) => ({ x: r.year, y: r.avg_deg_s }));

  const seriesDeg = compounds.map((c) => ({
    key: c, label: c, color: COMPOUND_COLOR[c],
    points: evo.filter((r) => r.compound === c).map((r) => ({ x: r.year, y: r.avg_deg_s })),
  }));

  return (
    <main className="page">
      <PageHeader
        eyebrow="ANALYTICS · OVERVIEW"
        title="Tyre intelligence — Pirelli era 2018–2026"
        desc="FastF1 lap timing → dbt marts. Filter the era, pick compounds, drill into any circuit or compound from anywhere on this page."
        right={
          <>
            <span className="btn">⤓ export</span>
            <span className="btn primary">refresh data</span>
          </>
        }
      />

      <div className="grid grid-4">
        <KPI label="Stints (mart rows)" value={fmtInt(data.kpi.total_stints_rows)}
             hint={`across ${data.kpi.years_covered} seasons`} />
        <KPI label="Circuits in marts" value={data.kpi.circuits}
             hint="modern calendar" />
        <KPI label={`Avg SOFT deg (${yRange[1]})`}
             value={`${fmtDeg(evo.find((r) => r.compound === "SOFT" && r.year === yRange[1])?.avg_deg_s)}s`}
             hint={`vs ${yRange[0]}: ${fmtDeg(evo.find((r) => r.compound === "SOFT" && r.year === yRange[0])?.avg_deg_s)}s`} />
        <KPI label="Compound categories" value={data.kpi.compounds_n}
             hint="SOFT/MEDIUM/HARD" />
      </div>

      <div className="mt-20" style={{ display: "flex", alignItems: "center",
                                       gap: 14, flexWrap: "wrap" }}>
        <span className="mono muted" style={{ fontSize: 11, letterSpacing: "0.08em" }}>FILTERS</span>
        <div style={{ display: "flex", gap: 6 }}>
          {["SOFT", "MEDIUM", "HARD"].map((c) => (
            <CompoundChip key={c} compound={c}
                          active={compounds.includes(c)}
                          onClick={() => toggleCompound(c)} />
          ))}
        </div>
        <Segmented
          options={[
            { value: "modern", label: "Modern (2018+)" },
            { value: "recent", label: "Last 3 yrs" },
            { value: "all",    label: "All era" },
          ]}
          value={eraPreset}
          onChange={setEra}
        />
        <span className="mono muted" style={{ marginLeft: "auto", fontSize: 11 }}>
          showing {evo.length} year-compound rows · {yRange[0]}–{yRange[1]}
        </span>
      </div>

      <div className="grid grid-12 mt-20 gap-lg">
        <div className="col-8">
          <Card title="Average degradation by compound category"
                sub="S/LAP · PER YEAR · GLOBAL MEAN"
                right={<Legend items={compounds.map((c) => ({
                  kind: "swatch", color: COMPOUND_COLOR[c], label: c }))} />}>
            {evo.length === 0 ? (
              <EmptyState title="No data" hint="Try a wider range or more compounds." />
            ) : (
              <LineChart series={seriesDeg} width={780} height={300}
                         yFormat={(v) => v.toFixed(3) + "s"}
                         xFormat={(v) => String(v)} />
            )}
            <div className="mono muted" style={{ fontSize: 10.5, marginTop: 6,
                                                  paddingTop: 8, borderTop: "1px solid var(--border-soft)" }}>
              ▲ SOFT/MEDIUM/HARD mudou de significado em 2019. Pra evolução
              honesta C3-vs-C3, use a página <strong style={{ color: "var(--hot)" }}>Pirelli Report Card</strong>.
            </div>
          </Card>

          <div className="grid grid-3 mt-20">
            {compounds.map((c) => {
              const latest = evo.find((r) => r.compound === c && r.year === yRange[1]);
              const earliest = evo.find((r) => r.compound === c && r.year === yRange[0]);
              const delta = latest && earliest ? latest.avg_deg_s - earliest.avg_deg_s : null;
              return (
                <Card key={c} flush>
                  <div style={{ padding: 14, borderBottom: "1px solid var(--border-soft)",
                                display: "flex", alignItems: "center", gap: 10 }}>
                    <span className={`legend-dot sw-${c}`} style={{ width: 10, height: 10 }} />
                    <span style={{ fontWeight: 600 }}>{c}</span>
                    <span className="mono muted" style={{ fontSize: 10, marginLeft: "auto" }}>
                      {yRange[0]}–{yRange[1]}
                    </span>
                  </div>
                  <div style={{ padding: 14 }}>
                    <div className="mono" style={{ fontSize: 22, color: "var(--fg)" }}>
                      {latest ? latest.avg_deg_s.toFixed(3) : "—"}
                      <span className="muted" style={{ fontSize: 10, marginLeft: 6 }}>
                        s/lap · {yRange[1]}
                      </span>
                    </div>
                    {delta != null && (
                      <div className="mono" style={{
                        fontSize: 10,
                        color: delta < 0 ? "var(--good)" : "var(--hot)",
                        marginTop: 2,
                      }}>
                        {delta < 0 ? "▼" : "▲"} {delta.toFixed(3)}s vs {yRange[0]}
                      </div>
                    )}
                    <div style={{ marginTop: 10 }}>
                      <Sparkline points={sparkData(c)} color={COMPOUND_COLOR[c]}
                                 width={240} height={48} area />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        <div className="col-4">
          <Card title="Compound usage share" sub="ALL CIRCUITS · MODERN ERA">
            <CompoundDonut share={data.usage} />
            <div style={{ display: "flex", flexDirection: "column",
                          gap: 6, marginTop: 14 }}>
              {data.usage.map((s) => (
                <div key={s.compound} style={{ display: "flex",
                                                alignItems: "center", gap: 10 }}>
                  <span className={`legend-dot sw-${s.compound}`}
                        style={{ width: 10, height: 10 }} />
                  <span style={{ fontSize: 12 }}>{s.compound}</span>
                  <span className="mono" style={{ marginLeft: "auto",
                                                   fontSize: 12, color: "var(--fg)" }}>
                    {Number(s.pct).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <div className="mt-20">
            <Card title="Top circuits · most aggressive on MEDIUM" sub="S/LAP">
              <div style={{ marginTop: -8 }}>
                <HorizontalBars
                  data={data.top_circuits.map((t) => ({
                    label: t.event_name.replace(" Grand Prix", ""),
                    value: t.avg_deg_s,
                    color: "var(--hot)",
                  }))}
                  width={320}
                  valueFormat={(v) => v.toFixed(3)}
                />
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}

function fmtInt(n) { return new Intl.NumberFormat("en-US").format(n); }
function fmtDeg(v) { return v != null ? Number(v).toFixed(3) : "—"; }

function CompoundDonut({ share }) {
  const total = share.reduce((a, s) => a + s.pct, 0);
  const r = 64, rIn = 42, cx = 100, cy = 78;
  let acc = 0;
  return (
    <svg viewBox="0 0 200 156" width="100%" preserveAspectRatio="xMidYMid meet">
      {share.map((s, i) => {
        const start = (acc / total) * Math.PI * 2 - Math.PI / 2;
        acc += s.pct;
        const end = (acc / total) * Math.PI * 2 - Math.PI / 2;
        const x0 = cx + r * Math.cos(start), y0 = cy + r * Math.sin(start);
        const x1 = cx + r * Math.cos(end),   y1 = cy + r * Math.sin(end);
        const xi0 = cx + rIn * Math.cos(start), yi0 = cy + rIn * Math.sin(start);
        const xi1 = cx + rIn * Math.cos(end),   yi1 = cy + rIn * Math.sin(end);
        const large = end - start > Math.PI ? 1 : 0;
        const d = `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} ` +
                  `L${xi1},${yi1} A${rIn},${rIn} 0 ${large} 0 ${xi0},${yi0} Z`;
        return <path key={i} d={d} fill={COMPOUND_COLOR[s.compound]} opacity="0.85" />;
      })}
      <text x={cx} y={cy - 2} textAnchor="middle" fontFamily="var(--font-mono)"
            fontSize="20" fill="var(--fg)">{share.length}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontFamily="var(--font-mono)"
            fontSize="9" fill="var(--fg-3)" letterSpacing="0.08em">COMPOUNDS</text>
    </svg>
  );
}
