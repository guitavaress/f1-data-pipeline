with source_data as (
  select * from {{ source('raw', 'fastf1_laps') }}
)
select
    driver,
    drivernumber,
    team,
    laptime,
    trackstatus,
    fetch_time as fetched_at
from source_data