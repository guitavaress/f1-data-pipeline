import fastf1
import pandas as pd
from sqlalchemy import create_engine, text
from datetime import datetime

fastf1.Cache.enable_cache("/opt/airflow/cache")
DB_URI = "postgresql+psycopg2://airflow:airflow@postgres:5432/f1"
engine = create_engine(DB_URI)

# Colunas adicionadas: compound, tyrelife, stint, freshtyre
LAP_COLUMNS = [
    "Driver", "DriverNumber", "Team",
    "LapTime", "LapNumber", "TrackStatus",
    "Compound", "TyreLife", "Stint", "FreshTyre",   # ← NOVO
    "Sector1Time", "Sector2Time", "Sector3Time",     # ← NOVO
    "SpeedI1", "SpeedI2", "SpeedFL",                 # ← NOVO
    "PitOutTime", "PitInTime",                        # ← NOVO
]

def get_processed_rounds(year: int) -> set:
    query = text("""
        SELECT DISTINCT round_number
        FROM raw.fastf1_laps
        WHERE year = :year
    """)
    try:
        with engine.connect() as conn:
            result = conn.execute(query, {"year": year})
            return {row[0] for row in result}
    except Exception:
        return set()

def load_session(year: int, round_number: int, event_name: str):
    session = fastf1.get_session(year, round_number, 'R')
    session.load(laps=True, telemetry=False, weather=False, messages=False)
    laps = session.laps

    if laps is None or len(laps) == 0:
        print(f"  Sem voltas: {event_name}")
        return

    # Pega apenas as colunas que existem (FastF1 pode variar por ano)
    available = [c for c in LAP_COLUMNS if c in laps.columns]
    df = laps[available].copy()

    # Converte timedeltas para segundos
    for col in ["LapTime", "Sector1Time", "Sector2Time", "Sector3Time",
                "PitOutTime", "PitInTime"]:
        if col in df.columns:
            df[col] = pd.to_timedelta(df[col]).dt.total_seconds()

    df.columns = df.columns.str.lower()
    df["fetch_time"]    = datetime.utcnow()
    df["round_number"]  = round_number
    df["event_name"]    = event_name
    df["year"]          = year
    df["circuit_key"]   = session.event.get("OfficialEventName", event_name)

    # Normaliza compound para maiúsculas e remove nulos
    if "compound" in df.columns:
        df["compound"] = df["compound"].str.upper().fillna("UNKNOWN")

    df.to_sql("fastf1_laps", engine, schema="raw",
              if_exists="append", index=False)
    print(f"  ✓ {len(df)} voltas — {event_name} {year} (round {round_number})")

def main(year: int = 2025):
    processed = get_processed_rounds(year)
    schedule  = fastf1.get_event_schedule(year)
    races     = schedule[schedule['EventFormat'] != 'testing']
    new_races = races[~races['RoundNumber'].isin(processed)]

    for _, race in new_races.iterrows():
        if pd.Timestamp.now() < race['EventDate']:
            continue
        try:
            load_session(year, race['RoundNumber'], race['EventName'])
        except Exception as e:
            print(f"  ✗ Erro {race['EventName']}: {e}")

if __name__ == "__main__":
    main()
