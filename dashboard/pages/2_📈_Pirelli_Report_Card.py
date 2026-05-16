"""Pirelli Report Card — evolução por composto FÍSICO (C1–C5).

Substitui a antiga "Evolução Anual", que comparava SOFT-com-SOFT entre anos —
métrica enganosa porque a categoria mudou de significado em 2019.
Aqui comparamos C3-com-C3, que é a evolução real do produto Pirelli.

Modo honesto (ON por default): só usa circuitos presentes em ≥80% dos anos
do range selecionado. Mitiga o viés de "esse C3 ficou pior porque foi usado
em um Mônaco a mais que ano passado"."""
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from lib.components import empty_state, safe_dataframe
from lib.db import query
from lib.theme import (
    PHYSICAL_COMPOUND_COLORS,
    PLOTLY_TEMPLATE,
    inject_fonts,
)

st.set_page_config(page_title="Pirelli Report Card", page_icon="📈", layout="wide")
inject_fonts()

# ── Sidebar / Filtros ─────────────────────────────────────────────────────────
st.sidebar.markdown("## Filtros")

bounds = query("""
    SELECT min(year)::int AS y_min, max(year)::int AS y_max
    FROM marts.compound_physical_evolution
""")
y_min = int(bounds["y_min"][0]) if bounds["y_min"][0] else 2018
y_max = int(bounds["y_max"][0]) if bounds["y_max"][0] else 2026

if y_min == y_max:
    year_range = (y_min, y_max)
    st.sidebar.caption(f"Único ano disponível: {y_min}")
else:
    year_range = st.sidebar.slider("Período", y_min, y_max, (y_min, y_max))

honest_mode = st.sidebar.toggle(
    "🎯 Modo honesto",
    value=True,
    help=(
        "Filtra apenas circuitos presentes em ≥80% dos anos do range, evitando "
        "que mudanças no calendário (Mônaco fora, Vegas novo) distorçam a "
        "comparação YoY do mesmo composto físico."
    ),
)
coverage_threshold = 0.80

# ── Header ────────────────────────────────────────────────────────────────────
st.title("📈 Pirelli Report Card")
st.caption(
    "Evolução do composto FÍSICO (C1–C5). C3 deste ano vs C3 do ano passado — "
    "a comparação metodologicamente correta."
)

if honest_mode:
    st.info(
        "🎯 **Modo honesto ATIVO** — somente circuitos presentes em ≥80% dos anos "
        f"de {year_range[0]}–{year_range[1]}. Desligue na barra lateral para usar todos os dados.",
        icon="🎯",
    )
else:
    st.warning(
        "⚠️ **Modo honesto DESLIGADO** — todos os circuitos. Comparações YoY podem "
        "refletir mudança de calendário, não evolução de produto.",
        icon="⚠️",
    )

# ── Query principal ───────────────────────────────────────────────────────────
# Sempre derivada de stg_tyre_stints porque o filtro "circuitos comuns" exige
# circuit_key, que o mart já agregado não expõe. Os números batem com o mart
# quando honest_mode=False (mesma agregação).
y0, y1 = year_range
total_years = y1 - y0 + 1
min_years_required = max(1, int(total_years * coverage_threshold))

if honest_mode:
    circuit_filter = f"""
      AND circuit_key IN (
          SELECT circuit_key
          FROM staging.stg_tyre_stints
          WHERE year BETWEEN {y0} AND {y1}
            AND stint_length >= 3
            AND compound_name IN ('C1','C2','C3','C4','C5')
          GROUP BY circuit_key
          HAVING count(DISTINCT year) >= {min_years_required}
      )
    """
else:
    circuit_filter = ""

df = query(f"""
    WITH base AS (
        SELECT
            year,
            compound_name,
            event_name,
            deg_per_lap_s,
            stint_length,
            avg_lap_s
        FROM staging.stg_tyre_stints
        WHERE year BETWEEN {y0} AND {y1}
          AND stint_length >= 3
          AND compound_name IN ('C1','C2','C3','C4','C5')
          {circuit_filter}
    )
    SELECT
        year,
        compound_name,
        count(DISTINCT event_name)                   AS races_used,
        count(*)                                     AS total_stints,
        round(avg(deg_per_lap_s)::numeric, 4)        AS avg_deg_s,
        round(stddev(deg_per_lap_s)::numeric, 4)     AS stddev_deg_s,
        round(avg(stint_length)::numeric, 1)         AS avg_stint_laps,
        max(stint_length)                            AS max_stint_laps,
        round(avg(avg_lap_s)::numeric, 3)            AS avg_race_pace_s
    FROM base
    GROUP BY year, compound_name
    ORDER BY year, compound_name
""")

if df.empty:
    empty_state(
        "Sem dados no modo honesto",
        "Tente desativar o Modo honesto ou ampliar o range de anos.",
    )
    st.stop()

# YoY calculado em pandas pra refletir o subset filtrado (não dá pra reusar o
# yoy_deg_improvement do mart, que é calculado contra TODOS os circuitos).
df = df.sort_values(["compound_name", "year"]).reset_index(drop=True)
df["yoy_deg_improvement"] = df.groupby("compound_name")["avg_deg_s"].diff()
df["yoy_longevity_delta"] = df.groupby("compound_name")["avg_stint_laps"].diff()

# ── Cards C1–C5 ───────────────────────────────────────────────────────────────
st.markdown("### Composto físico — desempenho ano corrente vs histórico")
cols = st.columns(5)

compounds_order = ["C1", "C2", "C3", "C4", "C5"]
latest_year = df["year"].max()

for col, comp in zip(cols, compounds_order):
    sub = df[df["compound_name"] == comp].sort_values("year")
    color = PHYSICAL_COMPOUND_COLORS[comp]

    with col:
        if sub.empty:
            st.markdown(
                f"<div style='border:1px solid #2a2a2a;border-top:3px solid {color};"
                f"border-radius:6px;padding:1rem;background:#141414'>"
                f"<div style='color:{color};font-weight:600;font-size:1.1rem'>{comp}</div>"
                f"<div style='color:#666;font-size:0.85rem;margin-top:0.5rem'>"
                f"Sem dados no range</div></div>",
                unsafe_allow_html=True,
            )
            continue

        latest = sub[sub["year"] == latest_year]
        latest_deg = latest["avg_deg_s"].iloc[0] if not latest.empty else None
        latest_yoy = latest["yoy_deg_improvement"].iloc[0] if not latest.empty else None

        # Cabeçalho do card
        deg_str = f"{latest_deg:.3f}" if latest_deg is not None else "—"
        if latest_yoy is None or (isinstance(latest_yoy, float) and latest_yoy != latest_yoy):  # NaN
            yoy_html = "<span style='color:#666;font-size:0.8rem'>—</span>"
        else:
            yoy_color = "#1a9850" if latest_yoy < 0 else "#d73027"
            sign = "▼" if latest_yoy < 0 else "▲"
            yoy_html = (
                f"<span style='color:{yoy_color};font-size:0.85rem;font-weight:600'>"
                f"{sign} {latest_yoy:+.3f} s</span>"
            )

        st.markdown(
            f"""
            <div style='border:1px solid #2a2a2a;border-top:3px solid {color};
                        border-radius:6px;padding:0.9rem 1rem;background:#141414'>
                <div style='color:{color};font-weight:700;font-size:1.2rem'>{comp}</div>
                <div style='color:#aaa;font-size:0.72rem;text-transform:uppercase;margin-top:0.2rem'>
                    deg {latest_year} (s/volta)
                </div>
                <div style='color:#fff;font-size:1.6rem;font-weight:600;line-height:1.1'>{deg_str}</div>
                <div style='margin-top:0.2rem'>{yoy_html}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

        # Sparkline deg
        fig = go.Figure()
        fig.add_trace(go.Scatter(
            x=sub["year"], y=sub["avg_deg_s"],
            mode="lines+markers", line={"color": color, "width": 2},
            marker={"size": 5}, showlegend=False,
            hovertemplate="<b>%{x}</b><br>deg: %{y:.4f}s<extra></extra>",
        ))
        fig.update_layout(
            **PLOTLY_TEMPLATE,
            margin={"l": 0, "r": 0, "t": 10, "b": 0},
            height=80,
            xaxis={"visible": False},
            yaxis={"visible": False},
        )
        st.plotly_chart(fig, use_container_width=True,
                        key=f"spark_deg_{comp}",
                        config={"displayModeBar": False})

        # Sparkline longevity
        fig2 = go.Figure()
        fig2.add_trace(go.Scatter(
            x=sub["year"], y=sub["avg_stint_laps"],
            mode="lines+markers", line={"color": "#888", "width": 1.5},
            marker={"size": 4}, showlegend=False,
            hovertemplate="<b>%{x}</b><br>%{y:.1f} voltas<extra></extra>",
        ))
        fig2.update_layout(
            **PLOTLY_TEMPLATE,
            margin={"l": 0, "r": 0, "t": 4, "b": 0},
            height=50,
            xaxis={"visible": False},
            yaxis={"visible": False},
        )
        st.plotly_chart(fig2, use_container_width=True,
                        key=f"spark_long_{comp}",
                        config={"displayModeBar": False})

        # Footnote
        races_total = int(sub["races_used"].sum())
        years_count = sub["year"].nunique()
        st.markdown(
            f"<div style='color:#777;font-size:0.7rem;text-align:center'>"
            f"{races_total} corridas em {years_count} temporadas</div>",
            unsafe_allow_html=True,
        )

# ── Linha histórica completa ──────────────────────────────────────────────────
st.markdown("---")
st.markdown("### Linha histórica — degradação por composto físico")

fig_main = px.line(
    df, x="year", y="avg_deg_s", color="compound_name",
    color_discrete_map=PHYSICAL_COMPOUND_COLORS,
    markers=True,
    labels={"avg_deg_s": "Degradação (s/volta)", "year": "Ano",
            "compound_name": "Composto físico"},
)
fig_main.update_layout(**PLOTLY_TEMPLATE)
st.plotly_chart(fig_main, use_container_width=True)

# ── Tabela detalhada ──────────────────────────────────────────────────────────
st.markdown("### Tabela detalhada")
safe_dataframe(
    df[["year", "compound_name", "avg_deg_s", "yoy_deg_improvement",
        "avg_stint_laps", "yoy_longevity_delta", "races_used"]],
    {
        "compound_name":       st.column_config.TextColumn("Composto"),
        "avg_deg_s":           st.column_config.NumberColumn("Deg (s/volta)",     format="%.4f"),
        "yoy_deg_improvement": st.column_config.NumberColumn("Δ deg YoY",         format="%.4f"),
        "avg_stint_laps":      st.column_config.NumberColumn("Stint médio",       format="%.1f"),
        "yoy_longevity_delta": st.column_config.NumberColumn("Δ longevidade YoY", format="%.1f"),
        "races_used":          st.column_config.NumberColumn("Corridas",          format="%d"),
    },
)
