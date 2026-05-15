from airflow.decorators import dag, task
from airflow.exceptions import AirflowSkipException
from datetime import datetime
from cosmos import DbtTaskGroup, ProjectConfig
from cosmos.config import ProfileConfig
from sqlalchemy import create_engine, text

# ── Configuração ──────────────────────────────────────────────────────────────
DB_URI = "postgresql+psycopg2://airflow:airflow@postgres:5432/f1"

# Atualize para 2027 quando a temporada virar
CURRENT_YEAR = datetime.now().year

# ── dbt ───────────────────────────────────────────────────────────────────────
dbt_project_config = ProjectConfig(
    dbt_project_path="/opt/airflow/f1_transform",
)

profile_config = ProfileConfig(
    profile_name="f1_transform",
    target_name="dev",
    profiles_yml_filepath="/opt/airflow/f1_transform/profiles.yml"
)

# ── Tasks ─────────────────────────────────────────────────────────────────────
@task
def create_schemas():
    """Cria os esquemas necessários e garante migração de schema do raw."""
    engine = create_engine(DB_URI)
    with engine.begin() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS raw;"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS staging;"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS marts;"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS dbt_airflow;"))
    print("Esquemas criados ou já existentes.")

    # Migração idempotente: garante colunas de weather em raw.fastf1_laps.
    # Isso permite que dbt rode contra raw.fastf1_laps sem precisar esperar
    # a próxima ingestão (colunas ficam NULL para rounds antigos).
    from load_fastf1 import ensure_weather_columns
    ensure_weather_columns()


@task
def check_new_data() -> bool:
    """
    Verifica se há corridas novas para processar.
    Retorna True se houver, False caso contrário.
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
    print(f"Rounds já processados: {sorted(processed_rounds)}")
    print(f"Corridas novas disponíveis: {len(new_races)}")

    if not new_races.empty:
        print(f"A processar: {new_races['EventName'].tolist()}")

    return len(new_races) > 0


@task
def ingest_fastf1_data(has_new_data: bool):
    """
    Ingere corridas novas se houver.
    Caso não haja, apenas loga e segue — o dbt vai rodar de qualquer forma.
    """
    if not has_new_data:
        print("Nenhuma corrida nova — ingestão pulada. dbt vai rodar mesmo assim.")
        return

    from load_fastf1 import main
    main(year=CURRENT_YEAR)


# ── DAG ───────────────────────────────────────────────────────────────────────
@dag(
    dag_id="f1_pipeline",
    start_date=datetime(2024, 1, 1),
    schedule_interval="@daily",
    catchup=False,
    doc_md="""
    # Pipeline F1 — Incremental

    Roda diariamente. Verifica se há corridas novas e ingere se houver.
    O dbt **sempre** roda ao final, garantindo que o backfill e
    reprocessamentos manuais sejam refletidos nos marts.

    **Fluxo:**
    1. Cria schemas (idempotente)
    2. Verifica corridas novas no calendário FastF1
    3. Ingere se houver novas — pula silenciosamente se não houver
    4. Roda dbt (sempre)
    """,
    tags=["f1", "elt", "incremental"],
)
def f1_pipeline():
    create_schema_task = create_schemas()
    check_task         = check_new_data()
    ingest_task        = ingest_fastf1_data(check_task)

    transform_task = DbtTaskGroup(
        group_id="dbt_transform",
        project_config=dbt_project_config,
        profile_config=profile_config,
    )

    create_schema_task >> check_task >> ingest_task >> transform_task


f1_pipeline()
