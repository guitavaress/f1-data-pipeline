from airflow.decorators import dag, task
from datetime import datetime
from sqlalchemy import create_engine, text

DB_URI = "postgresql+psycopg2://airflow:airflow@postgres:5432/f1"


@task
def create_schemas():
    """Cria schemas e garante migração de colunas de weather.

    Idempotente. Replica o setup que o f1_pipeline faz para que o backfill
    funcione mesmo se for a PRIMEIRA DAG a rodar (sem o pipeline daily ter
    criado o schema antes). Sem isso, todas as ingestões falham com
    'schema "raw" does not exist' — o erro fica engolido pelo except
    silencioso do load_session, e o backfill termina como success
    mas sem nenhum dado no banco."""
    engine = create_engine(DB_URI)
    with engine.begin() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS raw;"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS staging;"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS marts;"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS dbt_airflow;"))
    print("Esquemas criados ou já existentes.")

    from load_fastf1 import ensure_weather_columns
    ensure_weather_columns()


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
    setup = create_schemas()

    years = list(range(2014, 2027))  # 2014 → 2026

    # Cria chain sequencial: 2014 → 2015 → 2016 → ... → 2026
    tasks = [
        backfill_year.override(task_id=f"backfill_{year}")(year)
        for year in years
    ]

    # setup → 2014, depois um por vez
    setup >> tasks[0]
    for i in range(len(tasks) - 1):
        tasks[i] >> tasks[i + 1]


f1_historical_backfill()
