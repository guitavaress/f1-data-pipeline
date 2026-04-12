-- Evolução dos compostos Pirelli de 2014 a hoje
-- Responde: "os pneus melhoraram ao longo dos anos?"
with stints as (
    select * from {{ ref('stg_tyre_stints') }}
    where stint_length >= 3
),
by_year_compound as (
    select
        year,
        compound,

        count(distinct event_name)                  as races_used,
        count(*)                                    as total_stints,

        -- degradação global por ano
        round(avg(deg_per_lap_s)::numeric, 4)       as avg_deg_s,
        round(stddev(deg_per_lap_s)::numeric, 4)    as stddev_deg_s,

        -- longevidade
        round(avg(stint_length)::numeric, 1)        as avg_stint_laps,
        max(stint_length)                           as max_stint_laps,

        -- ritmo
        round(avg(avg_lap_s)::numeric, 3)           as avg_race_pace_s,

        -- consistência (menor desvio = pneu mais consistente)
        round(avg(raw_degradation_s)::numeric, 3)   as avg_total_deg_s

    from stints
    group by 1, 2
)
select
    *,
    -- variação year-over-year
    avg_deg_s - lag(avg_deg_s) over (
        partition by compound order by year
    ) as yoy_deg_improvement,

    avg_stint_laps - lag(avg_stint_laps) over (
        partition by compound order by year
    ) as yoy_longevity_delta

from by_year_compound
where compound in ('SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET')
order by year, compound
