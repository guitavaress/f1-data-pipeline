import fastf1
import pandas as pd
from sqlalchemy import create_engine, text
from datetime import datetime

# Configuração do cache do FastF1 (dentro do container)
fastf1.Cache.enable_cache("/opt/airflow/cache")

# Conexão com o Postgres (usuário:senha@host:porta/banco)
DB_URI = "postgresql+psycopg2://airflow:airflow@postgres:5432/f1"
engine = create_engine(DB_URI)

def get_processed_rounds(year):
    """
    Retorna os round_numbers que já foram processados para um determinado ano.
    """
    query = text("""
        SELECT DISTINCT round_number 
        FROM raw.fastf1_laps 
        WHERE EXTRACT(YEAR FROM fetch_time) = :year
        ORDER BY round_number
    """)
    
    try:
        with engine.connect() as conn:
            result = conn.execute(query, {"year": year})
            processed_rounds = [row[0] for row in result]
            return set(processed_rounds)
    except Exception as e:
        print(f"Erro ao consultar rounds processados: {e}")
        return set()

def main():
    year = 2025
    
    # Pega os rounds já processados
    processed_rounds = get_processed_rounds(year)
    print(f"Rounds já processados em {year}: {sorted(processed_rounds)}")
    
    # Pega o calendário completo de 2025
    schedule = fastf1.get_event_schedule(year)
    races = schedule[schedule['EventFormat'] != 'testing']
    
    print(f"\nCorridas encontradas em {year}: {len(races)}")
    
    # Filtra apenas corridas que ainda não foram processadas
    new_races = races[~races['RoundNumber'].isin(processed_rounds)]
    
    if len(new_races) == 0:
        print(f"Nenhuma corrida nova para processar em {year}.")
        return
    
    print(f"Corridas novas para processar: {len(new_races)}")
    print(new_races[['RoundNumber', 'EventName', 'EventDate', 'Location']])
    
    # Processar apenas as corridas novas
    for idx, race in new_races.iterrows():
        round_number = race['RoundNumber']
        event_name = race['EventName']
        event_date = race['EventDate']
        
        # Verifica se a corrida já aconteceu (data passou)
        if pd.Timestamp.now() < event_date:
            print(f"\nPulando {event_name} (Round {round_number}) - ainda não aconteceu (data: {event_date.date()})")
            continue
        
        print(f"\nProcessando {event_name} (Round {round_number})...")
        
        try:
            # Pega a sessão de corrida (Race)
            session = fastf1.get_session(year, round_number, 'R')
            session.load()
            
            laps = session.laps
            
            if len(laps) == 0:
                print(f"Nenhuma volta encontrada para {event_name}")
                continue
            
            df = laps[["Driver", "DriverNumber", "Team", "LapTime", "TrackStatus"]].copy()
            df["fetch_time"] = datetime.utcnow()
            df["round_number"] = round_number
            df["event_name"] = event_name
            df["year"] = year
            
            df.columns = df.columns.str.lower()
            
            # Converte LapTime para segundos
            df["laptime"] = df["laptime"].dt.total_seconds()
            
            # Salvando no novo esquema 'raw'
            df.to_sql("fastf1_laps", engine, schema="raw", if_exists="append", index=False)
            print(f"✓ {len(df)} voltas salvas de {event_name}!")
            
        except Exception as e:
            print(f"✗ Erro ao processar {event_name}: {e}")
            continue
    
    print(f"\n{'='*50}")
    print(f"Processamento concluído!")
    print(f"{'='*50}")

if __name__ == "__main__":
    main()