with source as (
    select * from {{ source('raw', 'fastf1_laps') }}
),
cleaned as (
    select
        year,
        round_number,
        event_name,
        -- circuit_key vindo do raw é OfficialEventName e muda por ano/patrocinador.
        -- event_name ("British Grand Prix", "Italian Grand Prix") é estável e captura
        -- a granularidade certa (track-level, incluindo casos como Sakhir vs Bahrain).
        event_name as circuit_key,
        driver,
        drivernumber,
        team,

        -- tempos
        laptime                                    as laptime_s,
        sector1time                                as s1_s,
        sector2time                                as s2_s,
        sector3time                                as s3_s,
        lapnumber::int                             as lap_number,

        -- pneus
        upper(coalesce(compound, 'UNKNOWN'))       as compound,       -- SOFT/MEDIUM/HARD
        upper(coalesce(compoundname, 'UNKNOWN'))   as compound_name,  -- C1/C2/C3/C4/C5 ← NOVO
        tyrelife::int                              as tyre_life,
        stint::int                                 as stint,
        freshtyre::boolean                         as is_fresh_tyre,

        -- contexto
        trackstatus,
        pitintime                                  as pit_in_s,
        pitouttime                                 as pit_out_s,

        -- weather (alinhado por tempo na ingestão; NULL em rounds antigos
        -- ingeridos antes desta versão — re-ingestão necessária para popular)
        airtemp                                    as air_temp_c,
        tracktemp                                  as track_temp_c,
        humidity                                   as humidity_pct,
        rainfall                                   as has_rain,

        fetch_time

    from source
    where laptime is not null
      and laptime > 0
      and laptime < 300
      and compound not in ('UNKNOWN', '')
      -- TrackStatus = '1' significa pista verde (sem SC/VSC/yellow/red).
      -- Códigos FastF1: 1=clear, 2=yellow, 4=SC, 5=red, 6=VSC, 7=VSC ending.
      -- Para análise de degradação só voltas em verde fazem sentido — SC/VSC
      -- distorcem laptime sem relação com o pneu.
      and trackstatus = '1'
)
select * from cleaned
