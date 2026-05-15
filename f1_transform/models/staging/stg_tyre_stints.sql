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

        -- range bruto entre 1ª e última volta (mantido só para referência/debug)
        max(laptime_s) - min(laptime_s) as raw_degradation_s,

        -- DEGRADAÇÃO POR VOLTA: coeficiente angular da regressão linear
        -- laptime ~ tyre_life dentro do stint. Robusto a outliers (uma volta
        -- com tráfego ou erro do piloto não vira "degradação"). NULL quando há
        -- < 2 voltas ou nenhuma variação de tyre_life — interpretação honesta.
        regr_slope(laptime_s, tyre_life) as deg_per_lap_s,

        -- qualidade do ajuste linear (0–1). R² baixo = stint errático.
        regr_r2(laptime_s, tyre_life)    as deg_fit_r2

    from laps
    where tyre_life is not null
    group by 1,2,3,4,5,6,7,8
)
select * from stints
