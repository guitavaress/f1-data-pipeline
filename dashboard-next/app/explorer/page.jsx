"use client";

/**
 * SQL Explorer — equivalente a pages/5_🔬_Explorador.py.
 * Wire: POST /api/explorer (com guard read-only).
 */
import React, { useState } from "react";
import { PageHeader, Card, EmptyState } from "@/design/components/shell";

const PRESETS = [
  {
    name: "Top 10 circuit improvements 2025→2026",
    sql: `SELECT
  a.event_name,
  a.compound,
  a.avg_deg_per_lap_s AS deg_2026,
  b.avg_deg_per_lap_s AS deg_2025,
  (a.avg_deg_per_lap_s - b.avg_deg_per_lap_s) AS delta
FROM marts.tyre_degradation a
JOIN marts.tyre_degradation b
  USING (circuit_key, compound)
WHERE a.year = 2026 AND b.year = 2025
ORDER BY delta ASC
LIMIT 10`,
  },
  {
    name: "C3 longevity drift 2022→2026",
    sql: `SELECT year,
       round(avg(stint_length)::numeric, 1) AS avg_stint,
       max(stint_length)::int               AS max_stint,
       count(*)                             AS n
FROM staging.stg_tyre_stints
WHERE compound_name = 'C3'
  AND stint_length >= 3
GROUP BY year
ORDER BY year`,
  },
  {
    name: "Where MEDIUM dominates strategy",
    sql: `SELECT event_name, usage_pct, avg_stint_laps
FROM marts.circuit_tyre_profile
WHERE compound = 'MEDIUM'
  AND usage_pct > 40
ORDER BY usage_pct DESC`,
  },
];

const SCHEMA = [
  { name: "marts.tyre_degradation",            cols: 9, kind: "incremental" },
  { name: "marts.compound_evolution",          cols: 8, kind: "table" },
  { name: "marts.compound_physical_evolution", cols: 11, kind: "table" },
  { name: "marts.circuit_tyre_profile",        cols: 7, kind: "table" },
  { name: "marts.tyre_weather_profile",        cols: 6, kind: "table" },
  { name: "staging.stg_tyre_stints",           cols: 18, kind: "view" },
  { name: "staging.stg_laps",                  cols: 20, kind: "view" },
];

export default function PageExplorer() {
  const [idx, setIdx] = useState(0);
  const [sql, setSql] = useState(PRESETS[0].sql);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const r = await fetch("/api/explorer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql }),
      });
      const j = await r.json();
      if (j.error) { setError(j.error); setResult(null); }
      else setResult(j);
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  const pickPreset = (i) => {
    setIdx(i);
    setSql(PRESETS[i].sql);
    setResult(null);
    setError(null);
  };

  return (
    <main className="page">
      <PageHeader
        eyebrow="TOOLS · SQL EXPLORER"
        title="Read-only SQL against the marts schema"
        desc="Ad-hoc queries against marts.* and staging.*. Server-side guard: only SELECT (or WITH … SELECT), no semicolons, no DDL/DML. Hard cap of 1000 rows."
        right={
          <button className="btn primary" disabled={running} onClick={run}>
            {running ? "running…" : "▶ run · ⌘↵"}
          </button>
        }
      />

      <div className="grid grid-12 gap-lg">
        <div className="col-4">
          <Card title="Saved queries" sub={`${PRESETS.length} PRESETS`} flush>
            <div>
              {PRESETS.map((p, i) => (
                <div key={i}
                     onClick={() => pickPreset(i)}
                     style={{
                       padding: "12px 16px",
                       borderBottom: "1px solid var(--border-soft)",
                       cursor: "pointer",
                       background: i === idx ? "var(--bg-2)" : "transparent",
                       borderLeft: i === idx ? "3px solid var(--hot)" : "3px solid transparent",
                     }}>
                  <div style={{ fontSize: 12.5, color: "var(--fg)" }}>{p.name}</div>
                  <div className="mono muted" style={{ fontSize: 10, marginTop: 4 }}>
                    {p.sql.split("\n").length} lines
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="mt-20">
            <Card title="Schema · available tables">
              <div className="mono" style={{ fontSize: 11, color: "var(--fg-2)" }}>
                {SCHEMA.map((t) => (
                  <div key={t.name} style={{
                    display: "flex", justifyContent: "space-between",
                    padding: "5px 0", borderBottom: "1px solid var(--border-soft)",
                  }}>
                    <span>{t.name}</span>
                    <span className="muted" style={{ fontSize: 10 }}>
                      {t.cols} cols · {t.kind}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

        <div className="col-8">
          <Card title="query · editor"
                sub="POSTGRES 15 · F1"
                right={result && (
                  <span className="mono muted" style={{ fontSize: 10 }}>
                    ran in {result.elapsed_ms}ms · {result.total_rows} rows{result.truncated && " (capped)"}
                  </span>
                )}
                flush>
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  run();
                }
              }}
              spellCheck={false}
              style={{
                width: "100%",
                background: "var(--bg)",
                color: "var(--fg)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                padding: 14,
                border: "none",
                borderBottom: "1px solid var(--border-soft)",
                outline: "none",
                resize: "vertical",
                minHeight: 220,
                lineHeight: 1.55,
              }}
            />
            {error && (
              <div style={{
                padding: "12px 16px",
                background: "color-mix(in oklch, var(--hot) 12%, var(--bg))",
                borderTop: "1px solid var(--hot)",
                color: "var(--hot)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
              }}>
                ✗ {error}
              </div>
            )}
            {result && result.rows.length > 0 && (
              <div style={{ maxHeight: 480, overflow: "auto" }}>
                <table className="table">
                  <thead>
                    <tr>{result.columns.map((c) => <th key={c}>{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r, i) => (
                      <tr key={i}>
                        {result.columns.map((c) => {
                          const v = r[c];
                          const isNum = typeof v === "number" || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v));
                          return (
                            <td key={c} className={isNum ? "mono right" : ""}>
                              {v == null ? "—" :
                                isNum ? (Number(v).toString().includes(".") ? Number(v).toFixed(3) : v) :
                                String(v)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {result && result.rows.length === 0 && (
              <EmptyState title="0 rows returned" />
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}
