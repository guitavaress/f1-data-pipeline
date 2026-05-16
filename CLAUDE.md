# CLAUDE.md — F1 Data Pipeline

Guia de contexto para o Claude Code trabalhar neste repositório.

---

## Visão Geral do Projeto

Pipeline de dados de Fórmula 1 que coleta voltas de corrida via **FastF1**, armazena em **PostgreSQL** e transforma com **dbt**, orquestrado pelo **Apache Airflow**. O objetivo central é analisar degradação e evolução dos compostos Pirelli de 2014 a 2026.

---

## Stack e Serviços

| Serviço     | Tecnologia                        | Porta  |
|-------------|-----------------------------------|--------|
| Orquestração | Apache Airflow 2.8.1 + Cosmos    | 8080   |
| Banco        | PostgreSQL 15                    | 5432   |
| Transformação| dbt-postgres 1.7.11              | —      |
| Dashboard    | Streamlit + Plotly               | 8501   |
| Ingestão     | FastF1 (Python)                  | —      |

Credenciais locais (desenvolvimento): `airflow / airflow`, banco `f1`.

---

## Arquitetura de Dados (Medallion)

```
FastF1 API
    │
    ▼
raw.fastf1_laps                   ← ingestão bruta (load_fastf1.py) + weather por volta
    │
    ▼
staging.stg_laps                  ← limpeza, cast, filtros (trackstatus='1', laptime<300)
staging.stg_tyre_stints           ← agregação por stint; deg_per_lap_s via regr_slope
    │
    ▼
marts.tyre_degradation            ← deg. por composto × circuito × ano (incremental)
marts.compound_evolution          ← evolução categórica SOFT/MEDIUM/HARD com coluna `era`
marts.compound_physical_evolution ← evolução por composto físico C1–C5 (2018+)
marts.circuit_tyre_profile        ← perfil de agressividade por circuito
```

---

## Estrutura de Diretórios

```
f1-data-pipeline/
├── dags/
│   ├── fastf1_load.py          # DAG principal (incremental, @daily)
│   ├── fastf1_backfill.py      # DAG de backfill histórico (trigger manual)
│   └── load_fastf1.py          # Lógica de ingestão FastF1 → raw.fastf1_laps
├── f1_transform/               # Projeto dbt
│   ├── dbt_project.yml         # target-path/log-path em /tmp (fora do bind mount)
│   ├── profiles.yml            # ⚠️ credenciais — não versionar secrets reais
│   ├── macros/
│   │   └── schema_macros.sql   # Evita prefixo padrão do dbt nos schemas
│   └── models/
│       ├── src.yml             # Declaração da source raw.fastf1_laps
│       ├── staging/
│       │   ├── stg_laps.sql
│       │   └── stg_tyre_stints.sql
│       └── marts/
│           ├── schema.yml
│           ├── tyre_degradation.sql            (incremental)
│           ├── compound_evolution.sql          (table — categoria SOFT/MEDIUM/HARD)
│           ├── compound_physical_evolution.sql (table — C1–C5, 2018+)
│           └── circuit_tyre_profile.sql        (table)
├── dashboard/
│   └── app.py                  # Streamlit — 5 páginas de análise
├── docker-compose.yml
├── Dockerfile.airflow
├── Dockerfile.streamlit
└── CLAUDE.md                   # este arquivo
```

---

## Convenções Importantes

### Schemas e Nomenclatura
- Schemas fixos: `raw`, `staging`, `marts`, `dbt_airflow` (log do dbt)
- A macro `generate_schema_name` em `macros/schema_macros.sql` **remove o prefixo padrão** do dbt — não alterar esse comportamento
- Colunas de tempo sempre em **segundos** (float), nunca timedelta
- Colunas de composto sempre **UPPER**: `SOFT`, `MEDIUM`, `HARD`, `INTERMEDIATE`, `WET`
- `compound` = categoria do pneu (SOFT/MEDIUM/HARD); `compound_name` = composto físico Pirelli (C1–C5)
- `circuit_key` em staging é derivado de `event_name` (estável por temporada/patrocinador), **não** de `OfficialEventName` do raw

### Python / Airflow
- Python **3.10** no container Airflow, **3.11** no Streamlit, **3.13t** local (`.tool-versions`)
- Cache do FastF1 em `/opt/airflow/cache` (mapeado via volume Docker)
- `load_fastf1.py` vive em `dags/` para ser importado pelas DAGs via `from load_fastf1 import ...`
- `get_processed_rounds(year)` consulta `raw.fastf1_laps` para garantir idempotência — não ingerir round já existente
- Colunas lidas do FastF1 estão em `LAP_COLUMNS` (load_fastf1.py) — se FastF1 mudar API, ajustar ali
- **Weather**: `AirTemp/TrackTemp/Humidity/Rainfall` são alinhados por tempo via `laps.get_weather_data()` e injetados em cada volta
- `ensure_weather_columns()` adiciona idempotentemente as colunas de weather em `raw.fastf1_laps` — chamado pelo DAG `create_schemas` e pela ingestão (permite dbt rodar contra dados antigos com NULL nessas colunas)
- Novos campos do FastF1: adicionar em `LAP_COLUMNS`, propagar em `stg_laps.sql` e (se necessário) criar migração idempotente como `ensure_weather_columns`
- Quando o FastF1 não retorna `CompoundName` confiável (anos antigos), aplica-se fallback `SOFT→C_SOFT`, `MEDIUM→C_MEDIUM`, etc. — esses valores **não** entram em `compound_physical_evolution` (filtrado para C1–C5 reais)

### dbt
- Todos os modelos usam `+materialized: table`, exceto `tyre_degradation` que é `incremental`
- `unique_key` do incremental: `['year', 'circuit_key', 'compound']`
- `target-path` e `log-path` apontam para `/tmp/dbt-target` e `/tmp/dbt-logs` para evitar `PermissionError` no bind mount (uid airflow=50000 vs owner do host)
- Filtros mínimos de qualidade:
  - `stint_length >= 5` em `tyre_degradation` e `circuit_tyre_profile`
  - `stint_length >= 3` em `compound_evolution` e `compound_physical_evolution`
  - `laptime < 300` e `trackstatus = '1'` em `stg_laps` (pista verde — sem SC/VSC/yellow/red)
- Degradação por volta usa **regressão linear** (`regr_slope(laptime_s, tyre_life)`) em `stg_tyre_stints`, não `max - min`. Robusto a outliers. `deg_fit_r2` indica qualidade do ajuste
- `compound_physical_evolution` é restrito a `year >= 2018` e `compound_name in ('C1'..'C5')` — visão metodologicamente correta para evolução do produto Pirelli
- `compound_evolution` tem coluna `era` (`'classic'` ≤2017 / `'modern'` ≥2018) — comparações entre eras são apenas categóricas, não físicas
- Não usar `{{ target.schema }}` diretamente — sempre via macro ou `{{ ref() }}`/`{{ source() }}`

### Dashboard (Streamlit)
- `COMPOUND_COLORS` centraliza as cores dos compostos — usar sempre esse dict
- `@st.cache_data(ttl=300)` em todas as queries ao banco
- Página "🔬 Explorador" permite SQL livre contra o schema `marts`

---

## Comandos Frequentes

```bash
# Subir todos os serviços
docker-compose up --build

# Só o banco (útil para desenvolver dbt localmente)
docker-compose up postgres

# Rodar dbt manualmente (dentro do container Airflow)
docker exec -it <airflow_container> bash
dbt run --project-dir /opt/airflow/f1_transform --profiles-dir /opt/airflow/f1_transform

# Rodar modelo específico
dbt run --select tyre_degradation

# Testar qualidade dos dados
dbt test

# Ver logs do Airflow
docker-compose logs -f airflow

# Trigger manual do backfill histórico (2014–2026)
# Via UI Airflow em http://localhost:8080 → DAG: f1_historical_backfill
```

---

## DAGs

### `f1_pipeline` (incremental, @daily)
```
create_schemas → check_new_data → ingest_fastf1_data → dbt_transform (Cosmos)
```
- `create_schemas` também chama `ensure_weather_columns()` para migrar `raw.fastf1_laps` antes do dbt rodar
- O dbt **sempre roda**, mesmo sem corridas novas (garante reprocessamentos)
- `CURRENT_YEAR` é derivado de `datetime.now().year` — sem hardcode

### `f1_historical_backfill` (trigger manual)
- Processa anos 2014–2026 **sequencialmente** (chain de tasks)
- Sequencial por design: evita corrupção do cache do FastF1

---

## O que NÃO Alterar Sem Discussão

- `macros/schema_macros.sql` — quebra todos os schemas se removido
- `unique_key` do modelo `tyre_degradation` — afeta o incremental
- Filtros `laptime < 300` e `trackstatus = '1'` em `stg_laps.sql` — removem laps de safety car/bandeira/VSC que distorcem degradação
- `regr_slope` como métrica de degradação em `stg_tyre_stints` — substitui o range `max-min` (sensível a outliers)
- `target-path` / `log-path` para `/tmp/...` no `dbt_project.yml` — necessário por causa de permissões do bind mount Docker
- Restrição `year >= 2018` em `compound_physical_evolution` — antes disso não havia sistema C1–C5
- Estrutura de volumes no `docker-compose.yml` — Airflow depende dos mounts para achar o projeto dbt
- `profiles.yml` — nunca commitar credenciais de produção aqui

---

## Contexto de Domínio (F1 / Pirelli)

- **Stint**: sequência de voltas no mesmo conjunto de pneus
- **Deg per lap (s)**: quanto o pneu perde de performance por volta — métrica central do projeto. Calculado como coeficiente angular da regressão `laptime ~ tyre_life` dentro do stint
- **Compound**: categoria de dureza (SOFT = mais rápido/menos durável, HARD = contrário). Significado mudou em 2019 — comparações categóricas entre eras são ambíguas
- **Compound name (C1–C5)**: composto físico específico que a Pirelli traz para cada GP. Disponível de forma confiável a partir de 2018. **A única forma honesta de medir evolução do produto Pirelli ao longo dos anos**
- **TyreLife**: quantas voltas aquele set rodou até aquela volta
- **FreshTyre**: se o set era novo quando foi para a pista
- **TrackStatus = '1'**: pista verde. Outros códigos FastF1: 2=yellow, 4=SC, 5=red, 6=VSC, 7=VSC ending — todos filtrados em staging
- **Weather por volta**: cada lap tem leituras de AirTemp/TrackTemp/Humidity/Rainfall do momento em que foi rodada (alinhamento por tempo)
- Era moderna de estratégia: a partir de 2018 (filtro em `circuit_tyre_profile.sql` e `compound_physical_evolution.sql`)
- Dados disponíveis via FastF1: temporadas 2014–atual
