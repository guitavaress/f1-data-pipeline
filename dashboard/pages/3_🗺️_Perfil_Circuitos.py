"""Perfil de agressividade dos circuitos com pneus."""
import plotly.express as px
import streamlit as st

from lib.components import empty_state, filter_sidebar
from lib.db import compounds_sql, query
from lib.theme import DEG_SCALE, PLOTLY_TEMPLATE, TIER_COLORS, inject_fonts

st.set_page_config(page_title="Perfil de Circuitos", page_icon="🗺️", layout="wide")
inject_fonts()

filters = filter_sidebar("global")
compounds = filters["compounds"]

st.title("🗺️ Perfil de Agressividade — Circuitos")

if not compounds:
    empty_state("Selecione ao menos um composto")
    st.stop()

df = query(f"""
    SELECT circuit_key, event_name, compound,
           avg_deg_s, avg_stint_laps, usage_pct, degradation_tier
    FROM marts.circuit_tyre_profile
    WHERE compound IN ({compounds_sql(compounds)})
    ORDER BY avg_deg_s DESC
""")

if df.empty:
    empty_state("Sem dados para os compostos selecionados")
    st.stop()

pivot = df.pivot_table(
    index="event_name", columns="compound",
    values="avg_deg_s", aggfunc="mean",
).round(4)

fig = px.imshow(
    pivot,
    color_continuous_scale=DEG_SCALE,
    title="Heatmap de degradação — circuito × composto",
    labels={"color": "Deg (s/volta)"},
    aspect="auto",
)
fig.update_layout(**PLOTLY_TEMPLATE)
st.plotly_chart(fig, use_container_width=True)

col1, col2 = st.columns(2)

with col1:
    top5 = df.groupby("event_name")["avg_deg_s"].mean().nlargest(5).reset_index()
    fig2 = px.bar(
        top5, x="avg_deg_s", y="event_name", orientation="h",
        title="Top 5 circuitos mais agressivos",
        color="avg_deg_s", color_continuous_scale="Reds",
    )
    fig2.update_layout(**PLOTLY_TEMPLATE)
    st.plotly_chart(fig2, use_container_width=True)

with col2:
    tier_counts = df["degradation_tier"].value_counts().reset_index()
    fig3 = px.pie(
        tier_counts, values="count", names="degradation_tier",
        title="Distribuição por tier de degradação",
        color="degradation_tier",
        color_discrete_map=TIER_COLORS,
    )
    fig3.update_layout(**PLOTLY_TEMPLATE)
    st.plotly_chart(fig3, use_container_width=True)
