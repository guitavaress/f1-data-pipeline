from airflow.decorators import dag, task
from datetime import datetime

@task
def backfill_year(year: int):
    """Ingere uma temporada completa historicamente."""
    from load_fastf1 import main
    main(year=year)

@dag(
    dag_id="f1_historical_backfill",
    start_date=datetime(2024, 1, 1),
    schedule_interval=None,   # execução manual
    catchup=False,
    tags=["f1", "backfill", "pirelli"],
)
def f1_historical_backfill():
    """
    Executa manualmente. Processa 2014–2024 em paralelo por ano.
    Cada task é idempotente — pula rounds já existentes no raw.
    """
    years = list(range(2014, 2025))
    for year in years:
        backfill_year.override(task_id=f"backfill_{year}")(year)

f1_historical_backfill()
