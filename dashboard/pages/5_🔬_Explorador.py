"""Explorador: SQL livre contra o schema marts."""
import plotly.express as px
import streamlit as st

from lib.db import query
from lib.theme import PLOTLY_TEMPLATE, inject_fonts

st.set_page_config(page_title="Explorador", page_icon="🔬", layout="wide")
inject_fonts()

st.title("🔬 Explorador de Dados Brutos")
st.caption("Query direta ao schema marts.")

DEFAULT_SQL = """
SELECT year, compound,
       round(avg(avg_deg_per_lap_s)::numeric, 4) AS deg_medio,
       round(avg(avg_stint_length)::numeric, 1)  AS stint_medio
FROM marts.tyre_degradation
GROUP BY 1, 2
ORDER BY 1, 2
"""

sql = st.text_area("SQL", value=DEFAULT_SQL, height=180)

if st.button("▶ Executar"):
    try:
        result = query(sql)
    except Exception as e:
        st.error(f"Erro: {e}")
    else:
        st.dataframe(result, use_container_width=True)
        if len(result.columns) >= 3:
            try:
                fig = px.bar(
                    result,
                    x=result.columns[0],
                    y=result.columns[2],
                    color=result.columns[1],
                )
                fig.update_layout(**PLOTLY_TEMPLATE)
                st.plotly_chart(fig, use_container_width=True)
            except Exception:
                pass
