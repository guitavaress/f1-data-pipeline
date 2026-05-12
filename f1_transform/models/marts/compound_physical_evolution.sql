-- Evolução do COMPOSTO FÍSICO Pirelli (C1–C5) ao longo dos anos.
--
-- Esta é a visão metodologicamente correta para responder
-- "a Pirelli melhorou os pneus?" — comparamos C3 com C3 entre anos,
-- não SOFT com SOFT (que pode ter sido C2 num ano e C4 no outro).
--
-- Restringe-se a 2018+ (introdução do sistema C1–C5) e descarta valores
-- que vêm do fallback de load_fastf1.py (prefixo "C_") porque não são
-- mensurações físicas, apenas mapeamento da categoria.

with stints as (
    select *
    from {{ ref('stg_tyre_stints') }}
    where stint_length >= 3
      and year >= 2018
      and compound_name in ('C1', 'C2', 'C3', 'C4', 'C5')
),
by_year_physical as (
    select
        year,
        compound_name,

        count(distinct event_name)                  as races_used,
        count(*)                                    as total_stints,

        -- degradação global por ano e composto físico
        round(avg(deg_per_lap_s)::numeric, 4)       as avg_deg_s,
        round(stddev(deg_per_lap_s)::numeric, 4)    as stddev_deg_s,

        -- longevidade
        round(avg(stint_length)::numeric, 1)        as avg_stint_laps,
        max(stint_length)                           as max_stint_laps,

        -- ritmo
        round(avg(avg_lap_s)::numeric, 3)           as avg_race_pace_s,
        round(avg(raw_degradation_s)::numeric, 3)   as avg_total_deg_s

    from stints
    group by 1, 2
)
select
    *,
    -- YoY no mesmo composto físico (a comparação que de fato faz sentido)
    avg_deg_s - lag(avg_deg_s) over (
        partition by compound_name order by year
    ) as yoy_deg_improvement,

    avg_stint_laps - lag(avg_stint_laps) over (
        partition by compound_name order by year
    ) as yoy_longevity_delta
from by_year_physical
order by year, compound_name
