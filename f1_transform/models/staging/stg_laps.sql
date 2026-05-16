with source as (
    select * from {{ source('raw', 'fastf1_laps') }}
),
-- Pirelli não publica composto físico (C1–C5) via FastF1: a coluna
-- CompoundName não existe na API. Mapeamento vem da seed manual
-- pirelli_compound_allocations (year, round_number, c_hard, c_medium, c_soft).
-- GPs sem allocation na seed têm compound_name = NULL — o mart
-- compound_physical_evolution filtra esses fora explicitamente.
allocations as (
    select * from {{ ref('pirelli_compound_allocations') }}
),
cleaned as (
    select
        s.year,
        s.round_number,
        s.event_name,
        -- circuit_key vindo do raw é OfficialEventName e muda por ano/patrocinador.
        -- event_name ("British Grand Prix", "Italian Grand Prix") é estável e captura
        -- a granularidade certa (track-level, incluindo casos como Sakhir vs Bahrain).
        s.event_name as circuit_key,
        s.driver,
        s.drivernumber,
        s.team,

        -- tempos
        s.laptime                                  as laptime_s,
        s.sector1time                              as s1_s,
        s.sector2time                              as s2_s,
        s.sector3time                              as s3_s,
        s.lapnumber::int                           as lap_number,

        -- pneus
        upper(coalesce(s.compound, 'UNKNOWN'))     as compound,       -- SOFT/MEDIUM/HARD
        -- compound_name (C1–C5) via JOIN com a seed. Fallback NULL quando
        -- (year, round) não está mapeado — explicitamente honesto, não usa
        -- o C_SOFT/C_MEDIUM/C_HARD que o load_fastf1.py gera (esses valores
        -- são placeholders sem significado físico).
        case
            when upper(s.compound) = 'HARD'   then a.c_hard
            when upper(s.compound) = 'MEDIUM' then a.c_medium
            when upper(s.compound) = 'SOFT'   then a.c_soft
            when upper(s.compound) in ('INTERMEDIATE','WET') then upper(s.compound)
            else null
        end                                        as compound_name,
        s.tyrelife::int                            as tyre_life,
        s.stint::int                               as stint,
        s.freshtyre::boolean                       as is_fresh_tyre,

        -- contexto
        s.trackstatus,
        s.pitintime                                as pit_in_s,
        s.pitouttime                               as pit_out_s,

        -- weather (alinhado por tempo na ingestão; NULL em rounds antigos
        -- ingeridos antes desta versão — re-ingestão necessária para popular)
        s.airtemp                                  as air_temp_c,
        s.tracktemp                                as track_temp_c,
        s.humidity                                 as humidity_pct,
        s.rainfall                                 as has_rain,

        s.fetch_time

    from source s
    left join allocations a
        on s.year = a.year
       and s.round_number = a.round_number
    where s.laptime is not null
      and s.laptime > 0
      and s.laptime < 300
      and s.compound not in ('UNKNOWN', '')
      -- TrackStatus = '1' significa pista verde (sem SC/VSC/yellow/red).
      -- Códigos FastF1: 1=clear, 2=yellow, 4=SC, 5=red, 6=VSC, 7=VSC ending.
      -- Para análise de degradação só voltas em verde fazem sentido — SC/VSC
      -- distorcem laptime sem relação com o pneu.
      and s.trackstatus = '1'
)
select * from cleaned
