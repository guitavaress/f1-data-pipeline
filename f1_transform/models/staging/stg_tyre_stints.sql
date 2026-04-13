-- Agrega cada stint de cada piloto em cada corrida
with laps as (
    select * from {{ ref('stg_laps') }}
),
stints as (
    select
        year,
        round_number,
        event_name,
        circuit_key,
        driver,
        team,
        stint,
        compound,
        max(compound_name) as compound_name,   -- ← NOVO (é o mesmo dentro do stint)
        min(lap_number)    as first_lap,
        max(lap_number)             as last_lap,
        max(tyre_life)              as stint_length,
        count(*)                    as laps_in_stint,
        min(laptime_s)              as best_lap_s,
        avg(laptime_s)              as avg_lap_s,

        -- degradação: diferença de tempo entre a 1ª e a última volta do stint
        max(laptime_s) - min(laptime_s) as raw_degradation_s,

        -- taxa de degradação por volta
        case
            when max(tyre_life) > 1
            then (max(laptime_s) - min(laptime_s)) / nullif(max(tyre_life) - 1, 0)
            else 0
        end as deg_per_lap_s

    from laps
    where tyre_life is not null
    group by 1,2,3,4,5,6,7,8
)
select * from stints
