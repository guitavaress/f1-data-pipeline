/**
 * Overview API — alimenta a Home page.
 * Mart sources: marts.compound_evolution, marts.tyre_degradation,
 *               marts.circuit_tyre_profile.
 *
 * Equivalente ao bloco de queries em dashboard/Home.py.
 */
import { query, compoundsSql } from "@/lib/db";

export const revalidate = 300; // 5 min, igual ao @st.cache_data(ttl=300) do Streamlit

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const compounds = (searchParams.get("compounds") || "SOFT,MEDIUM,HARD")
    .split(",")
    .filter(Boolean);
  const y0 = parseInt(searchParams.get("y0") || "2018", 10);
  const y1 = parseInt(searchParams.get("y1") || "2026", 10);

  // KPIs globais. Cast pra int evita bigint-as-string do node-pg.
  const kpi = await query(`
    SELECT
      (SELECT count(*)::int          FROM marts.tyre_degradation)         AS total_stints_rows,
      (SELECT count(DISTINCT year)::int FROM marts.compound_evolution)    AS years_covered,
      (SELECT count(DISTINCT circuit_key)::int FROM marts.circuit_tyre_profile) AS circuits,
      (SELECT count(DISTINCT compound)::int FROM marts.compound_evolution
         WHERE compound IN ('SOFT','MEDIUM','HARD'))                      AS compounds_n
  `);

  // Série principal: evolução por compound categórico
  const evolution = await query(`
    SELECT year, compound, avg_deg_s, avg_stint_laps, races_used
    FROM marts.compound_evolution
    WHERE year BETWEEN $1 AND $2
      AND compound IN (${compoundsSql(compounds)})
    ORDER BY year, compound
  `, [y0, y1]);

  // Compound usage share — média de usage_pct por compound across all circuits
  const usage = await query(`
    SELECT compound, round(avg(usage_pct)::numeric, 1)::float AS pct
    FROM marts.circuit_tyre_profile
    WHERE compound IN ('SOFT','MEDIUM','HARD')
    GROUP BY compound
    ORDER BY CASE compound WHEN 'SOFT' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END
  `);

  // Top 8 circuits mais agressivos no MEDIUM
  const topCircuits = await query(`
    SELECT event_name, avg_deg_s
    FROM marts.circuit_tyre_profile
    WHERE compound = 'MEDIUM'
    ORDER BY avg_deg_s DESC
    LIMIT 8
  `);

  return Response.json({
    kpi: kpi.rows[0],
    evolution: evolution.rows,
    usage: usage.rows,
    top_circuits: topCircuits.rows,
  });
}
