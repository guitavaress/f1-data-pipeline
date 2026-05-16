# dashboard-next — F1 Pirelli Analytics dashboard

Next.js 14 (App Router) app que substitui o Streamlit anterior (`dashboard/`).
Visual + UX seguem o handoff do Claude Design (`F1 Pirelli Analytics.html`).

Documentação de domínio fica em [`../CLAUDE.md`](../CLAUDE.md).

---

## Estrutura

```
dashboard-next/
├── package.json                 # next 14, react 18, pg 8 — só isso
├── next.config.js               # output: "standalone" pra Docker
├── jsconfig.json                # alias @/* → ./
├── lib/
│   └── db.js                    # pool node-pg + helpers (compoundsSql, sqlString)
├── design/                      # do handoff Claude Design — adaptado p/ ES modules
│   ├── styles.css               # tokens OKLCH + layout grid
│   ├── lib/charts.jsx           # SVG primitives: LineChart, BarChart, Heatmap, etc.
│   └── components/shell.jsx     # Sidebar, Topbar, KPI, Card, CompoundChip, …
├── app/                         # App Router
│   ├── layout.jsx               # shell: Sidebar + Topbar (Server Component)
│   ├── crumbs.jsx               # breadcrumbs (Client — lê pathname)
│   ├── globals.css              # importa design/styles.css
│   ├── page.jsx                 # Overview
│   ├── circuit/page.jsx         # Circuit Deep-Dive
│   ├── report/page.jsx          # Pirelli Report Card
│   ├── circuits/page.jsx        # Circuit Profiles
│   ├── weather/page.jsx         # Weather Impact
│   ├── explorer/page.jsx        # SQL Explorer
│   └── api/
│       ├── overview/route.js
│       ├── circuit/route.js
│       ├── report/route.js
│       ├── circuits/route.js
│       ├── weather/route.js
│       └── explorer/route.js    # POST, com guard read-only
└── public/favicon.svg
```

## Mapeamento de páginas → marts/staging

| Página            | API route          | Tabelas |
|-------------------|--------------------|---------|
| `/` (Overview)    | `/api/overview`    | `marts.compound_evolution`, `marts.tyre_degradation`, `marts.circuit_tyre_profile` |
| `/circuit`        | `/api/circuit`     | `marts.tyre_degradation`, `staging.stg_tyre_stints` |
| `/report`         | `/api/report`      | `marts.compound_physical_evolution` (não-honesto) ou `staging.stg_tyre_stints` re-agregado (honesto) |
| `/circuits`       | `/api/circuits`    | `marts.circuit_tyre_profile` |
| `/weather`        | `/api/weather`     | `staging.stg_laps` (cobertura), `staging.stg_tyre_stints` (scatter), `marts.tyre_weather_profile` (heatmap) |
| `/explorer`       | `/api/explorer`    | qualquer SELECT contra `marts.*` ou `staging.*` (guard server-side) |

## Conexão com o banco

Use a env `DATABASE_URL`. No `docker-compose`:

```
DATABASE_URL: postgresql://airflow:airflow@postgres:5432/f1
```

Em desenvolvimento local fora do compose:

```
DATABASE_URL=postgresql://airflow:airflow@localhost:5432/f1
```

`lib/db.js` configura o parser pra que `bigint` (oid 20) e `numeric` (oid 1700)
voltem como Number — sem isso `count(*)` viria como string e os componentes
de chart quebrariam.

## Conventions

- Páginas que precisam de interação (filtros, fetches) → `"use client"`. Tudo
  que é só renderização inicial → Server Component (default no App Router).
- **Tudo importa do `design/`**: `import { LineChart } from "@/design/lib/charts"`,
  `import { Card } from "@/design/components/shell"`. Sem hex literais soltos
  em página — adicionar nas variáveis CSS de `design/styles.css` se precisar.
- Charts são SVG puro escritos à mão — nenhuma dependência tipo recharts/visx.
  Editar em `design/lib/charts.jsx`. O contrato é estável: `LineChart` recebe
  `{ series: [{ key, label, color, points: [{x, y}] }] }`, etc.
- Caching: cada rota declara `export const revalidate = 300;` (5 min) — paridade
  com o `@st.cache_data(ttl=300)` do Streamlit antigo.

## Comandos

```bash
# Local (precisa de Node 20+)
npm install
npm run dev          # http://localhost:8501

# Build + start de produção
npm run build
npm start            # http://localhost:8501

# Via Docker (jeito padrão do projeto)
docker-compose up -d --build dashboard
```

## SQL Explorer — guard read-only

`POST /api/explorer` executa SQL livre mas barra:

- Mais de uma statement (sem `;` no meio)
- Comando que não começa por `SELECT` (com `WITH ...` permitido como prefixo)
- Keywords destrutivas (`DROP`, `DELETE`, `INSERT`, `UPDATE`, `ALTER`, `GRANT`,
  `TRUNCATE`, `CREATE`, `COPY`, `VACUUM`, `CLUSTER`, `REINDEX`, comentários `--`/`/*`)

Hard cap de 1000 linhas no resultado. **Isto é defesa em profundidade**, não
substitui um role Postgres read-only — quando colocar isso em rede maior, criar
um user `dashboard_ro` com `GRANT SELECT ON ALL TABLES IN SCHEMA marts, staging`
e setar `DATABASE_URL` pra ele.

## Out of scope deste primeiro merge

As 3 páginas "NEW" do prototype Claude Design (Strategy Lab, Allocation Calendar,
Compound vs Compound) ficam pra próxima iteração — todas usam dados que já
existem nos marts/seed atuais.

O tweaks panel do prototype (canto inferior direito) foi propositalmente
omitido — é ferramenta de design-time, não feature de produção.
