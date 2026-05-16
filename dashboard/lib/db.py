"""Conexão e queries ao Postgres. Toda página deve importar daqui — nada
de instanciar engine em página."""
import pandas as pd
import streamlit as st
from sqlalchemy import create_engine

DB_URI = "postgresql+psycopg2://airflow:airflow@postgres:5432/f1"


@st.cache_resource
def get_engine():
    return create_engine(DB_URI)


@st.cache_data(ttl=300)
def query(sql: str) -> pd.DataFrame:
    return pd.read_sql(sql, get_engine())


def compounds_sql(lst) -> str:
    """Monta cláusula IN para compostos. Vazio → impossível
    (retorna uma string que casa com zero linhas)."""
    if not lst:
        return "''"
    return ",".join([f"'{c}'" for c in lst])
