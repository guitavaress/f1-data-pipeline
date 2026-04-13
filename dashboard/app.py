import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from sqlalchemy import create_engine

# ── Configuração ──────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="F1 Pirelli Analytics",
    page_icon="🏎️",
    layout="wide",
    initial_sidebar_state="expanded",
)

DB_URI = "postgresql+psycopg2://airflow:airflow@postgres:5432/f1"

COMPOUND_COLORS = {
    "SOFT":         "#E8000D",
    "MEDIUM":       "#FFF200",
    "HARD":         "#EBEBEB",
    "INTERMEDIATE": "#39B54A",
    "WET":          "#0067FF",
}

@st.cache_resource
def get_engine():
    return create_engine(DB_URI)

@st.cache_data(ttl=300)
def query(sql: str) -> pd.DataFrame:
    return pd.read_sql(sql, get_engine())

# ── Sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.image("https://upload.wikimedia.org/wikipedia/en/thumb/f/f2/New_era_pirelli_logo.svg/320px-New_era_pirelli_logo.svg.png", width=160)
    st.markdown("## Pirelli Analytics")
    st.markdown("---")

    page = st.radio("Navegar", [
        "🏠 Visão Geral",
        "📉 Degradação por Circuito",
        "📈 Evolução Anual",
        "🗺️ Perfil de Circuitos",
        "🔬 Explorador",
    ])

    st.markdown("---")
    year_range = st.slider("Período", 2014, 2026, (2018, 2026))
    compounds = st.multiselect(
        "Compostos",
        ["SOFT", "MEDIUM", "HARD"],
        default=["SOFT", "MEDIUM", "HARD"],
    )

# ── Helper: formata dataframe sem quebrar em NaN ──────────────────────────────
def safe_dataframe(df: pd.DataFrame, col_config: dict):
    display = df.copy()
    for col in col_config:
        if col in display.columns:
            display[col] = pd.to_numeric(display[col], errors="coerce")
    st.dataframe(display, use_container_width=True, column_config=col_config)

# ── Helper: monta cláusula IN para compostos ─────────────────────────────────
def compounds_sql(lst):
    return ",".join([f"'{c}'" for c in lst])

# ══════════════════════════════════════════════════════════════════════════════
if page == "🏠 Visão Geral":
    st.title("🏎️ Pirelli Tyre Analytics — F1 2014–2026")
    st.caption("Análise baseada em dados reais do FastF1 · Schema medallion · dbt + Airflow")

    col1, col2, col3, col4 = st.columns(4)

    total_stints   = query("SELECT count(*) as n FROM marts.tyre_degradation")
    years_covered  = query("SELECT count(distinct year) as n FROM marts.compound_evolution")
    circuits       = query("SELECT count(distinct circuit_key) as n FROM marts.circuit_tyre_profile")
    compounds_cnt  = query("SELECT count(distinct compound) as n FROM marts.compound_evolution")

    col1.metric("Stints analisados", f"{int(total_stints['n'][0]):,}")
    col2.metric("Temporadas",        int(years_covered['n'][0]))
    col3.metric("Circuitos",         int(circuits['n'][0]))
    col4.metric("Compostos",         int(compounds_cnt['n'][0]))

    st.markdown("---")

    df = query(f"""
        SELECT year, compound, avg_deg_s, avg_stint_laps
        FROM marts.compound_evolution
        WHERE year BETWEEN {year_range[0]} AND {year_range[1]}
          AND compound IN ({compounds_sql(compounds)})
        ORDER BY year, compound
    """)

    if not df.empty:
        fig = px.line(
            df, x="year", y="avg_deg_s", color="compound",
            color_discrete_map=COMPOUND_COLORS,
            title="Degradação média global por composto (s/volta)",
            markers=True,
            labels={"avg_deg_s": "Degradação (s/volta)", "year": "Ano"},
        )
        fig.update_layout(plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)")
        st.plotly_chart(fig, use_container_width=True)

        fig2 = px.bar(
            df, x="year", y="avg_stint_laps", color="compound",
            color_discrete_map=COMPOUND_COLORS, barmode="group",
            title="Longevidade média dos stints por ano",
            labels={"avg_stint_laps": "Voltas por stint", "year": "Ano"},
        )
        fig2.update_layout(plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)")
        st.plotly_chart(fig2, use_container_width=True)

# ══════════════════════════════════════════════════════════════════════════════
elif page == "📉 Degradação por Circuito":
    st.title("📉 Degradação por Circuito")

    circuits_list    = query("SELECT DISTINCT event_name FROM marts.tyre_degradation ORDER BY 1")
    selected_circuit = st.selectbox("Circuito", circuits_list["event_name"].tolist())

    df = query(f"""
        SELECT year, compound, compound_name,
            avg_deg_per_lap_s, avg_pace_s, avg_stint_length, yoy_deg_delta
        FROM marts.tyre_degradation
        WHERE circuit_key = '{selected_key}'
        AND year BETWEEN {year_range[0]} AND {year_range[1]}
        AND compound IN ({compounds_sql(compounds)})
        ORDER BY year, compound
    """)

    if "compound_name" in df.columns:
        df["compound_label"] = df["compound"] + " (" + df["compound_name"] + ")"

    if df.empty:
        st.info("Sem dados para o filtro selecionado.")
    else:
        col1, col2 = st.columns(2)

        with col1:
            fig = px.line(
                df, x="year", y="avg_deg_per_lap_s", color="compound",
                color_discrete_map=COMPOUND_COLORS, markers=True,
                custom_data=["compound_name"] if "compound_name" in df.columns else [],
                title=f"Degradação — {selected_display}",
                labels={"avg_deg_per_lap_s": "Deg. (s/volta)", "year": "Ano"},
            )
            fig.update_traces(
                hovertemplate=(
                    "<b>%{fullData.name}</b><br>"
                    "Ano: %{x}<br>"
                    "Deg: %{y:.4f}s<br>"
                    "Composto físico: %{customdata[0]}<extra></extra>"
                )
            )
            fig.update_layout(plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)")
            st.plotly_chart(fig, use_container_width=True)

        with col2:
            df_yoy = df.dropna(subset=["yoy_deg_delta"])
            fig2 = px.bar(
                df_yoy, x="year", y="yoy_deg_delta", color="compound",
                color_discrete_map=COMPOUND_COLORS, barmode="group",
                title="Variação YoY de degradação (negativo = melhoria)",
                labels={"yoy_deg_delta": "Δ deg (s/volta)", "year": "Ano"},
            )
            fig2.add_hline(y=0, line_dash="dot", line_color="gray")
            fig2.update_layout(plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)")
            st.plotly_chart(fig2, use_container_width=True)

        safe_dataframe(df, {
            "compound_name":     st.column_config.TextColumn("Composto (Cx)"),   # ← NOVO
            "avg_deg_per_lap_s": st.column_config.NumberColumn("Deg/volta (s)",   format="%.4f"),
            "avg_pace_s":        st.column_config.NumberColumn("Ritmo médio (s)", format="%.3f"),
            "avg_stint_length":  st.column_config.NumberColumn("Stint médio",     format="%.1f"),
            "yoy_deg_delta":     st.column_config.NumberColumn("Δ YoY (s)",       format="%.4f"),
        })

# ══════════════════════════════════════════════════════════════════════════════
elif page == "📈 Evolução Anual":
    st.title("📈 Evolução dos Compostos Pirelli (2014 → hoje)")
    st.markdown("Identifica anos em que a Pirelli fez atualizações significativas nos compostos.")

    df = query(f"""
        SELECT year, compound, avg_deg_s, avg_stint_laps,
               yoy_deg_improvement, yoy_longevity_delta, races_used
        FROM marts.compound_evolution
        WHERE year BETWEEN {year_range[0]} AND {year_range[1]}
          AND compound IN ({compounds_sql(compounds)})
        ORDER BY year, compound
    """)

    if df.empty:
        st.info("Dados insuficientes para o período.")
    else:
        tab1, tab2 = st.tabs(["Degradação", "Longevidade"])

        with tab1:
            fig = px.area(
                df, x="year", y="avg_deg_s", color="compound",
                color_discrete_map=COMPOUND_COLORS,
                title="Degradação média global — evolução histórica",
                labels={"avg_deg_s": "Degradação (s/volta)", "year": "Ano"},
            )
            fig.update_traces(opacity=0.7)
            fig.update_layout(plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)")
            st.plotly_chart(fig, use_container_width=True)

            df_clean = df.dropna(subset=["yoy_deg_improvement"])
            big_improvements = df_clean[df_clean["yoy_deg_improvement"].abs() > 0.02]
            if not big_improvements.empty:
                st.markdown("#### 🔍 Grandes mudanças detectadas")
                for _, row in big_improvements.iterrows():
                    direction = "⬇️ Pneu melhorou" if row["yoy_deg_improvement"] < 0 else "⬆️ Pneu regrediu"
                    st.markdown(
                        f"**{row['year']} — {row['compound']}**: {direction} "
                        f"({row['yoy_deg_improvement']:+.4f} s/volta vs ano anterior)"
                    )

        with tab2:
            fig2 = px.line(
                df, x="year", y="avg_stint_laps", color="compound",
                color_discrete_map=COMPOUND_COLORS, markers=True,
                title="Longevidade média dos stints",
                labels={"avg_stint_laps": "Voltas por stint", "year": "Ano"},
            )
            fig2.update_layout(plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)")
            st.plotly_chart(fig2, use_container_width=True)

# ══════════════════════════════════════════════════════════════════════════════
elif page == "🗺️ Perfil de Circuitos":
    st.title("🗺️ Perfil de Agressividade — Circuitos")

    df = query(f"""
        SELECT circuit_key, event_name, compound,
               avg_deg_s, avg_stint_laps, usage_pct, degradation_tier
        FROM marts.circuit_tyre_profile
        WHERE compound IN ({compounds_sql(compounds)})
        ORDER BY avg_deg_s DESC
    """)

    if df.empty:
        st.info("Sem dados.")
    else:
        pivot = df.pivot_table(
            index="event_name", columns="compound",
            values="avg_deg_s", aggfunc="mean"
        ).round(4)

        fig = px.imshow(
            pivot,
            color_continuous_scale=["#1a9850", "#ffffbf", "#d73027"],
            title="Heatmap de degradação — circuito × composto",
            labels={"color": "Deg (s/volta)"},
            aspect="auto",
        )
        fig.update_layout(plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)")
        st.plotly_chart(fig, use_container_width=True)

        col1, col2 = st.columns(2)
        with col1:
            top5 = df.groupby("event_name")["avg_deg_s"].mean().nlargest(5).reset_index()
            fig2 = px.bar(top5, x="avg_deg_s", y="event_name", orientation="h",
                          title="Top 5 circuitos mais agressivos",
                          color="avg_deg_s", color_continuous_scale="Reds")
            fig2.update_layout(plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)")
            st.plotly_chart(fig2, use_container_width=True)

        with col2:
            tier_counts = df["degradation_tier"].value_counts().reset_index()
            fig3 = px.pie(tier_counts, values="count", names="degradation_tier",
                          title="Distribuição de circuitos por tier de degradação",
                          color_discrete_sequence=["#d73027", "#fdae61", "#1a9850"])
            fig3.update_layout(paper_bgcolor="rgba(0,0,0,0)")
            st.plotly_chart(fig3, use_container_width=True)

# ══════════════════════════════════════════════════════════════════════════════
elif page == "🔬 Explorador":
    st.title("🔬 Explorador de Dados Brutos")
    st.caption("Query direta ao schema marts.")

    default_sql = """
SELECT year, compound,
       round(avg(avg_deg_per_lap_s)::numeric,4) as deg_medio,
       round(avg(avg_stint_length)::numeric,1) as stint_medio
FROM marts.tyre_degradation
GROUP BY 1,2
ORDER BY 1,2
"""
    sql = st.text_area("SQL", value=default_sql, height=180)
    if st.button("▶ Executar"):
        try:
            result = query(sql)
            st.dataframe(result, use_container_width=True)
            if len(result.columns) >= 3:
                try:
                    fig = px.bar(result, x=result.columns[0], y=result.columns[2],
                                 color=result.columns[1])
                    fig.update_layout(plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)")
                    st.plotly_chart(fig, use_container_width=True)
                except Exception:
                    pass
        except Exception as e:
            st.error(f"Erro: {e}")
