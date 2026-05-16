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
        -- < 2 voltas restantes após o filtro de warm-up.
        --
        -- FILTER (tyre_life >= 3): descarta as 2 primeiras voltas do stint
        -- da regressão. Nessas voltas o laptime cai muito (carro com combustível
        -- cheio aquecendo, pneu ainda frio), o que produzia slopes negativos
        -- enganosos no agregado — a leitura "pneu fica mais rápido com a vida"
        -- era um artefato do warm-up. Após o filtro, deg_per_lap_s reflete só
        -- a fase de degradação real do stint.
        regr_slope(laptime_s, tyre_life) filter (where tyre_life >= 3) as deg_per_lap_s,

        -- qualidade do ajuste linear (0–1). R² baixo = stint errático.
        regr_r2(laptime_s, tyre_life)    filter (where tyre_life >= 3) as deg_fit_r2,

        -- weather agregada por stint (NULL em rounds antigos sem captura).
        -- Usar avg porque temperaturas variam ao longo de um stint de 20+ voltas.
        avg(track_temp_c)                as avg_track_temp_c,
        avg(air_temp_c)                  as avg_air_temp_c,
        avg(humidity_pct)                as avg_humidity_pct,
        bool_or(has_rain)                as had_rain

    from laps
    where tyre_life is not null
    group by 1,2,3,4,5,6,7,8
)
select * from stints
