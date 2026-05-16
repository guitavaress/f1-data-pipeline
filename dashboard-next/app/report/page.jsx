"use client";

/**
 * Pirelli Report Card — equivalente a pages/2_📈_Pirelli_Report_Card.py.
 * Wire: /api/report?honest=0|1&y0=&y1=.
 */
import React, { useEffect, useState } from "react";
import {
  PageHeader, Card, Segmented, EmptyState,
} from "@/design/components/shell";
import { LineChart, Sparkline } from "@/design/lib/charts";

const PHYSICAL = ["C1", "C2", "C3", "C4", "C5"];

export default function PageReportCard() {
  const [honest, setHonest] = useState(true);
  const [yRange, setYRange] = useState(null); // setado quando bounds chegam
  const [data, setData] = useState(null);

  useEffect(() => {
    const qs = new URLSearchParams({ honest: honest ? "1" : "0" });
    if (yRange) {
      qs.set("y0", String(yRange[0]));
      qs.set("y1", String(yRange[1]));
    }
    fetch(`/api/report?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        if (!yRange && d.bounds) setYRange([d.bounds.y_min, d.bounds.y_max]);
      });
  }, [honest, yRange?.[0], yRange?.[1]]);

  if (!data || !yRange) {
    return (
      <main className="page">
        <PageHeader eyebrow="ANALYTICS · PIRELLI REPORT CARD" title="Loading…" />
      </main>
    );
  }

  const rows = data.rows || [];
  if (!rows.length) {
    return (
      <main className="page">
        <PageHeader
          eyebrow="ANALYTICS · PIRELLI REPORT CARD"
          title="Compound evolution · C1 → C5"
        />
        <EmptyState
          title="No C1–C5 data in the selected range"
          hint="Either no seed coverage in those years, or honest mode is too strict — try toggling it off."
        />
      </main>
    );
  }

  const latestYear = Math.max(...rows.map((r) => r.year));

  return (
    <main className="page">
      <PageHeader
        eyebrow="ANALYTICS · PIRELLI REPORT CARD"
        title="Compound evolution · C1 → C5"
        desc="The methodologically-honest year-over-year view: C3 vs C3, not SOFT vs SOFT (whose meaning shifts when the allocation moves). 'Honest mode' restricts to circuits present in ≥80% of the range so calendar churn doesn't fake a trend."
        right={
          <Segmented
            options={[
              { value: 1, label: "Honest mode · ON" },
              { value: 0, label: "All circuits" },
            ]}
            value={honest ? 1 : 0}
            onChange={(v) => setHonest(!!v)}
          />
        }
      />

      {honest ? (
        <div className="card" style={{
          padding: "12px 16px", marginBottom: 18,
          borderLeft: "3px solid var(--cool)",
          display: "flex", gap: 12, alignItems: "center",
        }}>
          <span className="mono" style={{ color: "var(--cool)", fontSize: 11,
                                           letterSpacing: "0.08em" }}>HONEST</span>
          <span style={{ fontSize: 13 }}>
            Only circuits present in ≥80% of {yRange[0]}–{yRange[1]} ({data.min_years_required}+ years).
            Filters out calendar shifts.
          </span>
        </div>
      ) : (
        <div className="card" style={{
          padding: "12px 16px", marginBottom: 18,
          borderLeft: "3px solid var(--amber)",
          display: "flex", gap: 12, alignItems: "center",
        }}>
          <span className="mono" style={{ color: "var(--amber)", fontSize: 11,
                                           letterSpacing: "0.08em" }}>⚠ ALL CIRCUITS</span>
          <span style={{ fontSize: 13 }}>
            YoY may reflect calendar changes, not product evolution.
          </span>
        </div>
      )}

      <div className="grid grid-5">
        {PHYSICAL.map((c) => {
          const sub = rows.filter((r) => r.compound_name === c)
                          .sort((a, b) => a.year - b.year);
          const latest = sub.find((r) => r.year === latestYear);
          if (!latest) {
            return (
              <div key={c} className="card" style={{ overflow: "hidden" }}>
                <div style={{ height: 3, background: `var(--${c.toLowerCase()})` }} />
                <div style={{ padding: 14 }}>
                  <div className="mono" style={{ fontSize: 14, fontWeight: 600,
                                                   color: `var(--${c.toLowerCase()})` }}>{c}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>No data</div>
                </div>
              </div>
            );
          }
          return (
            <div key={c} className="card" style={{ overflow: "hidden" }}>
              <div style={{ height: 3, background: `var(--${c.toLowerCase()})` }} />
              <div style={{ padding: 14 }}>
                <div className="mono" style={{ fontSize: 14, fontWeight: 600,
                                                 color: `var(--${c.toLowerCase()})` }}>
                  {c}
                  <span className="muted" style={{ fontSize: 10, marginLeft: 6 }}>
                    {c === "C1" ? "hardest" : c === "C5" ? "softest" : ""}
                  </span>
                </div>
                <div className="mono muted" style={{ fontSize: 10, marginTop: 8,
                                                      letterSpacing: "0.08em" }}>
                  DEG {latestYear} · S/LAP
                </div>
                <div className="mono" style={{ fontSize: 22, color: "var(--fg)",
                                                 fontWeight: 500, lineHeight: 1.1 }}>
                  {Number(latest.avg_deg_s).toFixed(3)}
                </div>
                {latest.yoy_deg_improvement != null && (
                  <div style={{
                    marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 11,
                    color: latest.yoy_deg_improvement < 0 ? "var(--good)" : "var(--hot)",
                  }}>
                    {latest.yoy_deg_improvement < 0 ? "▼" : "▲"} {Number(latest.yoy_deg_improvement).toFixed(3)}s
                  </div>
                )}
                <div style={{ marginTop: 10 }}>
                  <Sparkline points={sub.map((r) => ({ x: r.year, y: r.avg_deg_s }))}
                             color={`var(--${c.toLowerCase()})`} width={170} height={36} area />
                </div>
                <div className="mono muted" style={{ marginTop: 6, fontSize: 10,
                                                       textAlign: "center" }}>
                  {Number(latest.avg_stint_laps).toFixed(0)} lap stints · {sub.reduce((a, r) => a + (r.races_used || 0), 0)} races
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-12 mt-20 gap-lg">
        <div className="col-8">
          <Card title="Historical degradation · all physical compounds"
                sub="S/LAP · BY YEAR">
            <LineChart
              series={PHYSICAL.map((c) => ({
                key: c, label: c, color: `var(--${c.toLowerCase()})`,
                points: rows.filter((r) => r.compound_name === c)
                            .sort((a, b) => a.year - b.year)
                            .map((r) => ({ x: r.year, y: r.avg_deg_s })),
              }))}
              width={760} height={320}
              yFormat={(v) => v.toFixed(3)}
              xFormat={(v) => String(v)}
            />
          </Card>
        </div>

        <div className="col-4">
          <Card title="Stint longevity drift" sub="LAPS · LATEST YRS">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {PHYSICAL.map((c) => {
                const recent = rows.filter((r) => r.compound_name === c)
                                   .sort((a, b) => a.year - b.year)
                                   .slice(-3);
                if (!recent.length) return null;
                return (
                  <div key={c} style={{ display: "grid",
                                         gridTemplateColumns: "32px 1fr 60px",
                                         alignItems: "center", gap: 10 }}>
                    <span className="mono" style={{ color: `var(--${c.toLowerCase()})`,
                                                     fontWeight: 600 }}>{c}</span>
                    <Sparkline points={recent.map((r) => ({ x: r.year, y: r.avg_stint_laps }))}
                               color={`var(--${c.toLowerCase()})`} width={140} height={28} />
                    <span className="mono right" style={{ fontSize: 12, color: "var(--fg)" }}>
                      {Number(recent[recent.length - 1].avg_stint_laps).toFixed(1)}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-20">
        <Card title="Detailed YoY table" sub="ALL PHYSICAL COMPOUNDS" flush>
          <table className="table">
            <thead>
              <tr>
                <th>Year</th><th>Compound</th>
                <th className="right">Deg (s/lap)</th>
                <th className="right">Δ Deg YoY</th>
                <th className="right">Avg stint</th>
                <th className="right">Max stint</th>
                <th className="right">Races used</th>
              </tr>
            </thead>
            <tbody>
              {rows.sort((a, b) => b.year - a.year || a.compound_name.localeCompare(b.compound_name)).map((r, i) => (
                <tr key={i}>
                  <td className="mono">{r.year}</td>
                  <td>
                    <span style={{
                      display: "inline-block", width: 8, height: 8,
                      borderRadius: 2,
                      background: `var(--${r.compound_name.toLowerCase()})`,
                      marginRight: 6,
                    }} />
                    {r.compound_name}
                  </td>
                  <td className="mono right">{Number(r.avg_deg_s).toFixed(4)}</td>
                  <td className={`mono right ${(r.yoy_deg_improvement ?? 0) < 0 ? "delta-down" : (r.yoy_deg_improvement ?? 0) > 0 ? "delta-up" : ""}`}>
                    {r.yoy_deg_improvement != null ? Number(r.yoy_deg_improvement).toFixed(4) : "—"}
                  </td>
                  <td className="mono right">{Number(r.avg_stint_laps).toFixed(1)}</td>
                  <td className="mono right">{Number(r.max_stint_laps).toFixed(0)}</td>
                  <td className="mono right">{r.races_used}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </main>
  );
}
