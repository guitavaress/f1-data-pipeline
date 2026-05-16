/**
 * Compound vs Compound API — alimenta /compare.
 *
 * Devolve, pra cada compound físico (C1..C5), histórico de degradação
 * (marts.compound_physical_evolution) + sample de stints reais
 * (staging.stg_tyre_stints, LIMIT 200 por compound pra payload leve).
 *
 * GET /api/compare?a=C3&b=C4
 */
import { query, sqlString } from "@/lib/db";

export const revalidate = 300;

async function loadCompound(c) {
  const evolution = await query(`
    SELECT year, compound_name,
           avg_deg_s::float, avg_stint_laps::float,
           races_used::int, total_stints::int
    FROM marts.compound_physical_evolution
    WHERE compound_name = ${sqlString(c)}
    ORDER BY year
  `);
  const stints = await query(`
    SELECT year, event_name, circuit_key,
           stint_length::float, deg_per_lap_s::float,
           avg_track_temp_c::float
    FROM staging.stg_tyre_stints
    WHERE compound_name = ${sqlString(c)}
      AND deg_per_lap_s IS NOT NULL
      AND stint_length >= 5
    ORDER BY year DESC, stint_length DESC
    LIMIT 200
  `);
  return { evolution: evolution.rows, stints: stints.rows };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const a = searchParams.get("a") || "C3";
  const b = searchParams.get("b") || "C4";

  // Valida — só aceita C1..C5
  const valid = /^C[1-5]$/;
  if (!valid.test(a) || !valid.test(b)) {
    return Response.json({ error: "Invalid compound (use C1..C5)" }, { status: 400 });
  }

  const [aData, bData] = await Promise.all([loadCompound(a), loadCompound(b)]);

  return Response.json({
    a: { name: a, ...aData },
    b: { name: b, ...bData },
  });
}
