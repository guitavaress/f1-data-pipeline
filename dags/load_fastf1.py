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
    session = fastf1.get_session(2024, 'Monaco', 'Q')  # GP de Mônaco 2024 - Quali
    session.load()

    laps = session.laps
    df = laps[["Driver", "Team", "LapTime", "TrackStatus"]].copy()
    df["fetch_time"] = datetime.utcnow()

    # Converte LapTime para segundos
    df["LapTime"] = df["LapTime"].dt.total_seconds()

    df.to_sql("fastf1_laps", engine, if_exists="append", index=False)
    print(f"{len(df)} voltas salvas no banco!")

if __name__ == "__main__":
    main()
