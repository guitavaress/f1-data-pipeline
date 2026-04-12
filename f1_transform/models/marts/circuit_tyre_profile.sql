-- Perfil de uso de pneus por circuito
-- Identifica quais circuitos são mais agressivos com os pneus
with stints as (
    select * from {{ ref('stg_tyre_stints') }}
    where year >= 2018   -- era moderna das estratégias
      and stint_length >= 5
),
profile as (
    select
        circuit_key,
        event_name,
        compound,
        count(distinct year)                            as years_sampled,
        round(avg(deg_per_lap_s)::numeric, 4)           as avg_deg_s,
        round(avg(stint_length)::numeric, 1)            as avg_stint_laps,

        -- % de uso desse composto nesse circuito
        count(*) * 100.0 / sum(count(*)) over (
            partition by circuit_key
        )                                               as usage_pct

    from stints
    group by 1, 2, 3
)
select
    *,
    case
        when avg_deg_s > 0.3  then 'alta degradação'
        when avg_deg_s > 0.15 then 'média degradação'
        else 'baixa degradação'
    end as degradation_tier
from profile
order by circuit_key, avg_deg_s desc
