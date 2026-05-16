# 🏎️ F1 Data Pipeline — Pirelli Tyre Analytics

Pipeline de dados de Fórmula 1 que coleta voltas de corrida via **FastF1**, armazena em **PostgreSQL**, transforma com **dbt** e expõe os resultados em um dashboard **Streamlit**. Orquestrado por **Apache Airflow** com **Cosmos**.

O objetivo central é **analisar a evolução e degradação dos compostos Pirelli de 2014 a 2026** — quanto cada composto perde de performance por volta, como isso varia entre circuitos e como a Pirelli evoluiu seus pneus ao longo das temporadas.

-----

## Índice

- [Objetivos](#objetivos)
- [Stack](#stack)
- [Arquitetura (Medallion)](#arquitetura-medallion)
- [Estrutura](#estrutura)
- [Como Usar](#como-usar)
  - [1. Pré-requisitos](#1-pré-requisitos)
  - [2. Subir tudo](#2-subir-tudo)
  - [3. Acessos](#3-acessos)
  - [4. Primeira execução](#4-primeira-execução)
- [DAGs](#dags)
  - [`f1_pipeline` (incremental, `@daily`)](#f1_pipeline-incremental-daily)
  - [`f1_historical_backfill` (manual)](#f1_historical_backfill-manual)
- [Dashboard (Streamlit)](#dashboard-streamlit)
- [Comandos Úteis](#comandos-úteis)
- [Contexto de Domínio (F1 / Pirelli)](#contexto-de-domínio-f1--pirelli)
- [Documentação Adicional](#documentação-adicional)

-----

## Objetivos

- **Degradação por composto × circuito × ano**: medir, em segundos por volta, quanto cada pneu Pirelli perde de pace ao longo de um stint.
- **Evolução histórica (2014 → hoje)**: identificar anos em que a Pirelli mudou de forma significativa a curva de degradação ou longevidade de cada composto.
- **Perfil de circuitos**: classificar os GPs por agressividade (low / medium / high deg) usando dados reais de stint, não tabelas pré-fabricadas.
- **Ingestão idempotente**: nunca reprocessar uma corrida já presente em `raw.fastf1_laps`; o pipeline diário pega apenas o que é novo.

-----

## Stack

| Serviço       | Tecnologia                       | Porta |
|---------------|----------------------------------|-------|
| Orquestração  | Apache Airflow 2.8.1 + Cosmos    | 8080  |
| Banco         | PostgreSQL 15                    | 5432  |
| Transformação | dbt-postgres 1.7.11              | —     |
| Dashboard     | Streamlit + Plotly               | 8501  |
| Ingestão      | FastF1 (Python)                  | —     |

Credenciais locais de desenvolvimento: `airflow / airflow`, banco `f1`.

-----

## Arquitetura (Medallion)

```
FastF1 API
    │
    ▼
raw.fastf1_laps                   ← ingestão bruta + weather por volta
    │
    ▼
staging.stg_laps                  ← limpeza, cast, trackstatus = '1'
staging.stg_tyre_stints           ← agregação por stint + weather agregada
    │
    ▼
marts.tyre_degradation            ← deg. por composto × circuito × ano (incremental)
marts.compound_evolution          ← evolução categórica SOFT/MEDIUM/HARD com `era`
marts.compound_physical_evolution ← evolução por composto físico C1–C5 (2018+)
marts.circuit_tyre_profile        ← perfil de agressividade por circuito
marts.tyre_weather_profile        ← degradação × bucket de temperatura
```

- Todos os marts são `table`, exceto `tyre_degradation` que é `incremental` com `unique_key = ['year', 'circuit_key', 'compound']`.
- Tempo sempre em **segundos** (float), nunca timedelta.
- Compostos sempre em **UPPER**: `SOFT`, `MEDIUM`, `HARD`, `INTERMEDIATE`, `WET`.
- `compound` = categoria (SOFT/MEDIUM/HARD); `compound_name` = composto físico Pirelli (C1–C5).

-----

## Estrutura

```
f1-data-pipeline/
├── dags/
│   ├── fastf1_load.py            # DAG diária incremental (f1_pipeline)
│   ├── fastf1_backfill.py        # DAG manual de backfill 2014–2026
│   └── load_fastf1.py            # Lógica de ingestão FastF1 → raw.fastf1_laps
├── f1_transform/                 # Projeto dbt
│   ├── dbt_project.yml
│   ├── profiles.yml
│   ├── macros/
│   │   └── schema_macros.sql     # Remove o prefixo padrão dos schemas do dbt
│   └── models/
│       ├── src.yml
│       ├── staging/
│       │   ├── stg_laps.sql
│       │   └── stg_tyre_stints.sql
│       └── marts/
│           ├── schema.yml
│           ├── tyre_degradation.sql             (incremental)
│           ├── compound_evolution.sql           (table)
│           ├── compound_physical_evolution.sql  (table — C1–C5, 2018+)
│           ├── circuit_tyre_profile.sql         (table)
│           └── tyre_weather_profile.sql         (table)
├── dashboard/
│   ├── Home.py                   # Entry point — Visão Geral
│   ├── pages/                    # Multi-page nativo do Streamlit
│   │   ├── 1_📉_Degradacao_Circuito.py
│   │   ├── 2_📈_Pirelli_Report_Card.py
│   │   ├── 3_🗺️_Perfil_Circuitos.py
│   │   ├── 4_🌡️_Weather_Impact.py
│   │   └── 5_🔬_Explorador.py
│   ├── lib/                      # db, theme, components compartilhados
│   │   ├── db.py
│   │   ├── theme.py
│   │   └── components.py
│   └── .streamlit/
│       └── config.toml           # Tema dark F1
├── cache/                        # Cache FastF1 (montado no container)
├── docker-compose.yml
├── Dockerfile.airflow
├── Dockerfile.streamlit
├── CLAUDE.md                     # Guia de contexto para o Claude Code
└── README.md
```

-----

## Como Usar

### 1. Pré-requisitos

Docker e Docker Compose instalados.

### 2. Subir tudo

```bash
git clone <URL_DO_REPOSITORIO>
cd f1-data-pipeline
docker-compose up --build
```

Sobe três serviços: `postgres`, `airflow` e `streamlit`.

### 3. Acessos

| UI         | URL                      | Credenciais     |
|------------|--------------------------|-----------------|
| Airflow    | http://localhost:8080    | `admin / admin` |
| Streamlit  | http://localhost:8501    | —               |
| PostgreSQL | `localhost:5432`, db `f1`| `airflow / airflow` |

### 4. Primeira execução

1. No Airflow, ative e dispare a DAG **`f1_historical_backfill`** para popular 2018 → 2026 (rodada manual, sequencial — leva tempo na primeira vez por causa do download do FastF1).
2. **Rodar a seed Pirelli UMA vez** — o pipeline daily não materializa seeds, e sem ela o `stg_laps` quebra:
   ```bash
   docker exec -it f1-data-pipeline-airflow-1 bash -lc \
     "cd /opt/airflow/f1_transform && dbt seed --profiles-dir ."
   ```
3. A DAG **`f1_pipeline`** roda diariamente e pega só corridas novas. O dbt **sempre executa** ao final, mesmo sem dados novos, para refletir backfills/reprocessamentos.
4. Abra o Streamlit em `localhost:8501` para navegar pelo dashboard.

> ⚠️ **Seed Pirelli e ciclo de vida**
> O arquivo `f1_transform/seeds/pirelli_compound_allocations.csv` mapeia `(year, round_number) → (c_hard, c_medium, c_soft)`. Como o FastF1 não expõe o composto físico (C1–C5), o `stg_laps` faz LEFT JOIN com essa seed.
>
> O `DbtTaskGroup` do Cosmos **só roda models, não seeds**. Por isso a seed precisa ser rodada manualmente nas seguintes situações:
> - Após `docker-compose down -v` (volume zerado)
> - Após editar a CSV (ex.: adicionar novos anos de alocações)
>
> Cobertura atual da seed: **2022–2025** (92 GPs, com 2022 e 2025 como best-effort). Anos não cobertos (2018–2021, 2026) terão `compound_name = NULL` e ficam fora de `marts.compound_physical_evolution`. Para expandir, basta editar a CSV e rerodar `dbt seed`.

-----

## DAGs

### `f1_pipeline` (incremental, `@daily`)

```
create_schemas → check_new_data → ingest_fastf1_data → dbt_transform (Cosmos)
```

- `check_new_data` consulta `raw.fastf1_laps` para descobrir rounds já carregados.
- `ingest_fastf1_data` pula corridas já presentes e qualquer corrida futura.
- `dbt_transform` é um `DbtTaskGroup` do Cosmos que materializa staging + marts.

### `f1_historical_backfill` (manual)

- Processa **anos 2018 → 2026 sequencialmente** (chain de tasks).
- Sequencial por design: evita corrupção do cache do FastF1 sob concorrência.
- Primeira task é `create_schemas` (idempotente) — backfill funciona mesmo se for a primeira DAG a rodar num ambiente novo.
- 2014–2017 **não** são processados: o FastF1 Live Timing API só serve laps detalhados a partir de 2018 — sessões anteriores retornam `DataNotLoadedError` em todas as corridas.

-----

## Dashboard (Streamlit)

Layout multi-page nativo (entry point: `Home.py`, páginas em `pages/`), tema dark F1, fonte Titillium Web.

1. **🏠 Visão Geral** — KPIs gerais + degradação média global por composto categórico.
2. **📉 Degradação por Circuito** — curva por composto em um GP específico + variação YoY. Filtros encadeados (circuito → anos disponíveis → compostos usados).
3. **📈 Pirelli Report Card** — evolução do **composto físico** C1–C5 (a comparação correta entre anos). Toggle "Modo honesto" filtra circuitos com cobertura ≥80% no range para mitigar viés de calendário.
4. **🗺️ Perfil de Circuitos** — heatmap circuito × composto, top-5 mais agressivos, distribuição por tier.
5. **🌡️ Weather Impact** — scatter `track_temp × deg` por stint + heatmap por bucket de temperatura. Banner dinâmico de cobertura de weather.
6. **🔬 Explorador** — editor de SQL livre contra o schema `marts`.

Cores centralizadas em [`dashboard/lib/theme.py`](dashboard/lib/theme.py): `COMPOUND_COLORS` (categórico, padrão Pirelli) e `PHYSICAL_COMPOUND_COLORS` (C1–C5, gradiente claro→quente).

-----

## Comandos Úteis

```bash
# Só o banco (útil para desenvolver dbt localmente)
docker-compose up postgres

# Rodar dbt manualmente dentro do container Airflow
docker exec -it <airflow_container> bash
dbt run    --project-dir /opt/airflow/f1_transform --profiles-dir /opt/airflow/f1_transform
dbt test   --project-dir /opt/airflow/f1_transform --profiles-dir /opt/airflow/f1_transform

# Rodar um modelo específico
dbt run --select tyre_degradation

# Logs do Airflow em tempo real
docker-compose logs -f airflow
```

-----

## Contexto de Domínio (F1 / Pirelli)

- **Stint**: sequência de voltas no mesmo conjunto de pneus.
- **Deg per lap (s)**: quanto o pneu perde de pace por volta — métrica central do projeto.
- **Compound**: categoria de dureza (SOFT = mais rápido/menos durável; HARD = oposto).
- **Compound name (C1–C5)**: composto físico específico que a Pirelli traz para cada GP. Como o FastF1 **não expõe** essa informação, o mapeamento vem da seed `f1_transform/seeds/pirelli_compound_allocations.csv` (manual). Atualmente cobre 2023 e 2024 — anos não mapeados ficam com `compound_name = NULL`.
- **TyreLife**: número de voltas que aquele set já rodou até aquela volta.
- **FreshTyre**: se o set era novo ao entrar na pista.
- A **era moderna** de estratégia de pneus começa em 2018 — alguns marts filtram a partir desse ano (ver `circuit_tyre_profile.sql`).
- Dados disponíveis via FastF1: **timing detalhado a partir de 2018** (Live Timing API). Anos anteriores existem no cache mas retornam `DataNotLoadedError` ao tentar carregar laps.

-----

## Documentação Adicional

Para detalhes operacionais, convenções de schema/nomenclatura, e o que **não** alterar sem discussão, ver [`CLAUDE.md`](./CLAUDE.md).
