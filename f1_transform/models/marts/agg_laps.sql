with laps as (
  select * from {{ ref('stg_laps') }}
)
select
    driver,
    team,
    count(*) as total_laps,
    avg(laptime) as avg_laptime_seconds
from laps
group by 1, 2