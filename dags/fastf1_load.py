from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime, timedelta

default_args = {
    "owner": "airflow",
    "retries": 1,
    "retry_delay": timedelta(minutes=5),
}

# Função que será executada pela DAG
def run_fastf1_ingestion():
    from load_fastf1 import main
    main()

with DAG(
    dag_id="fastf1_to_postgres",
    default_args=default_args,
    description="Ingesta dados do FastF1 no Postgres",
    schedule_interval="@daily",
    start_date=datetime(2024, 1, 1),
    catchup=False,
    tags=["fastf1", "f1"],
) as dag:

    ingest_task = PythonOperator(
        task_id="ingest_fastf1_data",
        python_callable=run_fastf1_ingestion
    )

    ingest_task
