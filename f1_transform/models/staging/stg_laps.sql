with source as (
    select * from {{ source('raw', 'fastf1_laps') }}
),
cleaned as (
    select
        year,
        round_number,
        event_name,
        circuit_key,
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
        upper(coalesce(compound, 'UNKNOWN'))       as compound,
        tyrelife::int                              as tyre_life,
        stint::int                                 as stint,
        freshtyre::boolean                         as is_fresh_tyre,

        -- contexto
        trackstatus,
        pitintime                                  as pit_in_s,
        pitouttime                                 as pit_out_s,
        fetch_time

    from source
    where laptime is not null
      and laptime > 0
      and laptime < 300   -- remove outliers absurdos (safety car, red flag etc)
      and compound not in ('UNKNOWN', '')
)
select * from cleaned
