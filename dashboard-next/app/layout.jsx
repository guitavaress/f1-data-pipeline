import "./globals.css";
import { Sidebar } from "@/design/components/shell";
import { Crumbs } from "./crumbs";
import { query } from "@/lib/db";

export const metadata = {
  title: "F1 Pirelli Analytics",
  description: "Tyre intelligence — Pirelli era 2018–2026",
};

async function getLastRun() {
  // Métricas de status do pipeline pra sidebar footer. Falha silenciosa —
  // não queremos quebrar layout se DB cair.
  try {
    const { rows } = await query(`
      WITH latest AS (
        SELECT year, round_number, event_name, fetch_time
        FROM raw.fastf1_laps
        ORDER BY year DESC, round_number DESC, fetch_time DESC
        LIMIT 1
      )
      SELECT * FROM latest
    `);
    const r = rows[0];
    if (!r) return null;
    return {
      timestamp: r.fetch_time
        ? new Date(r.fetch_time).toISOString().replace("T", " ").slice(0, 19) + " UTC"
        : null,
      latest_round: { year: r.year, name: r.event_name, round: r.round_number },
    };
  } catch (e) {
    return null;
  }
}

export default async function RootLayout({ children }) {
  const lastRun = await getLastRun();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="app">
          <Sidebar lastRun={lastRun} />
          <div className="main">
            <Crumbs />
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
