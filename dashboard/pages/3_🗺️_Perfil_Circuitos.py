"""Perfil de agressividade dos circuitos com pneus.

Com ~50 circuitos no banco, o heatmap inteiro fica ilegível. Esta página
foca em comparações úteis:
- Heatmap restrito ao Top-N circuitos mais agressivos (configurável)
- Top-N por composto (não mistura SOFT urbano com HARD em Suzuka)
- Distribuição de tier em barras (mais legível que pie)
- Composto mais usado por circuito (usage_pct do mart)
"""
import plotly.express as px
import streamlit as st

from lib.components import empty_state, filter_sidebar
from lib.db import compounds_sql, query
from lib.theme import DEG_SCALE, PLOTLY_TEMPLATE, TIER_COLORS, inject_fonts

st.set_page_config(page_title="Perfil de Circuitos", page_icon="🗺️", layout="wide")
inject_fonts()

filters = filter_sidebar("global")
compounds = filters["compounds"]

top_n = st.sidebar.slider(
    "Top-N circuitos no heatmap", 5, 30, 15,
    help="Ordenado por degradação média decrescente. Limita o heatmap pra "
         "evitar 50+ linhas ilegíveis.",
)

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

# ── Heatmap restrito aos Top-N por deg média ──────────────────────────────────
st.markdown(f"### Heatmap — Top {top_n} circuitos mais agressivos")
st.caption("Ordenado pela degradação média (todos os compostos) — mais quente = mais agressivo.")

agg_by_circuit = (
    df.groupby("event_name")["avg_deg_s"].mean().sort_values(ascending=False)
)
top_circuits = agg_by_circuit.head(top_n).index.tolist()
df_top = df[df["event_name"].isin(top_circuits)]

pivot = df_top.pivot_table(
    index="event_name", columns="compound",
    values="avg_deg_s", aggfunc="mean",
).round(4)
# Preserva a ordem de agressividade no eixo Y (mais agressivo em cima)
pivot = pivot.reindex(top_circuits)

fig = px.imshow(
    pivot,
    color_continuous_scale=DEG_SCALE,
    labels={"color": "Deg (s/volta)"},
    aspect="auto",
    text_auto=".3f",
)
fig.update_layout(**PLOTLY_TEMPLATE, height=max(300, 28 * len(top_circuits)))
st.plotly_chart(fig, use_container_width=True)

# ── Top-N por composto ────────────────────────────────────────────────────────
st.markdown("### Top 5 circuitos mais agressivos — por composto")
st.caption("Comparação mais honesta: SOFT em Spa não é a mesma coisa que HARD em Monaco.")

per_compound_cols = st.columns(len(compounds))
for col, comp in zip(per_compound_cols, compounds):
    sub = df[df["compound"] == comp].nlargest(5, "avg_deg_s")
    if sub.empty:
        with col:
            st.info(f"Sem dados para {comp}")
        continue
    with col:
        fig_c = px.bar(
            sub, x="avg_deg_s", y="event_name", orientation="h",
            title=comp,
            color="avg_deg_s", color_continuous_scale="Reds",
            labels={"avg_deg_s": "Deg (s/volta)", "event_name": ""},
        )
        fig_c.update_layout(
            **PLOTLY_TEMPLATE,
            height=300,
            showlegend=False,
            coloraxis_showscale=False,
            yaxis={"categoryorder": "total ascending"},
        )
        st.plotly_chart(fig_c, use_container_width=True)

# ── Distribuição de tiers em barras ───────────────────────────────────────────
st.markdown("### Distribuição por tier de degradação")
tier_counts = (
    df["degradation_tier"].value_counts()
    .reindex(["alta degradação", "média degradação", "baixa degradação"])
    .fillna(0)
    .reset_index()
)
tier_counts.columns = ["degradation_tier", "n"]
fig3 = px.bar(
    tier_counts, x="n", y="degradation_tier", orientation="h",
    color="degradation_tier", color_discrete_map=TIER_COLORS,
    labels={"n": "Quantidade de (circuito × composto)", "degradation_tier": ""},
    text="n",
)
fig3.update_layout(
    **PLOTLY_TEMPLATE,
    height=200,
    showlegend=False,
)
fig3.update_traces(textposition="outside")
st.plotly_chart(fig3, use_container_width=True)

# ── Composto mais usado por circuito (usage_pct) ──────────────────────────────
st.markdown("### Composto dominante por circuito")
st.caption(
    "`usage_pct` do mart — % de stints daquele composto naquele GP. "
    "Circuito com dominância alta = estratégia fechada (todos correm com o mesmo composto). "
    "Dominância baixa = estratégia diversa."
)

dominant = (
    df.sort_values("usage_pct", ascending=False)
    .drop_duplicates(subset=["event_name"])
    .nlargest(top_n, "usage_pct")
    [["event_name", "compound", "usage_pct", "avg_stint_laps"]]
    .round(1)
)
st.dataframe(
    dominant,
    use_container_width=True,
    column_config={
        "event_name":     st.column_config.TextColumn("GP"),
        "compound":       st.column_config.TextColumn("Composto dominante"),
        "usage_pct":      st.column_config.NumberColumn("% de stints", format="%.1f"),
        "avg_stint_laps": st.column_config.NumberColumn("Stint médio (voltas)", format="%.1f"),
    },
)
