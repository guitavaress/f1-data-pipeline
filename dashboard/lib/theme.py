"""Tema visual centralizado. Toda cor, fonte e config Plotly mora aqui.

Regra: se um arquivo em `pages/` precisar de uma cor literal, adiciona aqui
primeiro e importa. Hex string solta em página é refactor candidato."""

# Cores oficiais das CATEGORIAS Pirelli (faixa lateral do pneu)
COMPOUND_COLORS = {
    "SOFT":         "#E8000D",
    "MEDIUM":       "#FFF200",
    "HARD":         "#EBEBEB",
    "INTERMEDIATE": "#39B54A",
    "WET":          "#0067FF",
}

# Compostos físicos C1–C5 — gradiente claro→quente (C1 mais duro → C5 mais macio).
# A Pirelli não publica cor oficial para os físicos; este gradiente é convenção
# interna do projeto, mantido sincronizado com a interpretação "C1 conservador,
# C5 agressivo" do regulamento Pirelli.
PHYSICAL_COMPOUND_COLORS = {
    "C1": "#EBEBEB",
    "C2": "#FFAA00",
    "C3": "#FFF200",
    "C4": "#FF6B00",
    "C5": "#E10600",
}

# Paleta de UI (não confundir com COMPOUND_COLORS)
F1_RED       = "#E10600"
F1_YELLOW    = "#FFF200"
F1_BG        = "#0a0a0a"
F1_BG_ALT    = "#1a1a1a"
F1_TEXT      = "#f5f5f5"
GRID         = "rgba(255,255,255,0.07)"

TIER_COLORS = {
    "alta degradação":  "#d73027",
    "média degradação": "#fdae61",
    "baixa degradação": "#1a9850",
}

# Sequencial usada em heatmaps de degradação (verde → amarelo → vermelho)
DEG_SCALE = ["#1a9850", "#ffffbf", "#d73027"]

# Template Plotly reutilizável — espalhar via fig.update_layout(**PLOTLY_TEMPLATE)
PLOTLY_TEMPLATE = {
    "plot_bgcolor":  "rgba(0,0,0,0)",
    "paper_bgcolor": "rgba(0,0,0,0)",
    "font": {
        "family": "Titillium Web, sans-serif",
        "color":  F1_TEXT,
    },
    "xaxis": {"gridcolor": GRID, "zerolinecolor": GRID},
    "yaxis": {"gridcolor": GRID, "zerolinecolor": GRID},
    "legend": {"bgcolor": "rgba(0,0,0,0)"},
}

# Markdown injetado no topo de cada página para puxar a font Google.
# Streamlit não tem hook nativo de "rodar em toda página", então cada página
# importa e chama inject_fonts() no início.
GOOGLE_FONTS_HTML = """
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Titillium+Web:wght@300;400;600;700&display=swap" rel="stylesheet">
<style>
  html, body, [class*="css"] { font-family: 'Titillium Web', sans-serif !important; }
</style>
"""


def inject_fonts():
    import streamlit as st
    st.markdown(GOOGLE_FONTS_HTML, unsafe_allow_html=True)


def plotly_layout(**overrides) -> dict:
    """Mescla PLOTLY_TEMPLATE com overrides preservando sub-dicts.

    Use quando precisar customizar `xaxis`, `yaxis`, `font` etc — passar
    `**PLOTLY_TEMPLATE` E o mesmo kwarg diretamente em `update_layout()`
    levanta TypeError ('multiple values for keyword argument'). Este helper
    resolve isso fazendo deep merge dos dicts internos.

    Exemplo:
        fig.update_layout(**plotly_layout(
            xaxis={"visible": False},  # vira merge com PLOTLY_TEMPLATE.xaxis
            height=80,
        ))
    """
    merged = {k: dict(v) if isinstance(v, dict) else v
              for k, v in PLOTLY_TEMPLATE.items()}
    for k, v in overrides.items():
        if isinstance(merged.get(k), dict) and isinstance(v, dict):
            merged[k] = {**merged[k], **v}
        else:
            merged[k] = v
    return merged
