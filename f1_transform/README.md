# f1_transform — projeto dbt do F1 Pirelli Pipeline

Modelos de staging e marts que transformam `raw.fastf1_laps` (ingerido pelo Airflow) em tabelas analíticas. Documentação de domínio e convenções está no [`../CLAUDE.md`](../CLAUDE.md).

---

## Camadas

```
sources.raw.fastf1_laps              ← ingestão FastF1 (fora deste projeto)
       │
       ▼
staging.stg_laps                     ← cast, filtros (laptime<300, trackstatus='1'),
                                       JOIN com seed Pirelli para popular compound_name
staging.stg_tyre_stints              ← agregação por stint;
                                       deg_per_lap_s via regr_slope com warm-up filter
       │
       ▼
marts.tyre_degradation               ← (incremental) deg × composto × circuito × ano
marts.compound_evolution             ← evolução categórica SOFT/MEDIUM/HARD + coluna `era`
marts.compound_physical_evolution    ← evolução por composto físico C1–C5 (depende da seed)
marts.circuit_tyre_profile           ← perfil de agressividade por circuito
marts.tyre_weather_profile           ← deg × bucket de temperatura de pista
```

---

## Seeds

`seeds/pirelli_compound_allocations.csv` — mapeamento `(year, round_number) → (c_hard, c_medium, c_soft)` necessário porque o FastF1 não expõe o composto físico Pirelli. Cobertura atual: 2022–2025. `stg_laps` faz LEFT JOIN com essa seed; anos sem allocation ficam com `compound_name = NULL` e não entram em `compound_physical_evolution`.

**Importante:** o `f1_pipeline` daily NÃO roda `dbt seed`. Rodar manualmente após `docker-compose down -v` ou ao editar o CSV:

```bash
docker exec -it f1-data-pipeline-airflow-1 bash -lc \
  "cd /opt/airflow/f1_transform && dbt seed --profiles-dir ."
```

---

## Comandos úteis (de dentro do container `airflow`)

```bash
cd /opt/airflow/f1_transform

dbt seed --profiles-dir .                                # carrega/recarrega seeds
dbt run  --profiles-dir .                                # materializa staging + marts
dbt run  --profiles-dir . --select tyre_degradation      # um modelo
dbt run  --profiles-dir . --select stg_laps+             # modelo e tudo downstream
dbt test --profiles-dir .                                # roda testes do schema.yml
```

`target-path` e `log-path` apontam para `/tmp/dbt-target` e `/tmp/dbt-logs` (fora do bind mount, evita `PermissionError` no Windows). Não reverter no `dbt_project.yml`.

---

## Convenções

- Todos os modelos materializam como `table`, exceto `tyre_degradation` (incremental, `unique_key=['year','circuit_key','compound']`).
- Sempre via `{{ ref() }}` ou `{{ source() }}`. Nunca usar string literal de schema.
- A macro `macros/schema_macros.sql` remove o prefixo padrão do dbt — schemas finais são `staging`, `marts`, `dbt_airflow` (e não `dbt_<env>_staging`).
- Métrica central `deg_per_lap_s` em `stg_tyre_stints`: `regr_slope(laptime_s, tyre_life) FILTER (WHERE tyre_life >= 3)`. O `FILTER` descarta warm-up.
- Filtros mínimos de qualidade:
  - `laptime < 300` e `trackstatus = '1'` em `stg_laps`
  - `stint_length >= 5` em `tyre_degradation` e `circuit_tyre_profile`
  - `stint_length >= 3` em `compound_evolution` e `compound_physical_evolution`

Detalhamento e contexto de domínio em [`../CLAUDE.md`](../CLAUDE.md).
