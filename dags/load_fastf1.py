import fastf1
import pandas as pd
from sqlalchemy import create_engine
from datetime import datetime

# Configuração do cache do FastF1 (dentro do container)
fastf1.Cache.enable_cache("/opt/airflow/cache")

# Conexão com o Postgres (usuário:senha@host:porta/banco)
DB_URI = "postgresql+psycopg2://airflow:airflow@postgres:5432/f1"
engine = create_engine(DB_URI)

def main():
    session = fastf1.get_session(2024, 'Monaco', 'Q')
    session.load()

    laps = session.laps
    df = laps[["Driver", "DriverNumber", "Team", "LapTime", "TrackStatus"]].copy()
    df["fetch_time"] = datetime.utcnow()

    df.columns = df.columns.str.lower()

    # Converte LapTime para segundos
    df["laptime"] = df["laptime"].dt.total_seconds()

    # Salvando no novo esquema 'raw'
    df.to_sql("fastf1_laps", engine, schema="raw", if_exists="append", index=False)
    print(f"{len(df)} voltas salvas no banco no esquema 'raw'!")

if __name__ == "__main":
    main()