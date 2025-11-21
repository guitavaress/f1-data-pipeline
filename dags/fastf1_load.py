from airflow.decorators import dag, task
from airflow.operators.python import BranchPythonOperator
from datetime import datetime
from cosmos import DbtTaskGroup, ProjectConfig
from cosmos.config import ProfileConfig
from sqlalchemy import create_engine, text

# Configuration for the database connection
DB_URI = "postgresql+psycopg2://airflow:airflow@postgres:5432/f1"

@task
def create_schemas():
    """
    Cria os esquemas necessários no banco de dados se não existirem.
    """
    engine = create_engine(DB_URI)
    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS raw;"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS staging;"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS marts;"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS dbt_airflow;"))
        print("Esquemas criados ou já existentes.")

@task
def check_new_data():
    """
    Verifica se há dados novos para processar.
    """
    from load_fastf1 import get_processed_rounds
    import fastf1
    import pandas as pd
    
    year = 2025
    processed_rounds = get_processed_rounds(year)
    
    schedule = fastf1.get_event_schedule(year)
    races = schedule[schedule['EventFormat'] != 'testing']
    
    # Filtra corridas que já aconteceram mas ainda não foram processadas
    new_races = races[
        (~races['RoundNumber'].isin(processed_rounds)) & 
        (races['EventDate'] < pd.Timestamp.now())
    ]
    
    has_new_data = len(new_races) > 0
    
    print(f"Rounds processados: {sorted(processed_rounds)}")
    print(f"Corridas novas disponíveis: {len(new_races)}")
    
    if has_new_data:
        print(f"Corridas a processar: {new_races['EventName'].tolist()}")
    
    return has_new_data

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
    schedule_interval="@daily",  # Roda diariamente para pegar novas corridas
    catchup=False,
    doc_md="""
    # Pipeline F1 - Incremental
    
    Pipeline completo para ingestão e transformação de dados da F1.
    
    **Comportamento Incremental:**
    - Verifica corridas já processadas no banco
    - Processa apenas corridas novas que já aconteceram
    - Pula corridas futuras automaticamente
    
    **Fluxo:**
    1. Cria schemas necessários
    2. Verifica se há dados novos
    3. Ingere apenas corridas novas
    4. Executa transformações dbt
    """,
    tags=["f1", "elt", "incremental"],
)
def f1_pipeline():
    # Task to ensure the schema exists
    create_schema_task = create_schemas()
    
    # Task to check if there's new data
    check_task = check_new_data()

    # Task 1: Ingestion (só roda se houver dados novos)
    ingestion_task = ingest_fastf1_data()

    # Task 2: dbt transformation
    transform_task = DbtTaskGroup(
        group_id="dbt_transform",
        project_config=dbt_project_config,
        profile_config=profile_config,
    )

    # Set the execution order
    create_schema_task >> check_task >> ingestion_task >> transform_task

f1_pipeline()
