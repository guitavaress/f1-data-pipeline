{{ config(materialized='table') }}
with raw as (
  select * from {{ source('public','fastf1_laps') }}
)
select
  drivernumber,
  laptime,
  sector1sessiontime + sector2sessiontime as sectors_sum,
  fetched_at
from raw