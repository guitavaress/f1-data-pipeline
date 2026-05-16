/**
 * Weather Impact API — alimenta /weather.
 * Mart sources: staging.stg_laps (cobertura),
 *               staging.stg_tyre_stints (scatter por stint),
 *               marts.tyre_weather_profile (heatmap por bucket).
 *
 * Equivalente a dashboard/pages/4_🌡️_Weather_Impact.py.
 */
import { query, compoundsSql } from "@/lib/db";

export const revalidate = 300;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const compounds = (searchParams.get("compounds") || "SOFT,MEDIUM,HARD")
    .split(",")
    .filter(Boolean);
  const includeWet = searchParams.get("include_wet") === "1";
  const y0 = parseInt(searchParams.get("y0") || "0", 10) || null;
  const y1 = parseInt(searchParams.get("y1") || "0", 10) || null;

  // Cobertura: quantos laps têm weather
  const cov = await query(`
    SELECT
      count(*) FILTER (WHERE air_temp_c IS NOT NULL OR track_temp_c IS NOT NULL) AS with_weather,
      count(*) AS total
    FROM staging.stg_laps
  `);

  // Range de anos com weather
  const yearBounds = await query(`
    SELECT min(year)::int AS y_min, max(year)::int AS y_max
    FROM staging.stg_tyre_stints
    WHERE avg_track_temp_c IS NOT NULL
  `);
  const yMin = yearBounds.rows[0]?.y_min ?? 2018;
  const yMax = yearBounds.rows[0]?.y_max ?? 2026;
  const startYear = y0 ?? yMin;
  const endYear = y1 ?? yMax;

  const rainFilter = includeWet
    ? `AND (compound IN ('SOFT','MEDIUM','HARD')
           OR (compound IN ('INTERMEDIATE','WET') AND had_rain = true))`
    : `AND compound IN ('SOFT','MEDIUM','HARD')`;

  // Stints com weather pra scatter
  const stints = await query(`
    SELECT year, circuit_key, event_name, compound, compound_name,
           avg_track_temp_c::float AS track_temp_c,
           deg_per_lap_s::float, stint_length::float, had_rain
    FROM staging.stg_tyre_stints
    WHERE avg_track_temp_c IS NOT NULL
      AND deg_per_lap_s IS NOT NULL
      AND stint_length >= 5
      AND year BETWEEN $1 AND $2
      AND compound IN (${compoundsSql(compounds)})
      ${rainFilter}
    LIMIT 5000
  `, [startYear, endYear]);

  // Mart: bucket × compound
  const buckets = await query(`
    SELECT compound, temp_bucket,
           round(avg(avg_deg_per_lap_s)::numeric, 4)::float AS avg_deg,
           sum(stints_in_bucket)::int AS n
    FROM marts.tyre_weather_profile
    WHERE compound IN (${compoundsSql(compounds)})
      AND year BETWEEN $1 AND $2
    GROUP BY 1, 2
  `, [startYear, endYear]);

  return Response.json({
    coverage: {
      with_weather: parseInt(cov.rows[0].with_weather, 10),
      total: parseInt(cov.rows[0].total, 10),
    },
    bounds: { y_min: yMin, y_max: yMax },
    range: { y0: startYear, y1: endYear },
    stints: stints.rows,
    buckets: buckets.rows,
  });
}
