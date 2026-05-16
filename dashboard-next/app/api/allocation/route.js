/**
 * Allocation Calendar API — alimenta /allocation.
 *
 * Lê staging.pirelli_compound_allocations (carregado via `dbt seed`) e
 * enriquece com agressividade/temperatura média por circuito derivada
 * de marts.circuit_tyre_profile + staging.stg_tyre_stints.
 *
 * GET /api/allocation                → metadata: anos disponíveis na seed
 * GET /api/allocation?year=Y         → rounds + alocações
 */
import { query } from "@/lib/db";

export const revalidate = 300;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") || "0", 10) || null;

  // Anos disponíveis na seed
  const years = await query(`
    SELECT DISTINCT year::int AS year
    FROM staging.pirelli_compound_allocations
    ORDER BY year
  `);
  const yearsList = years.rows.map((r) => r.year);

  if (!year) {
    return Response.json({ years: yearsList });
  }

  // Rounds com allocation + métricas do circuito (mean deg + mean temp)
  // Left join porque ainda nem todos os circuitos têm dados em
  // circuit_tyre_profile (depende de minimum stint count).
  const rounds = await query(`
    WITH alloc AS (
      SELECT year, round_number, event_name, c_hard, c_medium, c_soft
      FROM staging.pirelli_compound_allocations
      WHERE year = $1
      ORDER BY round_number
    ),
    agg AS (
      SELECT event_name,
             round(avg(avg_deg_s)::numeric, 4)::float AS mean_deg
      FROM marts.circuit_tyre_profile
      GROUP BY event_name
    ),
    temp AS (
      SELECT event_name,
             round(avg(avg_track_temp_c)::numeric, 1)::float AS mean_temp_c
      FROM staging.stg_tyre_stints
      WHERE avg_track_temp_c IS NOT NULL
      GROUP BY event_name
    )
    SELECT a.year, a.round_number, a.event_name,
           a.c_hard, a.c_medium, a.c_soft,
           ag.mean_deg, t.mean_temp_c
    FROM alloc a
    LEFT JOIN agg  ag ON ag.event_name = a.event_name
    LEFT JOIN temp t  ON t.event_name  = a.event_name
    ORDER BY a.round_number
  `, [year]);

  return Response.json({
    years: yearsList,
    year,
    rounds: rounds.rows,
  });
}
