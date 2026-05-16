/**
 * Postgres connection pool — porta o que dashboard/lib/db.py fazia.
 *
 * DB_URI Streamlit:  postgresql+psycopg2://airflow:airflow@postgres:5432/f1
 * DB_URI node-pg:    postgresql://airflow:airflow@postgres:5432/f1
 *
 * No container, `postgres` resolve via Docker DNS. Localmente em desenvolvimento
 * fora do compose, usar DATABASE_URL=postgresql://airflow:airflow@localhost:5432/f1.
 */
import { Pool, types } from "pg";

// node-pg retorna BIGINT (oid 20) e NUMERIC (oid 1700) como string por default
// pra preservar precisão arbitrária. Nesta app, todos os counts/aggregates
// cabem em Number — converter pra float aqui evita ".toFixed is not a function"
// nos componentes.
types.setTypeParser(20,   (v) => v == null ? null : Number(v));   // int8 / bigint
types.setTypeParser(1700, (v) => v == null ? null : Number(v));   // numeric

const DB_URI =
  process.env.DATABASE_URL ||
  "postgresql://airflow:airflow@postgres:5432/f1";

// Singleton em dev — Next.js HMR re-executa esse módulo.
let pool;
if (!global._f1Pool) {
  global._f1Pool = new Pool({
    connectionString: DB_URI,
    max: 5,
    idleTimeoutMillis: 30_000,
  });
}
pool = global._f1Pool;

/**
 * Executa uma query e devolve { rows, fields }. Erros propagam.
 * Cache de 5 min via Next.js fetch tagging fica por conta de quem chama
 * (rota com `export const revalidate = 300`).
 */
export async function query(text, params = []) {
  const result = await pool.query(text, params);
  return { rows: result.rows, fields: result.fields };
}

/**
 * Helper: monta cláusula IN para compostos. Vazio → string que casa zero linhas.
 * (Equivalente a compounds_sql em lib/db.py.)
 */
export function compoundsSql(lst) {
  if (!lst || !lst.length) return "''";
  return lst.map((c) => `'${String(c).replace(/'/g, "''")}'`).join(",");
}

/** Escape simples de valor único pra SQL (usar só em filtros conhecidos). */
export function sqlString(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}
