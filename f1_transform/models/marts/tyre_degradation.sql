-- Análise de degradação por composto, circuito e ano
-- Responde: "qual composto degrada mais rápido em Silverstone?"
with stints as (
    select * from {{ ref('stg_tyre_stints') }}
    where stint_length >= 5   -- só stints representativos
),
aggregated as (
    select
        year,
        circuit_key,
        max(event_name)                                 as event_name,
        compound,
        max(compound_name)                              as compound_name,  -- ← NOVO

        count(distinct driver)                          as driver_count,
        count(*)                                        as total_stints,

        -- degradação média
        round(avg(deg_per_lap_s)::numeric, 4)           as avg_deg_per_lap_s,
        round(percentile_cont(0.5) within group
              (order by deg_per_lap_s)::numeric, 4)     as median_deg_per_lap_s,

        -- duração ótima de stint
        round(avg(stint_length)::numeric, 1)            as avg_stint_length,
        max(stint_length)                               as max_stint_length,

        -- ritmo absoluto
        round(avg(best_lap_s)::numeric, 3)              as avg_best_lap_s,
        round(avg(avg_lap_s)::numeric, 3)               as avg_pace_s

    from stints
    group by 1,2,4
)
select
    *,
    -- flag de melhoria: compara com ano anterior
    avg_deg_per_lap_s - lag(avg_deg_per_lap_s) over (
        partition by circuit_key, compound
        order by year
    ) as yoy_deg_delta
from aggregated
order by year, circuit_key, compound
