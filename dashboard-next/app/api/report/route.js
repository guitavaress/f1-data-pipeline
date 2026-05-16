/**
 * Pirelli Report Card API — alimenta /report.
 * Mart sources: marts.compound_physical_evolution, staging.stg_tyre_stints.
 *
 * Equivalente a dashboard/pages/2_📈_Pirelli_Report_Card.py.
 * Modo honesto: agrega de stg_tyre_stints filtrando circuitos com cobertura
 * >= 80% no range selecionado (≥ ceil(0.8 * total_years) anos).
 */
import { query } from "@/lib/db";

export const revalidate = 300;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const honest = searchParams.get("honest") !== "0";
  const y0 = parseInt(searchParams.get("y0") || "0", 10) || null;
  const y1 = parseInt(searchParams.get("y1") || "0", 10) || null;

  // Range disponível pra popular o slider
  const bounds = await query(`
    SELECT min(year)::int AS y_min, max(year)::int AS y_max
    FROM marts.compound_physical_evolution
  `);
  const yMin = bounds.rows[0]?.y_min ?? 2022;
  const yMax = bounds.rows[0]?.y_max ?? 2026;
  const startYear = y0 ?? yMin;
  const endYear   = y1 ?? yMax;

  const totalYears = endYear - startYear + 1;
  const minYears = Math.max(1, Math.floor(totalYears * 0.80));

  // Modo honesto: re-agrega de stg_tyre_stints com filtro de circuitos comuns.
  // Não-honesto: usa mart direto.
  let rows;
  if (honest) {
    const r = await query(`
      WITH base AS (
        SELECT year, compound_name, event_name, deg_per_lap_s, stint_length, avg_lap_s
        FROM staging.stg_tyre_stints
        WHERE year BETWEEN $1 AND $2
          AND stint_length >= 3
          AND compound_name IN ('C1','C2','C3','C4','C5')
          AND circuit_key IN (
            SELECT circuit_key
            FROM staging.stg_tyre_stints
            WHERE year BETWEEN $1 AND $2
              AND stint_length >= 3
              AND compound_name IN ('C1','C2','C3','C4','C5')
            GROUP BY circuit_key
            HAVING count(DISTINCT year) >= $3
          )
      )
      SELECT
        year,
        compound_name,
        count(DISTINCT event_name)::int          AS races_used,
        count(*)::int                            AS total_stints,
        round(avg(deg_per_lap_s)::numeric, 4)::float AS avg_deg_s,
        round(stddev(deg_per_lap_s)::numeric, 4)::float AS stddev_deg_s,
        round(avg(stint_length)::numeric, 1)::float  AS avg_stint_laps,
        max(stint_length)::float                 AS max_stint_laps
      FROM base
      GROUP BY year, compound_name
      ORDER BY compound_name, year
    `, [startYear, endYear, minYears]);
    rows = r.rows;
  } else {
    const r = await query(`
      SELECT year, compound_name, races_used::int, total_stints::int,
             avg_deg_s::float, stddev_deg_s::float,
             avg_stint_laps::float, max_stint_laps::float
      FROM marts.compound_physical_evolution
      WHERE year BETWEEN $1 AND $2
      ORDER BY compound_name, year
    `, [startYear, endYear]);
    rows = r.rows;
  }

  // YoY delta calculado server-side (em pandas o Streamlit fazia client-side)
  const byCompound = {};
  for (const r of rows) {
    (byCompound[r.compound_name] ??= []).push(r);
  }
  for (const arr of Object.values(byCompound)) {
    arr.sort((a, b) => a.year - b.year);
    for (let i = 1; i < arr.length; i++) {
      arr[i].yoy_deg_improvement = +(arr[i].avg_deg_s - arr[i - 1].avg_deg_s).toFixed(4);
      arr[i].yoy_longevity_delta = +(arr[i].avg_stint_laps - arr[i - 1].avg_stint_laps).toFixed(1);
    }
  }

  return Response.json({
    bounds: { y_min: yMin, y_max: yMax },
    range: { y0: startYear, y1: endYear },
    honest,
    min_years_required: minYears,
    rows,
  });
}
