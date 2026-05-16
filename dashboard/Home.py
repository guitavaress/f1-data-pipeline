"""Entry point do dashboard Pirelli Analytics. Substitui o antigo app.py monolítico.

As páginas individuais ficam em `pages/` e são detectadas automaticamente pelo
Streamlit (multi-page nativo). Este arquivo é a Visão Geral."""
import plotly.express as px
import streamlit as st

from lib.components import filter_sidebar, kpi_card, empty_state
from lib.db import compounds_sql, query
from lib.theme import COMPOUND_COLORS, PLOTLY_TEMPLATE, inject_fonts

st.set_page_config(
    page_title="F1 Pirelli Analytics",
    page_icon="🏎️",
    layout="wide",
    initial_sidebar_state="expanded",
)

inject_fonts()

# ── Sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.image(
        "https://upload.wikimedia.org/wikipedia/en/thumb/f/f2/New_era_pirelli_logo.svg/320px-New_era_pirelli_logo.svg.png",
        width=160,
    )
    st.markdown("## Pirelli Analytics")
    st.markdown("---")

filters = filter_sidebar("global")
year_range = filters["year_range"]
compounds  = filters["compounds"]

# ── Conteúdo ──────────────────────────────────────────────────────────────────
st.title("🏎️ Pirelli Tyre Analytics — F1 2014–2026")
st.caption("Análise baseada em dados reais do FastF1 · Schema medallion · dbt + Airflow")

col1, col2, col3, col4 = st.columns(4)

total_stints  = query("SELECT count(*) AS n FROM marts.tyre_degradation")
years_covered = query("SELECT count(DISTINCT year) AS n FROM marts.compound_evolution")
circuits      = query("SELECT count(DISTINCT circuit_key) AS n FROM marts.circuit_tyre_profile")
compounds_cnt = query("SELECT count(DISTINCT compound) AS n FROM marts.compound_evolution")

with col1:
    kpi_card("Stints analisados", f"{int(total_stints['n'][0]):,}")
with col2:
    kpi_card("Temporadas",        int(years_covered['n'][0]))
with col3:
    kpi_card("Circuitos",         int(circuits['n'][0]))
with col4:
    kpi_card("Compostos",         int(compounds_cnt['n'][0]))

st.markdown("---")

if not compounds:
    empty_state("Selecione ao menos um composto",
                "Use o painel lateral para escolher SOFT, MEDIUM ou HARD.")
    st.stop()

df = query(f"""
    SELECT year, compound, avg_deg_s, avg_stint_laps
    FROM marts.compound_evolution
    WHERE year BETWEEN {year_range[0]} AND {year_range[1]}
      AND compound IN ({compounds_sql(compounds)})
    ORDER BY year, compound
""")

if df.empty:
    empty_state("Sem dados para a combinação selecionada")
else:
    fig = px.line(
        df, x="year", y="avg_deg_s", color="compound",
        color_discrete_map=COMPOUND_COLORS,
        title="Degradação média global por composto (s/volta)",
        markers=True,
        labels={"avg_deg_s": "Degradação (s/volta)", "year": "Ano"},
    )
    fig.update_layout(**PLOTLY_TEMPLATE)
    st.plotly_chart(fig, use_container_width=True)

    fig2 = px.bar(
        df, x="year", y="avg_stint_laps", color="compound",
        color_discrete_map=COMPOUND_COLORS, barmode="group",
        title="Longevidade média dos stints por ano",
        labels={"avg_stint_laps": "Voltas por stint", "year": "Ano"},
    )
    fig2.update_layout(**PLOTLY_TEMPLATE)
    st.plotly_chart(fig2, use_container_width=True)

st.markdown("---")
st.caption(
    "📌 **Aviso metodológico**: SOFT/MEDIUM/HARD mudou de significado em 2019. "
    "Para uma comparação física honesta da evolução Pirelli, use a página "
    "**📈 Pirelli Report Card** (C1–C5)."
)
