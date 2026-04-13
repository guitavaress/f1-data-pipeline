from airflow.decorators import dag, task
from datetime import datetime
from cosmos import DbtTaskGroup, ProjectConfig
from cosmos.config import ProfileConfig
from sqlalchemy import create_engine, text

DB_URI = "postgresql+psycopg2://airflow:airflow@postgres:5432/f1"

# Ano corrente — atualize quando virar temporada
CURRENT_YEAR = 2026

@task
def create_schemas():
    engine = create_engine(DB_URI)
    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS raw;"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS staging;"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS marts;"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS dbt_airflow;"))
        conn.commit()
    print("Esquemas criados ou já existentes.")

@task
def check_new_data() -> bool:
    """
    Retorna True se há corridas novas para processar.
    A task seguinte só executa se True.
    """
    from load_fastf1 import get_processed_rounds
    import fastf1
    import pandas as pd

    processed_rounds = get_processed_rounds(CURRENT_YEAR)

    schedule = fastf1.get_event_schedule(CURRENT_YEAR)
    races = schedule[schedule['EventFormat'] != 'testing']

    new_races = races[
        (~races['RoundNumber'].isin(processed_rounds)) &
        (races['EventDate'] < pd.Timestamp.now())
    ]

    print(f"Ano: {CURRENT_YEAR}")
    print(f"Rounds processados: {sorted(processed_rounds)}")
    print(f"Corridas novas disponíveis: {len(new_races)}")

    if not new_races.empty:
        print(f"A processar: {new_races['EventName'].tolist()}")

    return len(new_races) > 0

@task
def ingest_fastf1_data(has_new_data: bool):
    """
    Só ingere se check_new_data retornou True.
    """
    if not has_new_data:
        print("Nenhuma corrida nova — ingestão pulada.")
        return False

    from load_fastf1 import main
    main(year=CURRENT_YEAR)
    return True

@task
def should_run_dbt(ingested: bool):
    """
    Passa o sinal para o dbt só se houve ingestão.
    """
    if not ingested:
        print("Sem dados novos — dbt pulado.")
        raise Exception("skip")  # interrompe sem marcar como falha
    print("Dados novos ingeridos — executando dbt.")

dbt_project_config = ProjectConfig(
    dbt_project_path="/opt/airflow/f1_transform",
)

profile_config = ProfileConfig(
    profile_name="f1_transform",
    target_name="dev",
    profiles_yml_filepath="/opt/airflow/f1_transform/profiles.yml"
)

@dag(
    dag_id="f1_pipeline",
    start_date=datetime(2024, 1, 1),
    schedule_interval="@daily",
    catchup=False,
    doc_md="""
    # Pipeline F1 — Incremental

    **Fluxo:**
    1. Cria schemas
    2. Verifica se há corridas novas no calendário
    3. Se sim → ingere; se não → para aqui
    4. Se ingeriu → roda dbt; se não → para aqui
    """,
    tags=["f1", "elt", "incremental"],
)
def f1_pipeline():
    create_schema_task = create_schemas()
    check_task         = check_new_data()
    ingest_task        = ingest_fastf1_data(check_task)
    gate_task          = should_run_dbt(ingest_task)

    transform_task = DbtTaskGroup(
        group_id="dbt_transform",
        project_config=dbt_project_config,
        profile_config=profile_config,
    )

    create_schema_task >> check_task >> ingest_task >> gate_task >> transform_task

f1_pipeline()
