-- Perfil de degradação por composto × faixa de temperatura de pista.
--
-- Granularidade: (year, circuit_key, compound, temp_bucket).
-- Filtros: ignora stints sem leitura de track_temp_c (rounds antigos
-- ingeridos antes da captura de weather).
--
-- Buckets de 5°C — escolha pragmática: granularidade fina o suficiente pra
-- ver a diferença entre 25°C (típica de manhã) e 40°C (Singapura tarde),
-- larga o suficiente pra cada bucket ter N stints viável de comparar.

with stints as (
    select *
    from {{ ref('stg_tyre_stints') }}
    where avg_track_temp_c is not null
      and stint_length >= 5
      and compound in ('SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET')
),
bucketed as (
    select
        *,
        case
            when avg_track_temp_c < 20 then '<20'
            when avg_track_temp_c < 25 then '20-25'
            when avg_track_temp_c < 30 then '25-30'
            when avg_track_temp_c < 35 then '30-35'
            when avg_track_temp_c < 40 then '35-40'
            else                            '>40'
        end as temp_bucket
    from stints
)
select
    year,
    circuit_key,
    compound,
    temp_bucket,

    count(*)                                  as stints_in_bucket,
    round(avg(deg_per_lap_s)::numeric, 4)     as avg_deg_per_lap_s,
    round(avg(stint_length)::numeric, 1)      as avg_stint_length,
    round(avg(avg_track_temp_c)::numeric, 1)  as avg_track_temp_c

from bucketed
group by 1, 2, 3, 4
order by year, circuit_key, compound, temp_bucket
