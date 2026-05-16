/**
 * Circuit Deep-Dive API — alimenta /circuit.
 * Mart sources: marts.tyre_degradation, staging.stg_tyre_stints.
 *
 * Equivalente a dashboard/pages/1_📉_Degradacao_Circuito.py.
 *
 * GET /api/circuit                       → lista de circuitos
 * GET /api/circuit?circuit=<key>         → dados de um circuito
 */
import { query, compoundsSql, sqlString } from "@/lib/db";

export const revalidate = 300;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const circuit = searchParams.get("circuit");
  const compounds = (searchParams.get("compounds") || "SOFT,MEDIUM,HARD")
    .split(",")
    .filter(Boolean);

  const y0 = parseInt(searchParams.get("y0") || "0", 10) || null;
  const y1 = parseInt(searchParams.get("y1") || "0", 10) || null;

  // Sempre devolve a lista pra popular o dropdown
  const circuits = await query(`
    SELECT circuit_key, max(event_name) AS event_name,
           count(DISTINCT year)::int AS years
    FROM marts.tyre_degradation
    GROUP BY circuit_key
    ORDER BY 2
  `);

  if (!circuit) {
    return Response.json({ circuits: circuits.rows });
  }

  // Bounds do circuito específico (pra slider client)
  const bounds = await query(`
    SELECT min(year)::int AS y_min, max(year)::int AS y_max
    FROM marts.tyre_degradation
    WHERE circuit_key = ${sqlString(circuit)}
  `);
  const yMin = bounds.rows[0]?.y_min;
  const yMax = bounds.rows[0]?.y_max;
  const startYear = y0 ?? yMin;
  const endYear   = y1 ?? yMax;

  // Dados do circuito no range
  const rows = await query(`
    SELECT year, compound, compound_name,
           avg_deg_per_lap_s::float, avg_pace_s::float,
           avg_stint_length::float, yoy_deg_delta::float
    FROM marts.tyre_degradation
    WHERE circuit_key = ${sqlString(circuit)}
      AND compound IN (${compoundsSql(compounds)})
      AND year BETWEEN $1 AND $2
    ORDER BY year, compound
  `, [startYear, endYear]);

  // Stints pra scatter — também respeitam o range
  const stints = await query(`
    SELECT year, compound, compound_name,
           stint_length::float, deg_per_lap_s::float,
           avg_track_temp_c::float, had_rain
    FROM staging.stg_tyre_stints
    WHERE circuit_key = ${sqlString(circuit)}
      AND deg_per_lap_s IS NOT NULL
      AND stint_length >= 5
      AND year BETWEEN $1 AND $2
    ORDER BY year DESC, stint_length DESC
    LIMIT 200
  `, [startYear, endYear]);

  return Response.json({
    circuits: circuits.rows,
    bounds: { y_min: yMin, y_max: yMax },
    range: { y0: startYear, y1: endYear },
    rows: rows.rows,
    stints: stints.rows,
  });
}
