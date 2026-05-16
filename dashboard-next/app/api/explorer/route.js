/**
 * SQL Explorer API — alimenta /explorer.
 * Executa SQL livre contra o banco, mas com guard básico de read-only:
 *   - apenas uma statement (sem ;)
 *   - precisa começar com SELECT (case-insensitive, ignorando whitespace e WITH)
 *   - blacklist de keywords destrutivas
 *
 * NÃO substitui um role read-only de verdade no Postgres — esse é o caminho
 * recomendado em produção. Aqui é guard de defesa em profundidade.
 *
 * Equivalente a dashboard/pages/5_🔬_Explorador.py.
 */
import { query } from "@/lib/db";

const FORBIDDEN = [
  /\bdrop\b/i, /\btruncate\b/i, /\bdelete\b/i, /\binsert\b/i, /\bupdate\b/i,
  /\balter\b/i, /\bgrant\b/i, /\brevoke\b/i, /\bcreate\b/i, /\breindex\b/i,
  /\bvacuum\b/i, /\bcluster\b/i, /\bcopy\b/i, /\b--/, /\/\*/,
];

function validate(sql) {
  if (!sql || !sql.trim()) return "SQL vazio";
  // Remove só comentários puramente whitespace; mantém o resto pra detectar abuso
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (trimmed.includes(";")) return "Apenas uma statement permitida (sem ';' no meio)";
  const head = trimmed.replace(/^\s*(with\s+[\s\S]+?\)\s*)*/i, "").trimStart();
  if (!/^select\b/i.test(head)) return "Apenas SELECT (opcionalmente precedido por WITH)";
  for (const re of FORBIDDEN) {
    if (re.test(trimmed)) return `Keyword bloqueada: ${re.source}`;
  }
  return null;
}

export async function POST(request) {
  const { sql } = await request.json();
  const err = validate(sql);
  if (err) return Response.json({ error: err }, { status: 400 });

  const t0 = Date.now();
  try {
    const { rows, fields } = await query(sql);
    const elapsed = Date.now() - t0;
    return Response.json({
      rows: rows.slice(0, 1000), // hard cap
      truncated: rows.length > 1000,
      total_rows: rows.length,
      columns: fields.map((f) => f.name),
      elapsed_ms: elapsed,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
