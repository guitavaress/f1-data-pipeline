"use client";

/**
 * Strategy Lab — pit-window simulator.
 * Equivalente conceitual ao mocked PageStrategy do prototype Claude Design.
 * Dados reais via /api/strategy (deg/pace/stint de marts.tyre_degradation).
 *
 * Simulação é client-side: pra cada estratégia, simula laptime lap-by-lap
 * usando deg_per_lap e adiciona pit loss fixo entre stints.
 */
import React, { useEffect, useMemo, useState } from "react";
import { PageHeader, KPI, Card, Segmented, EmptyState } from "@/design/components/shell";
import {
  DegradationCurve, COMPOUND_COLOR, makeScale, niceTicks,
} from "@/design/lib/charts";

const PIT_LOSS_S = 22;

// Regra Pirelli/FIA: em corrida SECA, o piloto é obrigado a usar pelo menos
// DOIS compostos de slick distintos (Sporting Regulations Art. 30.5).
// Estratégias single-compound só são legais em wet race declarada
// (quando intermediários ou wets foram usados em algum momento).
//
// `dry` = lista de estratégias legais em piso seco (≥ 2 compostos distintos).
// `wet` = exemplos pra quando o GP é declarado wet — single-compound (INTER
// ou WET) torna-se viável.
const STRATEGIES = {
  m_h:   { label: "1-stop · M → H",     stints: [{ c: "MEDIUM", frac: 0.45 }, { c: "HARD",   frac: 0.55 }] },
  s_m:   { label: "1-stop · S → M",     stints: [{ c: "SOFT",   frac: 0.32 }, { c: "MEDIUM", frac: 0.68 }] },
  s_h:   { label: "1-stop · S → H",     stints: [{ c: "SOFT",   frac: 0.28 }, { c: "HARD",   frac: 0.72 }] },
  h_m:   { label: "1-stop · H → M",     stints: [{ c: "HARD",   frac: 0.55 }, { c: "MEDIUM", frac: 0.45 }] },
  s_m_h: { label: "2-stop · S → M → H", stints: [{ c: "SOFT", frac: 0.25 }, { c: "MEDIUM", frac: 0.40 }, { c: "HARD", frac: 0.35 }] },
  s_m_s: { label: "2-stop · S → M → S", stints: [{ c: "SOFT", frac: 0.28 }, { c: "MEDIUM", frac: 0.45 }, { c: "SOFT", frac: 0.27 }] },
  m_s_m: { label: "2-stop · M → S → M", stints: [{ c: "MEDIUM", frac: 0.36 }, { c: "SOFT", frac: 0.28 }, { c: "MEDIUM", frac: 0.36 }] },
  m_h_m: { label: "2-stop · M → H → M", stints: [{ c: "MEDIUM", frac: 0.33 }, { c: "HARD", frac: 0.34 }, { c: "MEDIUM", frac: 0.33 }] },
  // Wet-only — single-compound. Mostradas apenas quando wet race toggle ON.
  int_only: { label: "Wet · INTER full",  stints: [{ c: "INTERMEDIATE", frac: 1.0 }], wetOnly: true },
  wet_only: { label: "Wet · WET full",    stints: [{ c: "WET", frac: 1.0 }], wetOnly: true },
};

// Quantos compostos distintos a estratégia usa.
function distinctCompounds(strat) {
  return new Set(strat.stints.map((s) => s.c)).size;
}

// Legal em corrida seca exige ≥2 compostos diferentes.
function isDryLegal(strat) {
  return distinctCompounds(strat) >= 2;
}

const DEFAULT_CIRCUIT = "British Grand Prix";

export default function PageStrategy() {
  const [circuits, setCircuits] = useState([]);
  const [circuit, setCircuit] = useState("");
  const [year, setYear] = useState(null);
  const [raceLaps, setRaceLaps] = useState(52);
  const [strategy, setStrategy] = useState("m_h");
  const [wetRace, setWetRace] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/api/strategy").then((r) => r.json()).then((d) => {
      setCircuits(d.circuits || []);
      const def = d.circuits?.find((c) => c.circuit_key === DEFAULT_CIRCUIT) ?? d.circuits?.[0];
      if (def) {
        setCircuit(def.circuit_key);
        setYear(def.latest_year);
      }
    });
  }, []);

  useEffect(() => {
    if (!circuit) return;
    const qs = new URLSearchParams({ circuit });
    if (year) qs.set("year", String(year));
    fetch(`/api/strategy?${qs}`).then((r) => r.json()).then(setData);
  }, [circuit, year]);

  const rows = data?.rows || [];
  const get = (cat, field, fallback) =>
    rows.find((r) => r.compound === cat)?.[field] ?? fallback;
  const deg   = (c) => get(c, "avg_deg_per_lap_s", 0.06);
  const stint = (c) => get(c, "avg_stint_length", 18);
  const pace  = (c) => get(c, "avg_pace_s", 92.0);

  // Simula uma estratégia: retorna { totalT, segments }
  function simulate(strat) {
    let totalT = 0;
    const segments = [];
    let lapCursor = 1;
    strat.stints.forEach((seg, idx) => {
      const laps = Math.round(seg.frac * raceLaps);
      const base = pace(seg.c);
      const d = deg(seg.c);
      const points = [];
      let segT = 0;
      for (let i = 0; i < laps; i++) {
        // cliff suave após 75% da vida do stint
        const t = base + i * d + (i > laps * 0.75 ? Math.pow(i - laps * 0.75, 1.4) * d * 0.5 : 0);
        segT += t;
        points.push({ lap: lapCursor + i, t });
      }
      totalT += segT;
      if (idx > 0) totalT += PIT_LOSS_S;
      segments.push({ ...seg, laps, segT, points });
      lapCursor += laps;
    });
    return { totalT, segments };
  }

  // Estratégias disponíveis dependem de wetRace:
  // - dry  → só dry-legal (≥2 compostos slick distintos)
  // - wet  → tudo (incluindo single-compound INTER/WET)
  const visibleStrategies = useMemo(() => {
    return Object.entries(STRATEGIES).filter(([_, s]) => {
      if (s.wetOnly) return wetRace;
      return wetRace || isDryLegal(s);
    });
  }, [wetRace]);

  // Se a estratégia selecionada desapareceu da lista visível (ex.: tinha
  // wet selecionado e desligou wetRace), volta pra primeira disponível.
  useEffect(() => {
    if (!visibleStrategies.find(([k]) => k === strategy)) {
      const first = visibleStrategies[0]?.[0];
      if (first) setStrategy(first);
    }
  }, [visibleStrategies, strategy]);

  const sim = useMemo(() => simulate(STRATEGIES[strategy] ?? STRATEGIES.m_h),
                      [strategy, rows, raceLaps]);
  // Pra ranking: só estratégias visíveis (respeitam wetRace)
  const allSims = useMemo(() =>
    visibleStrategies.map(([k, s]) => ({ key: k, ...s, sim: simulate(s) })),
    [rows, raceLaps, visibleStrategies]
  );
  const bestKey = allSims.length
    ? allSims.reduce((a, b) => a.sim.totalT < b.sim.totalT ? a : b).key
    : null;

  if (!data) {
    return (
      <main className="page">
        <PageHeader eyebrow="NEW · STRATEGY LAB" title="Loading…" />
      </main>
    );
  }

  if (rows.length === 0) {
    return (
      <main className="page">
        <PageHeader
          eyebrow="NEW · STRATEGY LAB"
          title="Pit-window simulator"
          right={<select className="select" value={circuit}
                          onChange={(e) => setCircuit(e.target.value)}>
                    {circuits.map((c) => (
                      <option key={c.circuit_key} value={c.circuit_key}>{c.event_name}</option>
                    ))}
                  </select>}
        />
        <EmptyState
          title={`Sem dados pra ${data.circuit} em ${data.year}`}
          hint="Tenta outro circuito ou ano com mais cobertura no marts."
        />
      </main>
    );
  }

  return (
    <main className="page">
      <PageHeader
        eyebrow="NEW · STRATEGY LAB"
        title="Pit-window simulator"
        desc="Builds on marts.tyre_degradation. Pick circuit + race length + strategy — see expected total race time and where pit windows open. Math runs client-side; the server only provides deg/pace/stint per compound. Strategies enforce the FIA two-compound rule (Sporting Regs Art. 30.5) — toggle 'Wet race' to allow single-compound INTER/WET runs."
        right={
          <>
            <Segmented
              options={[
                { value: 0, label: "Dry race" },
                { value: 1, label: "Wet race" },
              ]}
              value={wetRace ? 1 : 0}
              onChange={(v) => setWetRace(!!v)}
            />
            <select className="select" value={circuit}
                    onChange={(e) => setCircuit(e.target.value)}>
              {circuits.map((c) => (
                <option key={c.circuit_key} value={c.circuit_key}>{c.event_name}</option>
              ))}
            </select>
          </>
        }
      />

      {/* Banner com a regra de 2 compostos */}
      <div className="card" style={{
        padding: "10px 16px", marginBottom: 16,
        borderLeft: `3px solid var(--${wetRace ? "cool" : "amber"})`,
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <span className="mono" style={{
          color: `var(--${wetRace ? "cool" : "amber"})`,
          fontSize: 11, letterSpacing: "0.08em",
        }}>
          {wetRace ? "💧 WET RACE" : "⚠ DRY RACE · ART. 30.5"}
        </span>
        <span style={{ fontSize: 13 }}>
          {wetRace
            ? <>Wet declarada — single-compound (INTER ou WET) é permitido. A regra dos dois compostos slick fica suspensa.</>
            : <>FIA exige ao menos <strong>2 compostos de slick distintos</strong> ao longo da corrida.
                Single-compound (M→M→M etc.) seria DSQ — está fora do set abaixo.</>}
        </span>
      </div>

      <div className="grid grid-4">
        <KPI label="Race laps"
             value={
               <input className="input" type="number" value={raceLaps}
                      onChange={(e) => setRaceLaps(+e.target.value || 50)}
                      min={20} max={90}
                      style={{ width: 80, fontSize: 24, padding: 2, background: "transparent",
                               border: "none", color: "var(--fg)", fontFamily: "var(--font-mono)" }} />
             }
             hint="adjust to taste" />
        <KPI label={`${data.year} SOFT deg`}   value={`${deg("SOFT").toFixed(3)}s`}   hint="from marts" />
        <KPI label={`${data.year} MEDIUM deg`} value={`${deg("MEDIUM").toFixed(3)}s`} hint="from marts" />
        <KPI label={`${data.year} HARD deg`}   value={`${deg("HARD").toFixed(3)}s`}   hint="from marts" />
      </div>

      <div className="mt-20" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="mono muted" style={{ fontSize: 11 }}>STRATEGY</span>
        {visibleStrategies.map(([k, s]) => (
          <button key={k} className={`chip${strategy === k ? " active" : ""}`}
                  onClick={() => setStrategy(k)}
                  style={{ background: "transparent", color: "inherit", cursor: "pointer" }}>
            {bestKey === k && <span style={{ color: "var(--good)" }}>★</span>}
            <span>{s.label}</span>
            {s.wetOnly && (
              <span className="mono" style={{ color: "var(--cool)", fontSize: 9,
                                                marginLeft: 4, letterSpacing: "0.08em" }}>
                WET
              </span>
            )}
          </button>
        ))}
        <span className="mono muted" style={{ marginLeft: "auto", fontSize: 10 }}>
          {visibleStrategies.length} legal strategies · {wetRace ? "wet" : "dry"}
        </span>
      </div>

      <div className="grid grid-12 mt-20 gap-lg">
        <div className="col-8">
          <Card title="Lap-time projection" sub="S/LAP · STINTS COLORED BY COMPOUND">
            <StintGraph segments={sim.segments} raceLaps={raceLaps} />
            <div className="divider" style={{ margin: "16px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <div className="mono muted" style={{ fontSize: 10, letterSpacing: "0.08em" }}>EST. RACE TIME</div>
                <div className="mono" style={{ fontSize: 28, color: "var(--fg)", fontWeight: 500 }}>
                  {formatTime(sim.totalT)}
                </div>
                <div className="mono muted" style={{ fontSize: 11 }}>
                  {STRATEGIES[strategy].stints.length - 1} pit stop{STRATEGIES[strategy].stints.length > 2 ? "s" : ""} · {PIT_LOSS_S}s loss each
                </div>
              </div>
              <div>
                <div className="mono muted" style={{ fontSize: 10, letterSpacing: "0.08em" }}>VS. BEST</div>
                <div className="mono" style={{ fontSize: 28, fontWeight: 500,
                                                color: strategy === bestKey ? "var(--good)" : "var(--hot)" }}>
                  {strategy === bestKey
                    ? "BEST"
                    : "+" + (sim.totalT - allSims.find((s) => s.key === bestKey).sim.totalT).toFixed(1) + "s"}
                </div>
                <div className="mono muted" style={{ fontSize: 11 }}>
                  best · {STRATEGIES[bestKey]?.label}
                </div>
              </div>
            </div>
          </Card>

          <div className="mt-20">
            <Card title="All strategies · ranked" sub="S — RACE TIME" flush>
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Strategy</th>
                    <th className="right">Race time</th>
                    <th className="right">Δ vs best</th>
                    <th>Stint plan</th>
                  </tr>
                </thead>
                <tbody>
                  {[...allSims].sort((a, b) => a.sim.totalT - b.sim.totalT).map((s, i) => (
                    <tr key={s.key}
                        onClick={() => setStrategy(s.key)}
                        style={{ cursor: "pointer" }}>
                      <td className="mono">{i + 1}</td>
                      <td>{s.label}</td>
                      <td className="mono right">{formatTime(s.sim.totalT)}</td>
                      <td className={`mono right ${i === 0 ? "delta-down" : "delta-up"}`}>
                        {i === 0 ? "—" : "+" + (s.sim.totalT - allSims[0].sim.totalT).toFixed(1) + "s"}
                      </td>
                      <td><StintBars segments={s.sim.segments} raceLaps={raceLaps} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </div>

        <div className="col-4">
          <Card title="Pit windows" sub="OPTIMAL LAP RANGE PER STOP">
            {STRATEGIES[strategy].stints.length <= 1 ? (
              <div className="mono muted" style={{ fontSize: 12, padding: "8px 0" }}>
                Single-stint strategy — no scheduled pit stops.
                <div style={{ marginTop: 6, fontSize: 10 }}>
                  Só viável em wet race declarada (Art. 30.5 suspende a regra
                  de 2 compostos quando INTER/WET é usado).
                </div>
              </div>
            ) : STRATEGIES[strategy].stints.slice(0, -1).map((seg, i) => {
              const cum = STRATEGIES[strategy].stints.slice(0, i + 1)
                          .reduce((a, s) => a + s.frac, 0);
              const idealLap = Math.round(cum * raceLaps);
              const lo = idealLap - 3, hi = idealLap + 3;
              return (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between",
                                 alignItems: "baseline" }}>
                    <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)",
                                                     letterSpacing: "0.08em" }}>
                      STOP #{i + 1} · {seg.c} → {STRATEGIES[strategy].stints[i + 1].c}
                    </span>
                    <span className="mono" style={{ fontSize: 18 }}>L{idealLap}</span>
                  </div>
                  <PitWindowBar raceLaps={raceLaps} lo={lo} hi={hi} ideal={idealLap} />
                  <div className="mono muted" style={{ fontSize: 10, marginTop: 4 }}>
                    window · L{lo} → L{hi} · ±3 laps
                  </div>
                </div>
              );
            })}
          </Card>

          <div className="mt-20">
            <Card title="Single-lap degradation curves"
                  sub="LAP-TIME EVOLUTION FOR EACH COMPOUND">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {["SOFT", "MEDIUM", "HARD"].map((c) => (
                  <DegradationCurve key={c}
                    baseTime={pace(c)}
                    degPerLap={deg(c)}
                    laps={Math.max(5, Math.round(stint(c)))}
                    color={COMPOUND_COLOR[c]}
                    label={`${c} · ${stint(c).toFixed(0)} lap typical`}
                    width={300} height={84}
                    cliff
                  />
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${String(s.toFixed(1)).padStart(4, "0")}`;
}

function StintGraph({ segments, raceLaps }) {
  const W = 720, H = 280, pad = { t: 20, r: 16, b: 32, l: 50 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const allT = segments.flatMap((s) => s.points.map((p) => p.t));
  if (!allT.length) return null;
  const yD = [Math.min(...allT) - 0.4, Math.max(...allT) + 0.2];
  const x = makeScale([0, raceLaps], [pad.l, pad.l + innerW]);
  const y = makeScale(yD, [pad.t + innerH, pad.t]);
  const yTicks = niceTicks(yD[0], yD[1], 5);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%">
      <g className="grid">
        {yTicks.map((t, i) => (
          <line key={i} x1={pad.l} x2={pad.l + innerW} y1={y(t)} y2={y(t)} />
        ))}
      </g>
      <g className="axis">
        {yTicks.map((t, i) => (
          <text key={i} x={pad.l - 8} y={y(t) + 3} textAnchor="end">{t.toFixed(1)}s</text>
        ))}
        {[0, raceLaps * 0.25, raceLaps * 0.5, raceLaps * 0.75, raceLaps].map((l, i) => (
          <text key={i} x={x(l)} y={pad.t + innerH + 16} textAnchor="middle">L{Math.round(l)}</text>
        ))}
      </g>
      {segments.map((seg, si) => {
        if (!seg.points.length) return null;
        const d = seg.points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.lap)},${y(p.t)}`).join(" ");
        const lastX  = x(seg.points[seg.points.length - 1].lap);
        const firstX = x(seg.points[0].lap);
        const color = COMPOUND_COLOR[seg.c];
        return (
          <g key={si}>
            <path d={d + ` L${lastX},${pad.t + innerH} L${firstX},${pad.t + innerH} Z`}
                  fill={color} opacity="0.08" />
            <path d={d} fill="none" stroke={color} strokeWidth="1.8" />
            <rect x={firstX} y={pad.t} width={lastX - firstX} height={4}
                  fill={color} opacity="0.6" />
            <text x={(firstX + lastX) / 2} y={pad.t - 5} textAnchor="middle"
                  fill={color} fontFamily="var(--font-mono)" fontSize="9.5">
              {seg.c} · {seg.laps}L
            </text>
            {si < segments.length - 1 && (
              <g>
                <line x1={lastX} x2={lastX} y1={pad.t} y2={pad.t + innerH}
                      stroke="var(--fg-4)" strokeDasharray="2 3" />
                <text x={lastX + 4} y={pad.t + 16} fill="var(--amber)"
                      fontFamily="var(--font-mono)" fontSize="9">PIT</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function StintBars({ segments, raceLaps }) {
  const W = 200, H = 14;
  let cur = 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      {segments.map((s, i) => {
        const w = (s.laps / raceLaps) * (W - 1);
        const x = cur;
        cur += w;
        return (
          <rect key={i} x={x} y={2} width={Math.max(1, w - 1)} height={H - 4}
                fill={COMPOUND_COLOR[s.c]} opacity="0.85" rx="2">
            <title>{`${s.c} · ${s.laps} laps`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function PitWindowBar({ raceLaps, lo, hi, ideal }) {
  const W = 320, H = 28;
  const x = makeScale([1, raceLaps], [0, W]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
      <rect x={0} y={H / 2 - 1} width={W} height={2} fill="var(--bg-2)" />
      <rect x={x(lo)} y={4} width={x(hi) - x(lo)} height={H - 8}
            fill="var(--hot)" opacity="0.18" rx="3" />
      <line x1={x(ideal)} x2={x(ideal)} y1={1} y2={H - 1}
            stroke="var(--hot)" strokeWidth="2" />
      <text x={1} y={H - 1} fontFamily="var(--font-mono)" fontSize="9" fill="var(--fg-4)">L1</text>
      <text x={W - 1} y={H - 1} textAnchor="end" fontFamily="var(--font-mono)"
            fontSize="9" fill="var(--fg-4)">L{raceLaps}</text>
    </svg>
  );
}
