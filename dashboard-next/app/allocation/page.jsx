"use client";

/**
 * Allocation Calendar — visualiza staging.pirelli_compound_allocations.
 * Wire: /api/allocation?year=Y.
 * Enriquece com mini-mapa de cada circuito (CIRCUIT_META do bacinger data).
 */
import React, { useEffect, useState } from "react";
import {
  PageHeader, Card, Segmented, EmptyState,
} from "@/design/components/shell";
import { HorizontalBars } from "@/design/lib/charts";
import { CIRCUIT_META } from "@/design/lib/circuits";

const PHYSICAL = ["C1", "C2", "C3", "C4", "C5"];

// event_name → key do CIRCUIT_META (heurístico, baseado em bacinger keys).
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

export default function PageAllocation() {
  const [years, setYears] = useState([]);
  const [year, setYear] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/api/allocation").then((r) => r.json()).then((d) => {
      setYears(d.years || []);
      if (d.years?.length) setYear(d.years[d.years.length - 1]); // mais recente
    });
  }, []);

  useEffect(() => {
    if (!year) return;
    fetch(`/api/allocation?year=${year}`).then((r) => r.json()).then(setData);
  }, [year]);

  if (!data) {
    return (
      <main className="page">
        <PageHeader eyebrow="NEW · ALLOCATION CALENDAR" title="Loading…" />
      </main>
    );
  }

  const rounds = data.rounds || [];

  if (rounds.length === 0) {
    return (
      <main className="page">
        <PageHeader
          eyebrow="NEW · ALLOCATION CALENDAR"
          title={`Pirelli compound allocation · ${year}`}
        />
        <EmptyState
          title={`No allocations seeded for ${year}`}
          hint="Edite f1_transform/seeds/pirelli_compound_allocations.csv e rode `dbt seed`."
        />
      </main>
    );
  }

  return (
    <main className="page">
      <PageHeader
        eyebrow="NEW · ALLOCATION CALENDAR"
        title={`Pirelli compound allocation · ${year}`}
        desc="Sourced from staging.pirelli_compound_allocations (dbt seed). The map of which physical compounds (C1–C5) Pirelli brings to each round — context for the Report Card's honest mode."
        right={
          <Segmented options={years.map((y) => ({ value: y, label: String(y) }))}
                     value={year} onChange={setYear} />
        }
      />

      {/* KPI por compound físico — quantos rounds o trazem em qualquer slot */}
      <div className="grid grid-5 mt-12">
        {PHYSICAL.map((c) => {
          const count = rounds.filter(
            (r) => r.c_hard === c || r.c_medium === c || r.c_soft === c
          ).length;
          return (
            <div key={c} className="kpi"
                 style={{ borderTop: `2px solid var(--${c.toLowerCase()})` }}>
              <div className="kpi-label">{c} brought</div>
              <div className="kpi-value">{count}</div>
              <div className="kpi-foot">
                <span className="mono">of {rounds.length} rounds</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-20">
        <Card title="Calendar · round × compound slot"
              sub="HARD · MEDIUM · SOFT — THE THREE NOMINATED PHYSICAL COMPOUNDS PER ROUND">
          <AllocationGrid rounds={rounds} />
        </Card>
      </div>

      <div className="grid grid-12 mt-20 gap-lg">
        <div className="col-7">
          <Card title="Physical compound coverage"
                sub="HOW MANY ROUNDS EACH C1–C5 SHOWS UP IN ANY SLOT">
            <HorizontalBars
              data={PHYSICAL.map((c) => ({
                label: c,
                value: rounds.filter(
                  (r) => r.c_hard === c || r.c_medium === c || r.c_soft === c
                ).length,
                color: `var(--${c.toLowerCase()})`,
              }))}
              width={500}
              valueFormat={(v) => `${v} rounds`}
            />
          </Card>
        </div>
        <div className="col-5">
          <Card title="Step-vs-rough" sub="GAP BETWEEN HARD AND SOFT SLOTS">
            <div style={{ fontSize: 12, color: "var(--fg-3)", marginBottom: 10 }}>
              Pirelli às vezes traz uma alocação "step-skipping" (ex.: C2/C3/C5
              em vez de C2/C3/C4) pra alargar opções estratégicas.
            </div>
            <div style={{ maxHeight: 320, overflow: "auto" }}>
              <table className="table" style={{ marginTop: -8 }}>
                <thead>
                  <tr><th>Round</th><th>Allocation</th><th className="right">Gap</th></tr>
                </thead>
                <tbody>
                  {rounds.map((r) => {
                    const nums = [r.c_hard, r.c_medium, r.c_soft].map((c) => +c.slice(1));
                    const gap = nums[2] - nums[0];
                    const tag = gap === 2 ? "step" : gap > 2 ? "skip" : "tight";
                    return (
                      <tr key={r.round_number}>
                        <td>{r.round_number}. {r.event_name.replace(" Grand Prix", "")}</td>
                        <td>
                          {[r.c_hard, r.c_medium, r.c_soft].map((c, i) => (
                            <span key={i} className="mono"
                                  style={{
                                    color: `var(--${c.toLowerCase()})`,
                                    padding: "0 4px", fontWeight: 600,
                                  }}>
                              {c}
                            </span>
                          ))}
                        </td>
                        <td className={`mono right ${gap > 2 ? "delta-up" : ""}`}>
                          {tag}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}

function AllocationGrid({ rounds }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 8 }}>
      {rounds.map((r) => {
        const ckey = KEY_FROM_EVENT[r.event_name];
        const meta = ckey ? CIRCUIT_META[ckey] : null;
        return (
          <div key={r.round_number} style={{
            border: "1px solid var(--border-soft)",
            borderRadius: 6,
            padding: 10,
            background: "var(--bg)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span className="mono muted" style={{ fontSize: 10 }}>
                R{String(r.round_number).padStart(2, "0")}
              </span>
              {meta?.flag && (
                <span className="mono muted" style={{ fontSize: 9, textTransform: "uppercase" }}>
                  {meta.flag}
                </span>
              )}
            </div>
            {/* Mini-mapa do circuito */}
            {meta && (
              <svg viewBox="0 0 200 120" width="100%" height={56}
                   style={{ display: "block", marginBottom: 6 }}>
                <path d={meta.path} fill="none" stroke="var(--fg-3)" strokeWidth="1.4" />
                <circle cx={meta.start.x} cy={meta.start.y} r="2.5" fill="var(--hot)" />
              </svg>
            )}
            <div style={{ fontSize: 11.5, marginBottom: 8, lineHeight: 1.2,
                           height: 30, overflow: "hidden" }}>
              {r.event_name.replace(" Grand Prix", "")}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {[
                { slot: "HARD",   c: r.c_hard },
                { slot: "MEDIUM", c: r.c_medium },
                { slot: "SOFT",   c: r.c_soft },
              ].map(({ slot, c }) => (
                <div key={slot} style={{
                  flex: 1, height: 26, borderRadius: 4,
                  background: `var(--${c.toLowerCase()})`,
                  display: "grid", placeItems: "center",
                  color: "rgba(15,15,18,0.85)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11, fontWeight: 600,
                }}>{c}</div>
              ))}
            </div>
            <div className="mono muted" style={{
              fontSize: 9, marginTop: 6, display: "flex", justifyContent: "space-between",
            }}>
              <span>{r.mean_deg != null ? `deg ${r.mean_deg.toFixed(3)}` : "—"}</span>
              <span>{r.mean_temp_c != null ? `${Math.round(r.mean_temp_c)}°C` : ""}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
