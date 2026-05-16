"""Degradação por Circuito — análise por composto × ano para um único GP."""
import plotly.express as px
import streamlit as st

from lib.components import empty_state, filter_sidebar, safe_dataframe
from lib.db import compounds_sql, query
from lib.theme import COMPOUND_COLORS, PLOTLY_TEMPLATE, inject_fonts

st.set_page_config(page_title="Degradação por Circuito", page_icon="📉", layout="wide")
inject_fonts()

filters = filter_sidebar("by_circuit")
year_range  = filters["year_range"]
compounds   = filters["compounds"]
circuit_key = filters["circuit_key"]
circuit_display = filters["circuit_display"]

st.title(f"📉 Degradação por Circuito — {circuit_display}")

if year_range is None or not compounds:
    empty_state("Filtros incompletos",
                "Selecione um circuito com dados e ao menos um composto.")
    st.stop()

df = query(f"""
    SELECT year, compound, compound_name,
           avg_deg_per_lap_s, avg_pace_s, avg_stint_length, yoy_deg_delta
    FROM marts.tyre_degradation
    WHERE circuit_key = '{circuit_key.replace("'", "''")}'
      AND year BETWEEN {year_range[0]} AND {year_range[1]}
      AND compound IN ({compounds_sql(compounds)})
    ORDER BY year, compound
""")

if df.empty:
    empty_state(
        "Combinação sem dados",
        "Composto não usado neste GP nos anos selecionados — tente outro range.",
    )
    st.stop()

if "compound_name" in df.columns:
    # cast pra str + fillna evita TypeError quando compound_name é NULL
    # (rounds fora da seed Pirelli — anos antes de 2023 / depois de 2024)
    cn = df["compound_name"].fillna("?").astype(str)
    df["compound_label"] = df["compound"].astype(str) + " (" + cn + ")"

col1, col2 = st.columns(2)

with col1:
    fig = px.line(
        df, x="year", y="avg_deg_per_lap_s", color="compound",
        color_discrete_map=COMPOUND_COLORS, markers=True,
        custom_data=["compound_name"] if "compound_name" in df.columns else [],
        title=f"Degradação — {circuit_display}",
        labels={"avg_deg_per_lap_s": "Deg. (s/volta)", "year": "Ano"},
    )
    if "compound_name" in df.columns:
        fig.update_traces(
            hovertemplate=(
                "<b>%{fullData.name}</b><br>"
                "Ano: %{x}<br>"
                "Deg: %{y:.4f}s<br>"
                "Composto físico: %{customdata[0]}<extra></extra>"
            )
        )
    fig.update_layout(**PLOTLY_TEMPLATE)
    st.plotly_chart(fig, use_container_width=True)

with col2:
    df_yoy = df.dropna(subset=["yoy_deg_delta"])
    if df_yoy.empty:
        st.info("Sem dados YoY (precisa de pelo menos 2 anos consecutivos).")
    else:
        fig2 = px.bar(
            df_yoy, x="year", y="yoy_deg_delta", color="compound",
            color_discrete_map=COMPOUND_COLORS, barmode="group",
            title="Variação YoY (negativo = melhoria)",
            labels={"yoy_deg_delta": "Δ deg (s/volta)", "year": "Ano"},
        )
        fig2.add_hline(y=0, line_dash="dot", line_color="gray")
        fig2.update_layout(**PLOTLY_TEMPLATE)
        st.plotly_chart(fig2, use_container_width=True)

safe_dataframe(df, {
    "compound_name":     st.column_config.TextColumn("Composto físico"),
    "avg_deg_per_lap_s": st.column_config.NumberColumn("Deg/volta (s)",   format="%.4f"),
    "avg_pace_s":        st.column_config.NumberColumn("Ritmo médio (s)", format="%.3f"),
    "avg_stint_length":  st.column_config.NumberColumn("Stint médio",     format="%.1f"),
    "yoy_deg_delta":     st.column_config.NumberColumn("Δ YoY (s)",       format="%.4f"),
})
