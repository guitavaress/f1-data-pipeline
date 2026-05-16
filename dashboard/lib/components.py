"""Componentes reutilizáveis: sidebar de filtros, cards de KPI, dataframe seguro.

Convenção dos filtros: páginas globais (visão geral / evolução / etc) usam
`filter_sidebar('global')`. Páginas que centram em UM circuito usam
`filter_sidebar('by_circuit')` — que faz cascata circuito → anos → compostos
a partir dos dados que existem em marts.tyre_degradation.
"""
from __future__ import annotations

import pandas as pd
import streamlit as st

from .db import query
from .theme import COMPOUND_COLORS, F1_RED


# ── KPI Card ──────────────────────────────────────────────────────────────────
def kpi_card(label: str, value, hint: str | None = None, accent: str = F1_RED):
    """Card simples com label + valor + hint opcional. Pensado pra ir em
    st.columns(). Estilo via HTML pra ter borda colorida."""
    hint_html = f"<div style='color:#999;font-size:0.75rem'>{hint}</div>" if hint else ""
    st.markdown(
        f"""
        <div style='
            border:1px solid #2a2a2a;
            border-left:4px solid {accent};
            background:#141414;
            padding:1rem 1.2rem;
            border-radius:6px;
        '>
            <div style='color:#aaa;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.05em'>{label}</div>
            <div style='color:#fff;font-size:1.8rem;font-weight:600;line-height:1.2'>{value}</div>
            {hint_html}
        </div>
        """,
        unsafe_allow_html=True,
    )


# ── Filtros encadeados ────────────────────────────────────────────────────────
def _global_filters() -> dict:
    """Filtros globais: range de anos + lista de compostos categóricos.
    Domínio puxado do banco para refletir o que realmente existe."""
    bounds = query("""
        SELECT min(year)::int AS y_min, max(year)::int AS y_max
        FROM marts.compound_evolution
    """)
    y_min = int(bounds["y_min"][0])
    y_max = int(bounds["y_max"][0])

    compounds_available = query("""
        SELECT DISTINCT compound
        FROM marts.compound_evolution
        WHERE compound IN ('SOFT','MEDIUM','HARD')
        ORDER BY CASE compound WHEN 'SOFT' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END
    """)["compound"].tolist()

    year_range = st.sidebar.slider("Período", y_min, y_max, (max(y_min, 2018), y_max))
    compounds = st.sidebar.multiselect(
        "Compostos", compounds_available, default=compounds_available
    )
    return {"year_range": year_range, "compounds": compounds}


def _by_circuit_filters() -> dict:
    """Filtros encadeados: circuito → anos disponíveis nesse circuito →
    compostos efetivamente usados no circuito + range de anos."""
    circuits = query("""
        SELECT circuit_key, max(event_name) AS display_name
        FROM marts.tyre_degradation
        GROUP BY circuit_key
        ORDER BY 2
    """)
    circuit_map = dict(zip(circuits["display_name"], circuits["circuit_key"]))

    selected_display = st.sidebar.selectbox("Circuito", list(circuit_map.keys()))
    selected_key = circuit_map[selected_display]

    years_df = query(f"""
        SELECT DISTINCT year::int AS y
        FROM marts.tyre_degradation
        WHERE circuit_key = '{selected_key.replace("'", "''")}'
        ORDER BY 1
    """)
    available_years = years_df["y"].tolist()
    if not available_years:
        st.sidebar.warning("Sem dados para este circuito.")
        return {"circuit_key": selected_key, "circuit_display": selected_display,
                "year_range": None, "compounds": []}

    y_min, y_max = available_years[0], available_years[-1]
    if y_min == y_max:
        st.sidebar.caption(f"Único ano disponível: {y_min}")
        year_range = (y_min, y_max)
    else:
        year_range = st.sidebar.slider("Período", y_min, y_max, (y_min, y_max))

    compounds_df = query(f"""
        SELECT DISTINCT compound
        FROM marts.tyre_degradation
        WHERE circuit_key = '{selected_key.replace("'", "''")}'
          AND year BETWEEN {year_range[0]} AND {year_range[1]}
        ORDER BY 1
    """)
    available_compounds = compounds_df["compound"].tolist()
    compounds = st.sidebar.multiselect(
        "Compostos", available_compounds, default=available_compounds
    )

    return {
        "circuit_key":     selected_key,
        "circuit_display": selected_display,
        "year_range":      year_range,
        "compounds":       compounds,
    }


def filter_sidebar(scope: str = "global") -> dict:
    """Renderiza a sidebar de filtros e devolve um dict com as seleções.

    scope = 'global'     → year_range + compounds
    scope = 'by_circuit' → circuit_key/display + year_range + compounds (encadeados)
    """
    st.sidebar.markdown("## Filtros")
    if scope == "global":
        return _global_filters()
    elif scope == "by_circuit":
        return _by_circuit_filters()
    raise ValueError(f"scope desconhecido: {scope}")


# ── DataFrame seguro ──────────────────────────────────────────────────────────
def safe_dataframe(df: pd.DataFrame, col_config: dict):
    """Exibe DF sem quebrar em colunas numéricas com NaN — força cast antes."""
    display = df.copy()
    for col in col_config:
        if col in display.columns:
            display[col] = pd.to_numeric(display[col], errors="coerce")
    st.dataframe(display, use_container_width=True, column_config=col_config)


# ── Empty state ───────────────────────────────────────────────────────────────
def empty_state(title: str, hint: str = ""):
    """Tela de vazio padronizada. Use quando o filtro resulta em zero linhas
    apesar dos selects estarem encadeados (corner cases)."""
    st.markdown(
        f"""
        <div style='
            border:1px dashed #333;
            border-radius:8px;
            padding:2.5rem;
            text-align:center;
            background:#0f0f0f;
            margin:1rem 0;
        '>
            <div style='font-size:2.5rem'>📭</div>
            <div style='color:#ddd;font-size:1.1rem;margin-top:0.5rem'>{title}</div>
            <div style='color:#888;font-size:0.85rem;margin-top:0.3rem'>{hint}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def compound_color(compound: str) -> str:
    return COMPOUND_COLORS.get(compound, "#888")
