from airflow.decorators import dag, task
from datetime import datetime

@task
def backfill_year(year: int):
    """Ingere uma temporada completa historicamente."""
    from load_fastf1 import main
    main(year=year)
    return year  # passa o ano para a próxima task (força sequência)

@dag(
    dag_id="f1_historical_backfill",
    start_date=datetime(2024, 1, 1),
    schedule_interval=None,
    catchup=False,
    tags=["f1", "backfill", "pirelli"],
)
def f1_historical_backfill():
    """
    Execução manual. Processa um ano por vez (sequencial) para
    evitar corrupção do cache do FastF1.
    """
    years = list(range(2014, 2027))  # 2014 → 2026

    # Cria chain sequencial: 2014 → 2015 → 2016 → ... → 2026
    tasks = [
        backfill_year.override(task_id=f"backfill_{year}")(year)
        for year in years
    ]

    # Força execução um por vez
    for i in range(len(tasks) - 1):
        tasks[i] >> tasks[i + 1]

f1_historical_backfill()
