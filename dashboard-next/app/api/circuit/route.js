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

  // Sempre devolve a lista pra popular o dropdown
  const circuits = await query(`
    SELECT circuit_key, max(event_name) AS event_name,
           count(DISTINCT year) AS years
    FROM marts.tyre_degradation
    GROUP BY circuit_key
    ORDER BY 2
  `);

  if (!circuit) {
    return Response.json({ circuits: circuits.rows });
  }

  // Dados do circuito específico
  const rows = await query(`
    SELECT year, compound, compound_name,
           avg_deg_per_lap_s, avg_pace_s, avg_stint_length, yoy_deg_delta
    FROM marts.tyre_degradation
    WHERE circuit_key = ${sqlString(circuit)}
      AND compound IN (${compoundsSql(compounds)})
    ORDER BY year, compound
  `);

  // Recent stints pra scatter — staging.stg_tyre_stints
  const stints = await query(`
    SELECT year, compound, compound_name,
           stint_length, deg_per_lap_s, avg_track_temp_c, had_rain
    FROM staging.stg_tyre_stints
    WHERE circuit_key = ${sqlString(circuit)}
      AND deg_per_lap_s IS NOT NULL
      AND stint_length >= 5
    ORDER BY year DESC, stint_length DESC
    LIMIT 200
  `);

  return Response.json({
    circuits: circuits.rows,
    rows: rows.rows,
    stints: stints.rows,
  });
}
