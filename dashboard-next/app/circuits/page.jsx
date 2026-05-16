"use client";

/**
 * Circuit Profiles — equivalente a pages/3_🗺️_Perfil_Circuitos.py.
 * Wire: /api/circuits.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  PageHeader, Card, CompoundChip, Legend, EmptyState,
} from "@/design/components/shell";
import { Heatmap, HorizontalBars, COMPOUND_COLOR } from "@/design/lib/charts";

const TIER_COLORS = {
  "alta degradação":  "var(--hot)",
  "média degradação": "var(--amber)",
  "baixa degradação": "var(--good)",
};
const TIER_LABELS = {
  "alta degradação":  "HIGH",
  "média degradação": "MED",
  "baixa degradação": "LOW",
};

export default function PageCircuits() {
  const [topN, setTopN] = useState(15);
  const [compounds, setCompounds] = useState(["SOFT", "MEDIUM", "HARD"]);
  const [data, setData] = useState(null);

  useEffect(() => {
    const qs = new URLSearchParams({ compounds: compounds.join(",") });
    fetch(`/api/circuits?${qs}`).then((r) => r.json()).then(setData);
  }, [compounds.join(",")]);

  const rows = data?.rows || [];

  // Top-N por mean deg
  const ranked = useMemo(() => {
    const byCircuit = {};
    rows.forEach((r) => {
      (byCircuit[r.event_name] ??= []).push(Number(r.avg_deg_s));
    });
    return Object.entries(byCircuit)
      .map(([name, vs]) => ({ name, mean: vs.reduce((a, b) => a + b, 0) / vs.length }))
      .sort((a, b) => b.mean - a.mean)
      .slice(0, topN);
  }, [rows, topN]);

  const heatRows = ranked.map((rk) => ({
    label: rk.name.replace(" Grand Prix", ""),
    values: compounds.map((c) => ({
      col: c,
      value: rows.find((r) => r.event_name === rk.name && r.compound === c)?.avg_deg_s,
    })),
  }));

  const tiers = ["alta degradação", "média degradação", "baixa degradação"];
  const tierCounts = tiers.map((t) => ({
    tier: t,
    count: rows.filter((r) => r.degradation_tier === t).length,
  }));
  const totalTier = tierCounts.reduce((a, x) => a + x.count, 0);

  const dominant = useMemo(() => {
    const byEvt = {};
    for (const r of rows) {
      const cur = byEvt[r.event_name];
      if (!cur || r.usage_pct > cur.usage_pct) byEvt[r.event_name] = r;
    }
    return Object.values(byEvt)
      .sort((a, b) => b.usage_pct - a.usage_pct)
      .slice(0, topN);
  }, [rows, topN]);

  return (
    <main className="page">
      <PageHeader
        eyebrow="ANALYTICS · CIRCUIT PROFILES"
        title="Where do tyres die · where do they survive"
        desc="Aggregation across all years in marts.circuit_tyre_profile. Sorted by mean degradation. Use this to set baseline expectations before a race weekend."
        right={
          <select className="select" value={topN}
                  onChange={(e) => setTopN(+e.target.value)}>
            {[10, 15, 20, 24].map((n) => (
              <option key={n} value={n}>Top {n}</option>
            ))}
          </select>
        }
      />

      <div className="mt-12" style={{ display: "flex", alignItems: "center",
                                       gap: 10, flexWrap: "wrap" }}>
        <span className="mono muted" style={{ fontSize: 11 }}>COMPOUNDS</span>
        {["SOFT", "MEDIUM", "HARD"].map((c) => (
          <CompoundChip key={c} compound={c}
                        active={compounds.includes(c)}
                        onClick={() =>
                          setCompounds(compounds.includes(c)
                            ? compounds.filter((x) => x !== c)
                            : [...compounds, c])} />
        ))}
        <span style={{ marginLeft: "auto" }}>
          <Legend items={[
            { kind: "swatch", color: "oklch(0.65 0.16 145)", label: "low deg" },
            { kind: "swatch", color: "oklch(0.78 0.13 80)",  label: "mid deg" },
            { kind: "swatch", color: "oklch(0.68 0.18 32)",  label: "high deg" },
          ]} />
        </span>
      </div>

      <div className="mt-20">
        <Card title={`Heatmap · top ${topN} most-aggressive circuits`}
              sub="ROWS ORDERED BY MEAN DEGRADATION ACROSS COMPOUNDS">
          {!data ? <div className="muted">Loading…</div>
            : heatRows.length === 0 ? <EmptyState title="No data" />
            : <Heatmap rows={heatRows} cols={compounds}
                       cellH={26} width={820}
                       valueFormat={(v) => v != null ? Number(v).toFixed(3) : ""} />}
        </Card>
      </div>

      <div className="grid grid-12 mt-20 gap-lg">
        <div className="col-7">
          <Card title="Top 5 per compound · honest ranking"
                sub="DON'T MIX SOFT URBAN WITH HARD AT SUZUKA">
            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(${compounds.length}, 1fr)`,
              gap: 14,
            }}>
              {compounds.map((c) => {
                const sub = rows.filter((r) => r.compound === c)
                                .sort((a, b) => b.avg_deg_s - a.avg_deg_s)
                                .slice(0, 5);
                return (
                  <div key={c}>
                    <div className="mono" style={{
                      fontSize: 11, color: COMPOUND_COLOR[c],
                      fontWeight: 600, letterSpacing: "0.08em",
                      marginBottom: 8,
                    }}>{c}</div>
                    {sub.length === 0 ? <div className="muted" style={{ fontSize: 11 }}>—</div>
                      : <HorizontalBars
                          data={sub.map((r) => ({
                            label: r.event_name.replace(" Grand Prix", ""),
                            value: Number(r.avg_deg_s),
                            color: COMPOUND_COLOR[c],
                          }))}
                          width={280}
                          valueFormat={(v) => v.toFixed(3)} />}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="col-5">
          <Card title="Tier distribution" sub="CIRCUIT × COMPOUND PAIRS">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {tierCounts.map((t) => {
                const pct = totalTier ? (t.count / totalTier) * 100 : 0;
                return (
                  <div key={t.tier}>
                    <div style={{
                      display: "flex", justifyContent: "space-between",
                      fontSize: 12, marginBottom: 4,
                    }}>
                      <span>
                        <span className="legend-dot" style={{
                          background: TIER_COLORS[t.tier],
                          display: "inline-block", marginRight: 6,
                        }} />
                        {TIER_LABELS[t.tier]} DEG
                      </span>
                      <span className="mono">{t.count} pairs · {pct.toFixed(0)}%</span>
                    </div>
                    <div style={{ height: 8, background: "var(--bg-2)", borderRadius: 4 }}>
                      <div style={{
                        width: `${pct}%`, height: "100%",
                        background: TIER_COLORS[t.tier], borderRadius: 4,
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="divider" />

            <div className="mono muted" style={{
              fontSize: 10, letterSpacing: "0.08em", marginBottom: 10,
            }}>DOMINANT COMPOUND · TOP {topN}</div>
            <div style={{ maxHeight: 340, overflow: "auto" }}>
              <table className="table" style={{ marginTop: -4 }}>
                <thead>
                  <tr>
                    <th>GP</th><th>Dominant</th>
                    <th className="right">%</th>
                    <th className="right">Stint</th>
                  </tr>
                </thead>
                <tbody>
                  {dominant.map((r, i) => (
                    <tr key={i}>
                      <td>{r.event_name.replace(" Grand Prix", "")}</td>
                      <td>
                        <span className={`legend-dot sw-${r.compound}`}
                              style={{
                                width: 7, height: 7, display: "inline-block",
                                marginRight: 6,
                              }} />
                        {r.compound}
                      </td>
                      <td className="mono right">{Number(r.usage_pct).toFixed(0)}%</td>
                      <td className="mono right">{Number(r.avg_stint_laps).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
