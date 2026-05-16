/**
 * Circuit Profiles API — alimenta /circuits.
 * Mart source: marts.circuit_tyre_profile.
 *
 * Equivalente a dashboard/pages/3_🗺️_Perfil_Circuitos.py.
 */
import { query, compoundsSql } from "@/lib/db";

export const revalidate = 300;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const compounds = (searchParams.get("compounds") || "SOFT,MEDIUM,HARD")
    .split(",")
    .filter(Boolean);

  const rows = await query(`
    SELECT circuit_key, event_name, compound,
           avg_deg_s::float, avg_stint_laps::float,
           usage_pct::float, degradation_tier
    FROM marts.circuit_tyre_profile
    WHERE compound IN (${compoundsSql(compounds)})
    ORDER BY avg_deg_s DESC
  `);

  return Response.json({ rows: rows.rows });
}
