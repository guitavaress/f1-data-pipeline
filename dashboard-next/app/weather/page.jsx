"use client";

/**
 * Weather Impact — equivalente a pages/4_🌡️_Weather_Impact.py.
 * Wire: /api/weather.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  PageHeader, Card, Segmented, CompoundChip, Legend, EmptyState,
} from "@/design/components/shell";
import { Scatter, Heatmap, COMPOUND_COLOR } from "@/design/lib/charts";

const BUCKETS = ["<20", "20-25", "25-30", "30-35", "35-40", ">40"];

export default function PageWeather() {
  const [compounds, setCompounds] = useState(["SOFT", "MEDIUM", "HARD"]);
  const [showBands, setShowBands] = useState(true);
  const [includeWet, setIncludeWet] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    const qs = new URLSearchParams({
      compounds: compounds.join(","),
      include_wet: includeWet ? "1" : "0",
    });
    fetch(`/api/weather?${qs}`).then((r) => r.json()).then(setData);
  }, [compounds.join(","), includeWet]);

  const stints = data?.stints || [];
  const buckets = data?.buckets || [];

  // Faixa ótima por composto: p25–p75 de temperatura nos stints com deg < mediana
  const bands = useMemo(() => {
    return compounds.map((c) => {
      const sub = stints.filter((s) => s.compound === c);
      if (sub.length < 10) return null;
      const sorted = [...sub].sort((a, b) => a.deg_per_lap_s - b.deg_per_lap_s);
      const median = sorted[Math.floor(sorted.length / 2)].deg_per_lap_s;
      const good = sub.filter((s) => s.deg_per_lap_s < median);
      const temps = good.map((s) => s.track_temp_c).sort((a, b) => a - b);
      if (temps.length < 4) return null;
      return {
        x0: temps[Math.floor(temps.length * 0.25)],
        x1: temps[Math.floor(temps.length * 0.75)],
        color: COMPOUND_COLOR[c],
        label: `${c} OPT`,
      };
    }).filter(Boolean);
  }, [stints, compounds.join(",")]);

  const heatRows = compounds.map((c) => ({
    label: c,
    values: BUCKETS.map((b) => {
      const recs = buckets.filter((r) => r.compound === c && r.temp_bucket === b);
      if (!recs.length) return { col: b, value: null };
      const total = recs.reduce((a, r) => a + r.n, 0);
      const wmean = recs.reduce((a, r) => a + r.avg_deg * r.n, 0) / (total || 1);
      return { col: b, value: wmean };
    }),
  }));

  const summary = compounds.map((c) => {
    const sub = stints.filter((s) => s.compound === c);
    if (!sub.length) return null;
    const ds = sub.map((s) => s.deg_per_lap_s).sort((a, b) => a - b);
    const ts = sub.map((s) => s.track_temp_c).sort((a, b) => a - b);
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const pct = (a, p) => a[Math.floor(a.length * p)];
    return {
      compound: c,
      n: sub.length,
      deg_mean: mean(ds),
      deg_med: ds[Math.floor(ds.length / 2)],
      temp_mean: mean(ts),
      temp_p25: pct(ts, 0.25),
      temp_p75: pct(ts, 0.75),
    };
  }).filter(Boolean);

  if (!data) {
    return (
      <main className="page">
        <PageHeader eyebrow="ANALYTICS · WEATHER IMPACT" title="Loading…" />
      </main>
    );
  }

  const covPct = data.coverage.total
    ? (data.coverage.with_weather / data.coverage.total * 100)
    : 0;

  return (
    <main className="page">
      <PageHeader
        eyebrow="ANALYTICS · WEATHER IMPACT"
        title="Track temperature × tyre degradation"
        desc="Per-stint scatter from staging.stg_tyre_stints. Shaded bands show the p25–p75 of temperatures where deg is below the compound's median — the 'sweet spot'."
        right={
          <Segmented
            options={[{ value: 1, label: "Bands on" }, { value: 0, label: "Bands off" }]}
            value={showBands ? 1 : 0}
            onChange={(v) => setShowBands(!!v)}
          />
        }
      />

      <div className="card" style={{
        padding: "10px 16px", marginBottom: 16,
        borderLeft: `3px solid var(--${covPct < 70 ? "amber" : "cool"})`,
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <span className="mono" style={{
          color: `var(--${covPct < 70 ? "amber" : "cool"})`,
          fontSize: 11, letterSpacing: "0.08em",
        }}>📡 COVERAGE</span>
        <span style={{ fontSize: 13 }}>
          Weather available on <strong>{covPct.toFixed(1)}%</strong> of laps
          ({fmtInt(data.coverage.with_weather)} of {fmtInt(data.coverage.total)}).
          INTERMEDIATE/WET stints excluded unless toggled below.
        </span>
        <label className="mono muted" style={{ marginLeft: "auto", fontSize: 11, cursor: "pointer" }}>
          <input type="checkbox" checked={includeWet}
                 onChange={(e) => setIncludeWet(e.target.checked)} />
          {" "}include WET/INTERMEDIATE
        </label>
      </div>

      <div className="mt-12" style={{ display: "flex", gap: 10 }}>
        {["SOFT", "MEDIUM", "HARD"].map((c) => (
          <CompoundChip key={c} compound={c}
                        active={compounds.includes(c)}
                        onClick={() =>
                          setCompounds(compounds.includes(c)
                            ? compounds.filter((x) => x !== c)
                            : [...compounds, c])} />
        ))}
      </div>

      <div className="grid grid-12 mt-20 gap-lg">
        <div className="col-8">
          <Card title="Track temp × deg · all stints"
                sub="EACH POINT = ONE STINT"
                right={<Legend items={compounds.map((c) => ({
                  kind: "dot", color: COMPOUND_COLOR[c], label: c }))} />}>
            {stints.length === 0 ? <EmptyState title="No stints for this selection" />
              : <Scatter
                  points={stints.map((s) => ({
                    x: s.track_temp_c, y: s.deg_per_lap_s,
                    color: COMPOUND_COLOR[s.compound],
                    label: `${s.year} · ${s.compound} · ${s.event_name.replace(" Grand Prix", "")} · ${s.deg_per_lap_s.toFixed(3)}s`,
                  }))}
                  optimalBands={showBands ? bands : []}
                  width={760} height={360}
                  xLabel="track temperature (°C)"
                  xFormat={(v) => Math.round(v) + "°"}
                  yFormat={(v) => v.toFixed(3)}
                />}
          </Card>
        </div>

        <div className="col-4">
          <Card title="Per-compound summary" sub="STINTS · MEAN · OPT TEMP WINDOW">
            {summary.length === 0 && <EmptyState title="No data" />}
            {summary.map((s) => (
              <div key={s.compound} style={{
                marginBottom: 16, paddingBottom: 12,
                borderBottom: "1px solid var(--border-soft)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={`legend-dot sw-${s.compound}`}
                        style={{ width: 10, height: 10 }} />
                  <span style={{ fontWeight: 600 }}>{s.compound}</span>
                  <span className="mono muted" style={{ marginLeft: "auto", fontSize: 10 }}>
                    n={s.n}
                  </span>
                </div>
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 8, marginTop: 8,
                }}>
                  <div>
                    <div className="mono muted" style={{ fontSize: 9 }}>MEAN DEG</div>
                    <div className="mono" style={{ fontSize: 13 }}>{s.deg_mean.toFixed(3)}</div>
                  </div>
                  <div>
                    <div className="mono muted" style={{ fontSize: 9 }}>MED DEG</div>
                    <div className="mono" style={{ fontSize: 13 }}>{s.deg_med.toFixed(3)}</div>
                  </div>
                  <div>
                    <div className="mono muted" style={{ fontSize: 9 }}>OPT TEMP</div>
                    <div className="mono" style={{ fontSize: 13 }}>
                      {Math.round(s.temp_p25)}–{Math.round(s.temp_p75)}°
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>

      <div className="mt-20">
        <Card title="marts.tyre_weather_profile · mean deg per temp bucket"
              sub="2020 → CURRENT">
          {buckets.length === 0 ? <EmptyState title="No bucket data" />
            : <Heatmap rows={heatRows} cols={BUCKETS}
                       cellH={32} width={780}
                       valueFormat={(v) => v != null ? v.toFixed(3) : "—"} />}
        </Card>
      </div>
    </main>
  );
}

function fmtInt(n) { return new Intl.NumberFormat("en-US").format(n); }
