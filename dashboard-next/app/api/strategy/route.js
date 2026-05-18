/**
 * Strategy Lab API — alimenta /strategy.
 *
 * Toda a simulação roda client-side; o servidor só fornece deg/pace/stint
 * por compound pra um circuito + ano. Tabela: marts.tyre_degradation.
 *
 * GET /api/strategy                       → lista de circuitos disponíveis
 * GET /api/strategy?circuit=<key>&year=Y  → dados pra simular
 */
import { query, sqlString } from "@/lib/db";

export const revalidate = 300;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const circuit = searchParams.get("circuit");
  const year = parseInt(searchParams.get("year") || "0", 10) || null;

  // Lista de circuitos com latest_year disponível (pra escolher default sensato)
  const circuits = await query(`
    SELECT circuit_key,
           max(event_name) AS event_name,
           max(year)::int  AS latest_year,
           count(DISTINCT year)::int AS years
    FROM marts.tyre_degradation
    GROUP BY circuit_key
    ORDER BY 2
  `);

  if (!circuit) {
    return Response.json({ circuits: circuits.rows });
  }

  // Determina o ano: usa o solicitado se houver, senão latest do circuito
  const meta = circuits.rows.find((c) => c.circuit_key === circuit);
  const useYear = year ?? meta?.latest_year;

  const rows = await query(`
    SELECT compound, compound_name,
           avg_deg_per_lap_s::float, avg_pace_s::float,
           avg_stint_length::float
    FROM marts.tyre_degradation
    WHERE circuit_key = ${sqlString(circuit)}
      AND year = $1
      AND compound IN ('SOFT','MEDIUM','HARD')
  `, [useYear]);

  return Response.json({
    circuits: circuits.rows,
    circuit,
    year: useYear,
    rows: rows.rows,
  });
}
