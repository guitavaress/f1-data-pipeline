"""Weather Impact — relação entre temperatura de pista e degradação de pneu.

Plota cada stint como um ponto (track_temp × deg_per_lap), colorido por
composto. A faixa ótima (sombra) marca o quartil 25–75 de temperatura nos
stints com degradação abaixo da mediana global do composto — útil pra
identificar "C3 funciona melhor entre 22 e 28°C neste circuito"."""
import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from lib.components import empty_state
from lib.db import compounds_sql, query
from lib.theme import COMPOUND_COLORS, PLOTLY_TEMPLATE, inject_fonts

st.set_page_config(page_title="Weather Impact", page_icon="🌡️", layout="wide")
inject_fonts()

# ── Cobertura ─────────────────────────────────────────────────────────────────
coverage = query("""
    SELECT
        count(*) FILTER (WHERE air_temp_c IS NOT NULL OR track_temp_c IS NOT NULL) AS with_weather,
        count(*)                                                                    AS total
    FROM staging.stg_laps
""")
with_w = int(coverage["with_weather"][0])
total  = int(coverage["total"][0])
cov_pct = (with_w / total * 100) if total > 0 else 0

first_round = query("""
    SELECT min(year)::int AS y_min,
           min(round_number) FILTER (WHERE year = (
               SELECT min(year) FROM staging.stg_laps WHERE track_temp_c IS NOT NULL
           )) AS round_min
    FROM staging.stg_laps
    WHERE track_temp_c IS NOT NULL
""")

# ── Header ────────────────────────────────────────────────────────────────────
st.title("🌡️ Weather Impact")
st.caption("Como temperatura de pista correlaciona com degradação por composto.")

if cov_pct < 70:
    st.warning(
        f"⚠️ Apenas **{cov_pct:.1f}%** das voltas têm leitura de weather "
        f"({with_w:,} de {total:,}). Sugerimos re-rodar `f1_historical_backfill` "
        "pra repopular weather em rounds antigos. Análise abaixo usa só os dados "
        "disponíveis.",
        icon="⚠️",
    )
else:
    y_min = first_round["y_min"][0]
    r_min = first_round["round_min"][0]
    st.info(
        f"📡 Dados de weather disponíveis a partir de {int(y_min)} round {int(r_min)} — "
        f"cobertura de **{cov_pct:.1f}%** dos laps.",
        icon="📡",
    )

if with_w == 0:
    empty_state(
        "Sem dados de weather",
        "Rode `f1_historical_backfill` ou `f1_pipeline` pra popular as colunas.",
    )
    st.stop()

# ── Filtros ───────────────────────────────────────────────────────────────────
st.sidebar.markdown("## Filtros")

years_df = query("""
    SELECT DISTINCT year::int AS y
    FROM staging.stg_tyre_stints
    WHERE avg_track_temp_c IS NOT NULL
    ORDER BY 1
""")
years_available = years_df["y"].tolist()
if not years_available:
    empty_state("Sem stints com weather")
    st.stop()

y_min_av, y_max_av = years_available[0], years_available[-1]
if y_min_av == y_max_av:
    year_range = (y_min_av, y_max_av)
    st.sidebar.caption(f"Único ano disponível: {y_min_av}")
else:
    year_range = st.sidebar.slider("Período", y_min_av, y_max_av, (y_min_av, y_max_av))

compounds_default = ["SOFT", "MEDIUM", "HARD"]
compounds_available = query("""
    SELECT DISTINCT compound
    FROM staging.stg_tyre_stints
    WHERE avg_track_temp_c IS NOT NULL
    ORDER BY 1
""")["compound"].tolist()
compounds = st.sidebar.multiselect(
    "Compostos", compounds_available,
    default=[c for c in compounds_default if c in compounds_available],
)
include_wet_inter = st.sidebar.checkbox(
    "Incluir INTERMEDIATE/WET (somente em stints com chuva)", value=False,
)

if not compounds:
    empty_state("Selecione ao menos um composto")
    st.stop()

# Filtra INTERMEDIATE/WET pra had_rain=true, conforme plano
rain_filter = ""
if include_wet_inter:
    rain_filter = """
        AND (compound IN ('SOFT','MEDIUM','HARD')
             OR (compound IN ('INTERMEDIATE','WET') AND had_rain = true))
    """
else:
    rain_filter = "AND compound IN ('SOFT','MEDIUM','HARD')"

# ── Dados por stint ───────────────────────────────────────────────────────────
stints = query(f"""
    SELECT
        year, circuit_key, event_name, compound, compound_name,
        avg_track_temp_c AS track_temp_c,
        deg_per_lap_s,
        stint_length,
        had_rain
    FROM staging.stg_tyre_stints
    WHERE avg_track_temp_c IS NOT NULL
      AND deg_per_lap_s IS NOT NULL
      AND stint_length >= 5
      AND year BETWEEN {year_range[0]} AND {year_range[1]}
      AND compound IN ({compounds_sql(compounds)})
      {rain_filter}
""")

if stints.empty:
    empty_state("Sem stints para a combinação selecionada")
    st.stop()

# ── Scatter ───────────────────────────────────────────────────────────────────
st.markdown("### Temperatura de pista × Degradação (por stint)")

fig = px.scatter(
    stints,
    x="track_temp_c", y="deg_per_lap_s",
    color="compound", color_discrete_map=COMPOUND_COLORS,
    hover_data=["year", "event_name", "compound_name", "stint_length"],
    labels={
        "track_temp_c": "Track temperature (°C)",
        "deg_per_lap_s": "Degradação (s/volta)",
        "compound": "Composto",
    },
    opacity=0.55,
)

# Faixa ótima por composto: p25–p75 de temperatura nos stints com deg < mediana global do composto
for comp in compounds:
    sub = stints[stints["compound"] == comp]
    if len(sub) < 10:
        continue
    median_deg = sub["deg_per_lap_s"].median()
    good = sub[sub["deg_per_lap_s"] < median_deg]
    if good.empty:
        continue
    p25, p75 = np.percentile(good["track_temp_c"], [25, 75])
    color = COMPOUND_COLORS.get(comp, "#888")
    fig.add_vrect(
        x0=p25, x1=p75,
        fillcolor=color, opacity=0.07, line_width=0,
        annotation_text=f"{comp} ótimo", annotation_position="top",
        annotation_font_color=color,
    )

fig.update_layout(**PLOTLY_TEMPLATE, height=520)
st.plotly_chart(fig, use_container_width=True)

# ── Resumo por composto ───────────────────────────────────────────────────────
st.markdown("### Resumo por composto")
summary = (
    stints.groupby("compound")
    .agg(
        stints_n=("deg_per_lap_s", "count"),
        deg_mean=("deg_per_lap_s", "mean"),
        deg_median=("deg_per_lap_s", "median"),
        temp_mean=("track_temp_c", "mean"),
        temp_p25=("track_temp_c", lambda s: np.percentile(s, 25)),
        temp_p75=("track_temp_c", lambda s: np.percentile(s, 75)),
    )
    .reset_index()
    .round(3)
)
st.dataframe(
    summary,
    use_container_width=True,
    column_config={
        "compound":   st.column_config.TextColumn("Composto"),
        "stints_n":   st.column_config.NumberColumn("# stints",        format="%d"),
        "deg_mean":   st.column_config.NumberColumn("Deg médio (s)",   format="%.4f"),
        "deg_median": st.column_config.NumberColumn("Deg mediana (s)", format="%.4f"),
        "temp_mean":  st.column_config.NumberColumn("Temp média (°C)", format="%.1f"),
        "temp_p25":   st.column_config.NumberColumn("Temp P25 (°C)",   format="%.1f"),
        "temp_p75":   st.column_config.NumberColumn("Temp P75 (°C)",   format="%.1f"),
    },
)

# ── Heatmap por bucket ────────────────────────────────────────────────────────
st.markdown("### Mart `tyre_weather_profile` — deg médio por bucket de temperatura")
profile = query(f"""
    SELECT compound, temp_bucket,
           round(avg(avg_deg_per_lap_s)::numeric, 4) AS avg_deg,
           sum(stints_in_bucket)                     AS n
    FROM marts.tyre_weather_profile
    WHERE compound IN ({compounds_sql(compounds)})
      AND year BETWEEN {year_range[0]} AND {year_range[1]}
    GROUP BY 1, 2
""")

if profile.empty:
    st.info("Mart `tyre_weather_profile` ainda não populado para esta seleção.")
else:
    bucket_order = ["<20", "20-25", "25-30", "30-35", "35-40", ">40"]
    profile["temp_bucket"] = pd.Categorical(profile["temp_bucket"],
                                            categories=bucket_order, ordered=True)
    pivot = profile.pivot(index="compound", columns="temp_bucket",
                          values="avg_deg").reindex(columns=bucket_order)
    fig_hm = px.imshow(
        pivot, color_continuous_scale=["#1a9850", "#ffffbf", "#d73027"],
        labels={"color": "Deg médio (s/volta)", "x": "Bucket de temperatura"},
        aspect="auto", text_auto=".3f",
    )
    fig_hm.update_layout(**PLOTLY_TEMPLATE)
    st.plotly_chart(fig_hm, use_container_width=True)
