"use client";

/**
 * Circuit Deep-Dive — equivalente a pages/1_📉_Degradacao_Circuito.py.
 * Wire: /api/circuit?circuit=<key>.
 */
import React, { useEffect, useState } from "react";
import {
  PageHeader, KPI, Card, CompoundChip, EmptyState,
} from "@/design/components/shell";
import {
  LineChart, BarChart, Scatter, COMPOUND_COLOR,
} from "@/design/lib/charts";

const DEFAULT_CIRCUIT = "British Grand Prix"; // mart usa event_name como circuit_key

export default function PageCircuit() {
  const [circuits, setCircuits] = useState([]);
  const [circuit, setCircuit] = useState("");
  const [compounds, setCompounds] = useState(["SOFT", "MEDIUM", "HARD"]);
  const [data, setData] = useState(null);

  // 1ª carga: pega lista de circuitos
  useEffect(() => {
    fetch("/api/circuit")
      .then((r) => r.json())
      .then((d) => {
        setCircuits(d.circuits || []);
        const def = d.circuits?.find((c) => c.circuit_key === DEFAULT_CIRCUIT)
          ?? d.circuits?.[0];
        if (def) setCircuit(def.circuit_key);
      });
  }, []);

  // Dados do circuito quando muda
  useEffect(() => {
    if (!circuit) return;
    const qs = new URLSearchParams({
      circuit,
      compounds: compounds.join(","),
    });
    fetch(`/api/circuit?${qs}`)
      .then((r) => r.json())
      .then(setData);
  }, [circuit, compounds.join(",")]);

  if (!data) {
    return (
      <main className="page">
        <PageHeader eyebrow="ANALYTICS · CIRCUIT" title="Loading…" />
      </main>
    );
  }

  const rows = data.rows || [];
  const stints = data.stints || [];

  const seriesDeg = compounds.map((c) => ({
    key: c, label: c, color: COMPOUND_COLOR[c],
    points: rows.filter((r) => r.compound === c)
                .map((r) => ({ x: r.year, y: Number(r.avg_deg_per_lap_s) })),
  }));

  const yoyYears = [...new Set(rows.map((r) => r.year))].sort();
  const yoyData = yoyYears.map((y) => ({
    label: String(y),
    groups: compounds.map((c) => {
      const r = rows.find((x) => x.year === y && x.compound === c);
      return { key: c, value: Number(r?.yoy_deg_delta) || 0, color: COMPOUND_COLOR[c] };
    }),
  }));

  const latest2026 = rows.find((r) => r.year === 2026 && r.compound === "SOFT");
  const latestStint = rows.find((r) => r.year === 2026 && r.compound === "MEDIUM");

  return (
    <main className="page">
      <PageHeader
        eyebrow="CIRCUIT · DEEP-DIVE"
        title={circuit || "—"}
        desc="Year-over-year compound performance at a single circuit. Useful for setup notes, strategy rehearsal, and spotting the years when Pirelli changed allocation."
        right={
          <>
            <select className="select" value={circuit}
                    onChange={(e) => setCircuit(e.target.value)}>
              {circuits.map((c) => (
                <option key={c.circuit_key} value={c.circuit_key}>
                  {c.event_name}
                </option>
              ))}
            </select>
            <span className="btn">⤓ csv</span>
          </>
        }
      />

      <div className="grid grid-4">
        <KPI label="Years in marts"
             value={String(new Set(rows.map((r) => r.year)).size)}
             hint="post-2018" />
        <KPI label="Best 2026 stint"
             value={`${latestStint?.avg_stint_length?.toFixed?.(0) ?? "—"} laps`}
             hint="MEDIUM · 2026" />
        <KPI label="2026 deg (SOFT)"
             value={`${latest2026?.avg_deg_per_lap_s?.toFixed?.(3) ?? "—"}s`}
             hint="from marts.tyre_degradation" />
        <KPI label="Stints observed"
             value={stints.length}
             hint="staging.stg_tyre_stints" />
      </div>

      <div className="mt-20" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span className="mono muted" style={{ fontSize: 11 }}>COMPOUNDS</span>
        {["SOFT", "MEDIUM", "HARD"].map((c) => (
          <CompoundChip key={c} compound={c}
                        active={compounds.includes(c)}
                        onClick={() =>
                          setCompounds(compounds.includes(c)
                            ? compounds.filter((x) => x !== c)
                            : [...compounds, c])} />
        ))}
      </div>

      <div className="grid grid-2 mt-20 gap-lg">
        <Card title="Degradation by year" sub="S/LAP">
          {rows.length === 0 ? <EmptyState title="No data for this combination" />
            : <LineChart series={seriesDeg} width={520} height={280}
                         yFormat={(v) => v.toFixed(3)}
                         xFormat={(v) => String(v)} />}
        </Card>
        <Card title="YoY delta · negative = improvement" sub="Δ S/LAP">
          {yoyData.length === 0 ? <EmptyState title="No YoY data" />
            : <BarChart data={yoyData} width={520} height={280}
                        yFormat={(v) => v.toFixed(3)} />}
        </Card>
      </div>

      <div className="grid grid-12 mt-20 gap-lg">
        <div className="col-7">
          <Card title="Stints · length × degradation"
                sub="EACH POINT = ONE STINT IN STAGING.STG_TYRE_STINTS">
            {stints.length === 0 ? <EmptyState title="No stints found" />
              : <Scatter
                  points={stints.map((s) => ({
                    x: Number(s.stint_length), y: Number(s.deg_per_lap_s),
                    color: COMPOUND_COLOR[s.compound],
                    r: 3.4,
                    label: `${s.year} · ${s.compound} ${s.compound_name || ""} · ${Number(s.stint_length).toFixed(1)} laps · ${Number(s.deg_per_lap_s).toFixed(3)}s`,
                  }))}
                  width={620} height={300}
                  xLabel="Stint length (laps)"
                  xFormat={(v) => Math.round(v) + ""}
                  yFormat={(v) => v.toFixed(3)} />}
          </Card>
        </div>
        <div className="col-5">
          <Card title="Per-year breakdown" sub="HOVER ROWS FOR DETAIL" flush>
            <table className="table">
              <thead>
                <tr>
                  <th>Year</th><th>Compound</th><th>Phys</th>
                  <th className="right">Deg/lap</th>
                  <th className="right">Stint</th>
                  <th className="right">Δ YoY</th>
                </tr>
              </thead>
              <tbody>
                {rows.sort((a, b) => b.year - a.year || a.compound.localeCompare(b.compound))
                     .map((r, i) => (
                  <tr key={i}>
                    <td className="mono">{r.year}</td>
                    <td>
                      <span className={`legend-dot sw-${r.compound}`}
                            style={{ width: 7, height: 7, display: "inline-block", marginRight: 6 }} />
                      {r.compound}
                    </td>
                    <td className="mono">{r.compound_name || "—"}</td>
                    <td className="mono right">{Number(r.avg_deg_per_lap_s).toFixed(3)}</td>
                    <td className="mono right">{Number(r.avg_stint_length).toFixed(1)}</td>
                    <td className={`mono right ${r.yoy_deg_delta < 0 ? "delta-down" : r.yoy_deg_delta > 0 ? "delta-up" : ""}`}>
                      {r.yoy_deg_delta != null ? Number(r.yoy_deg_delta).toFixed(3) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </main>
  );
}
