from airflow.decorators import dag, task
from datetime import datetime
from cosmos import DbtTaskGroup, ProjectConfig
from cosmos.config import ProfileConfig
from sqlalchemy import create_engine

# Configuration for the database connection
DB_URI = "postgresql+psycopg2://airflow:airflow@postgres:5432/f1"

# Task to create the schema if it doesn't exist
@task
def create_schemas():
    """
    Cria os esquemas necessários no banco de dados se não existirem.
    """
    engine = create_engine(DB_URI)
    with engine.connect() as conn:
        conn.execute("CREATE SCHEMA IF NOT EXISTS raw;")
        conn.execute("CREATE SCHEMA IF NOT EXISTS staging;")
        conn.execute("CREATE SCHEMA IF NOT EXISTS marts;")
        conn.execute("CREATE SCHEMA IF NOT EXISTS dbt_airflow;") # Adicione esta linha
        print("Esquemas criados ou já existentes.")

@task
def ingest_fastf1_data():
    """
    Executes the FastF1 data ingestion script.
    """
    from load_fastf1 import main
    main()

# Your existing dbt configurations
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
    doc_md="Pipeline completo para ingestão e transformação de dados da F1.",
    tags=["f1", "elt"],
)
def f1_pipeline():
    # Task to ensure the schema exists
    create_schema_task = create_schemas()

    # Task 1: Ingestion
    ingestion_task = ingest_fastf1_data()

    # Task 2: dbt transformation
    transform_task = DbtTaskGroup(
        group_id="dbt_transform",
        project_config=dbt_project_config,
        profile_config=profile_config,
    )

    # Set the execution order: create schema -> ingest -> transform
    create_schema_task >> ingestion_task >> transform_task

f1_pipeline()