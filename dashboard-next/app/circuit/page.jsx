"use client";

/**
 * Circuit Deep-Dive — equivalente a pages/1_📉_Degradacao_Circuito.py.
 * Wire: /api/circuit?circuit=<key>&compounds=…&y0=&y1=.
 *
 * Mudanças vs primeira versão:
 * - KPIs derivados do ÚLTIMO ANO DISPONÍVEL no circuito (não 2026 fixo)
 * - Slider de range de anos restrito aos anos que o GP tem no mart
 * - Bounds vêm do server quando o circuito muda
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  PageHeader, KPI, Card, CompoundChip, EmptyState,
} from "@/design/components/shell";
import {
  LineChart, BarChart, Scatter, COMPOUND_COLOR,
} from "@/design/lib/charts";
import { CIRCUIT_META } from "@/design/lib/circuits";

const DEFAULT_CIRCUIT = "British Grand Prix";

// event_name → key do CIRCUIT_META (mesmo dicionário do /allocation).
const KEY_FROM_EVENT = {
  "Bahrain Grand Prix":         "bahrain",
  "Saudi Arabian Grand Prix":   "saudi_arabia",
  "Australian Grand Prix":      "australia",
  "Japanese Grand Prix":        "japan",
  "Chinese Grand Prix":         "china",
  "Miami Grand Prix":           "miami",
  "Emilia Romagna Grand Prix":  "emilia_romagna",
  "Monaco Grand Prix":          "monaco",
  "Canadian Grand Prix":        "canada",
  "Spanish Grand Prix":         "spain",
  "Austrian Grand Prix":        "austria",
  "British Grand Prix":         "britain",
  "Hungarian Grand Prix":       "hungary",
  "Belgian Grand Prix":         "belgium",
  "Dutch Grand Prix":           "netherlands",
  "Italian Grand Prix":         "italy",
  "Azerbaijan Grand Prix":      "azerbaijan",
  "Singapore Grand Prix":       "singapore",
  "United States Grand Prix":   "united_states",
  "Mexico City Grand Prix":     "mexico",
  "São Paulo Grand Prix":       "brazil",
  "Las Vegas Grand Prix":       "las_vegas",
  "Qatar Grand Prix":           "qatar",
  "Abu Dhabi Grand Prix":       "abu_dhabi",
  "French Grand Prix":          "france",
};

export default function PageCircuit() {
  const [circuits, setCircuits] = useState([]);
  const [circuit, setCircuit] = useState("");
  const [compounds, setCompounds] = useState(["SOFT", "MEDIUM", "HARD"]);
  const [yRange, setYRange] = useState(null);
  const [bounds, setBounds] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  // 1ª carga: lista de circuitos
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

  // Quando troca de circuito, descarta range antigo (vai ser repreenchido do server)
  useEffect(() => {
    if (!circuit) return;
    setYRange(null);
    setBounds(null);
  }, [circuit]);

  // Carga dos dados (passa range só quando já está definido)
  useEffect(() => {
    if (!circuit) return;
    const qs = new URLSearchParams({
      circuit, compounds: compounds.join(","),
    });
    if (yRange) {
      qs.set("y0", String(yRange[0]));
      qs.set("y1", String(yRange[1]));
    }
    setLoading(true);
    fetch(`/api/circuit?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        if (d.bounds && !bounds) {
          setBounds(d.bounds);
          if (!yRange) setYRange([d.bounds.y_min, d.bounds.y_max]);
        }
      })
      .finally(() => setLoading(false));
  }, [circuit, compounds.join(","), yRange?.[0], yRange?.[1]]);

  const rows = data?.rows || [];
  const stints = data?.stints || [];

  // ÚLTIMO ANO COM DADOS no circuito (não hardcoded 2026)
  const latestYear = useMemo(() => {
    if (!rows.length) return null;
    return Math.max(...rows.map((r) => r.year));
  }, [rows]);

  const latestSoft   = rows.find((r) => r.year === latestYear && r.compound === "SOFT");
  const latestMedium = rows.find((r) => r.year === latestYear && r.compound === "MEDIUM");
  const latestHard   = rows.find((r) => r.year === latestYear && r.compound === "HARD");

  const seriesDeg = compounds.map((c) => ({
    key: c, label: c, color: COMPOUND_COLOR[c],
    points: rows.filter((r) => r.compound === c)
                .map((r) => ({ x: r.year, y: r.avg_deg_per_lap_s })),
  }));

  const yoyYears = [...new Set(rows.map((r) => r.year))].sort();
  const yoyData = yoyYears.map((y) => ({
    label: String(y),
    groups: compounds.map((c) => {
      const r = rows.find((x) => x.year === y && x.compound === c);
      return { key: c, value: r?.yoy_deg_delta ?? 0, color: COMPOUND_COLOR[c] };
    }),
  }));

  return (
    <main className="page">
      <PageHeader
        eyebrow="CIRCUIT · DEEP-DIVE"
        title={circuit || "Loading…"}
        desc="Year-over-year compound performance no circuito. KPIs ancorados no último ano com dados — não fixado em 2026."
        right={
          <>
            <select className="select" value={circuit}
                    onChange={(e) => setCircuit(e.target.value)}>
              {circuits.map((c) => (
                <option key={c.circuit_key} value={c.circuit_key}>
                  {c.event_name} ({c.years}y)
                </option>
              ))}
            </select>
            <span className="btn">⤓ csv</span>
          </>
        }
      />

      {/* Briefing strip com mini-mapa do circuito */}
      {(() => {
        const ckey = KEY_FROM_EVENT[circuit];
        const meta = ckey ? CIRCUIT_META[ckey] : null;
        if (!meta) return null;
        return (
          <div className="card" style={{ marginBottom: 18 }}>
            <div style={{
              display: "grid", gridTemplateColumns: "180px 1fr auto",
              alignItems: "center", gap: 24, padding: "14px 20px",
            }}>
              <svg viewBox="0 0 200 120" width="100%"
                   style={{ display: "block", maxHeight: 100 }}>
                <path d={meta.path} fill="none" stroke="var(--fg-2)" strokeWidth="1.6" />
                <circle cx={meta.start.x} cy={meta.start.y} r="3" fill="var(--hot)" />
              </svg>
              <div>
                <div className="page-eyebrow" style={{ marginBottom: 2 }}>
                  TRACK · {meta.flag?.toUpperCase()}
                </div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{meta.name}</div>
                <div className="mono muted" style={{ fontSize: 11, marginTop: 4 }}>
                  {meta.length_m.toLocaleString()} m · {meta.points} polyline points · normalized 200×120
                </div>
              </div>
              <div className="mono muted" style={{ fontSize: 10, textAlign: "right" }}>
                outline data ©<br/>bacinger/f1-circuits (MIT)
              </div>
            </div>
          </div>
        );
      })()}

      <div className="grid grid-4">
        <KPI label={`Latest year`}
             value={latestYear ? String(latestYear) : "—"}
             hint={bounds ? `range ${bounds.y_min}–${bounds.y_max}` : ""} />
        <KPI label={`SOFT deg ${latestYear ?? ""}`}
             value={latestSoft ? `${latestSoft.avg_deg_per_lap_s.toFixed(3)}s` : "—"}
             hint={latestSoft?.compound_name ? `physical ${latestSoft.compound_name}` : "phys n/a"} />
        <KPI label={`MEDIUM stint ${latestYear ?? ""}`}
             value={latestMedium ? `${latestMedium.avg_stint_length.toFixed(0)} laps` : "—"}
             hint={latestMedium?.compound_name ? `physical ${latestMedium.compound_name}` : "phys n/a"} />
        <KPI label="Stints observed"
             value={stints.length}
             hint="staging.stg_tyre_stints · current range" />
      </div>

      {/* Filtros */}
      <div className="mt-20" style={{ display: "flex", gap: 14, alignItems: "center",
                                       flexWrap: "wrap" }}>
        <span className="mono muted" style={{ fontSize: 11 }}>COMPOUNDS</span>
        {["SOFT", "MEDIUM", "HARD"].map((c) => (
          <CompoundChip key={c} compound={c}
                        active={compounds.includes(c)}
                        onClick={() =>
                          setCompounds(compounds.includes(c)
                            ? compounds.filter((x) => x !== c)
                            : [...compounds, c])} />
        ))}

        {bounds && yRange && bounds.y_min !== bounds.y_max && (
          <div style={{ display: "flex", alignItems: "center", gap: 10,
                         marginLeft: 16, flex: "1 1 280px", maxWidth: 420 }}>
            <span className="mono muted" style={{ fontSize: 11 }}>YEARS</span>
            <input className="range" type="range"
                   min={bounds.y_min} max={bounds.y_max} step={1}
                   value={yRange[0]}
                   onChange={(e) => setYRange([+e.target.value, Math.max(+e.target.value, yRange[1])])} />
            <span className="mono" style={{ fontSize: 11, minWidth: 36, textAlign: "center" }}>
              {yRange[0]}
            </span>
            <span className="mono muted">→</span>
            <input className="range" type="range"
                   min={bounds.y_min} max={bounds.y_max} step={1}
                   value={yRange[1]}
                   onChange={(e) => setYRange([Math.min(+e.target.value, yRange[0]), +e.target.value])} />
            <span className="mono" style={{ fontSize: 11, minWidth: 36, textAlign: "center" }}>
              {yRange[1]}
            </span>
          </div>
        )}

        <span className="mono muted" style={{ marginLeft: "auto", fontSize: 11 }}>
          {loading ? "loading…" : `${rows.length} rows · ${stints.length} stints`}
        </span>
      </div>

      <div className="grid grid-2 mt-20 gap-lg">
        <Card title="Degradation by year" sub="S/LAP">
          {rows.length === 0
            ? <EmptyState title="No data for this combination"
                          hint="Try widening the year range or add more compounds." />
            : <LineChart series={seriesDeg} width={520} height={280}
                         yFormat={(v) => v.toFixed(3)}
                         xFormat={(v) => String(v)} />}
        </Card>
        <Card title="YoY delta · negative = improvement" sub="Δ S/LAP">
          {yoyData.length === 0
            ? <EmptyState title="No YoY data"
                          hint="Need at least 2 consecutive years to compute YoY." />
            : <BarChart data={yoyData} width={520} height={280}
                        yFormat={(v) => v.toFixed(3)} />}
        </Card>
      </div>

      <div className="grid grid-12 mt-20 gap-lg">
        <div className="col-7">
          <Card title="Stints · length × degradation"
                sub="EACH POINT = ONE STINT IN STAGING.STG_TYRE_STINTS">
            {stints.length === 0
              ? <EmptyState title="No stints in range"
                            hint="Stints aparecem só com stint_length >= 5." />
              : <Scatter
                  points={stints.map((s) => ({
                    x: s.stint_length, y: s.deg_per_lap_s,
                    color: COMPOUND_COLOR[s.compound],
                    r: 3.4,
                    label: `${s.year} · ${s.compound} ${s.compound_name || ""} · ${s.stint_length.toFixed(1)} laps · ${s.deg_per_lap_s.toFixed(3)}s`,
                  }))}
                  width={620} height={300}
                  xLabel="Stint length (laps)"
                  xFormat={(v) => Math.round(v) + ""}
                  yFormat={(v) => v.toFixed(3)} />}
          </Card>
        </div>
        <div className="col-5">
          <Card title="Per-year breakdown" sub="LATEST FIRST" flush>
            {rows.length === 0
              ? <div style={{ padding: 24 }}>
                  <EmptyState title="No rows" />
                </div>
              : <div style={{ maxHeight: 340, overflow: "auto" }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Year</th><th>Cmpd</th><th>Phys</th>
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
                          <td className="mono right">{r.avg_deg_per_lap_s.toFixed(3)}</td>
                          <td className="mono right">{r.avg_stint_length.toFixed(1)}</td>
                          <td className={`mono right ${r.yoy_deg_delta < 0 ? "delta-down" : r.yoy_deg_delta > 0 ? "delta-up" : ""}`}>
                            {r.yoy_deg_delta != null ? r.yoy_deg_delta.toFixed(3) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>}
          </Card>
        </div>
      </div>
    </main>
  );
}
