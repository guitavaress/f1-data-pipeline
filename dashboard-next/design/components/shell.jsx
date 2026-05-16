/* Shared shell components — Sidebar, Topbar, PageHeader, KPI, etc.

   Adaptação do design/components/shell.jsx do prototype Claude Design:
   - 'use client' (todos são interativos)
   - imports React explícitos (era global no prototype)
   - exports ES no final (era Object.assign(window, ...))
   - Sidebar agora recebe `lastRun` como prop (em vez de ler window.F1DATA)
   - useRouter usado pra navegação real (em vez de onNav callback) */
"use client";

import React, { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV = [
  {
    section: "Analytics",
    items: [
      { id: "overview",   href: "/",          glyph: "01", label: "Overview" },
      { id: "circuit",    href: "/circuit",   glyph: "02", label: "Circuit Deep-Dive" },
      { id: "report",     href: "/report",    glyph: "03", label: "Pirelli Report Card" },
      { id: "circuits",   href: "/circuits",  glyph: "04", label: "Circuit Profiles" },
      { id: "weather",    href: "/weather",   glyph: "05", label: "Weather Impact" },
    ],
  },
  {
    section: "Tools",
    items: [
      { id: "explorer",   href: "/explorer",  glyph: "09", label: "SQL Explorer" },
    ],
  },
];

export function Sidebar({ lastRun }) {
  const pathname = usePathname();
  const isActive = (href) => href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">P/F1</div>
        <div>
          <div className="brand-name">Pirelli Analytics</div>
          <div className="brand-sub">F1 · 2018–2026</div>
        </div>
      </div>

      {NAV.map(s => (
        <div className="nav-section" key={s.section}>
          <div className="nav-label">{s.section}</div>
          {s.items.map(it => (
            <Link key={it.id} href={it.href}
                  className={`nav-item${isActive(it.href) ? " active" : ""}`}
                  style={{ textDecoration: "none", color: "inherit" }}>
              <span className="nav-glyph">{it.glyph}</span>
              <span>{it.label}</span>
              {it.tag && <span className="nav-tag">{it.tag}</span>}
            </Link>
          ))}
        </div>
      ))}

      <div className="sidebar-footer">
        <div className="status-row">
          <span className="status-dot" />
          <span>dbt · airflow · ok</span>
        </div>
        {lastRun?.timestamp && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10,
                        color: "var(--fg-4)", marginTop: 6, letterSpacing: "0.04em" }}>
            last run · {lastRun.timestamp}
          </div>
        )}
        {lastRun?.latest_round && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10,
                        color: "var(--fg-3)", marginTop: 2 }}>
            latest · {lastRun.latest_round.year} {lastRun.latest_round.name}
          </div>
        )}
      </div>
    </aside>
  );
}

export function Topbar({ crumbs = [] }) {
  return (
    <div className="topbar">
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <Fragment key={i}>
            <span className={i === crumbs.length - 1 ? "cur" : ""}>{c}</span>
            {i < crumbs.length - 1 && <span className="sep">/</span>}
          </Fragment>
        ))}
      </div>
      <span className="pill">
        <span className="dot" style={{ background: "var(--good)" }} />
        <span>2026 SEASON · LIVE</span>
      </span>
      <div className="search">
        <span style={{ color: "var(--fg-4)" }}>⌕</span>
        <span style={{ flex: 1 }}>search circuits, stints, drivers…</span>
        <span className="kbd">⌘K</span>
      </div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, desc, right }) {
  return (
    <header className="page-header">
      <div>
        <div className="page-eyebrow">{eyebrow}</div>
        <h1 className="page-title">{title}</h1>
        {desc && <p className="page-desc">{desc}</p>}
      </div>
      {right && <div className="page-meta">{right}</div>}
    </header>
  );
}

export function KPI({ label, value, hint, delta, deltaDir }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {(hint || delta) && (
        <div className="kpi-foot">
          {delta && (
            <span className={`kpi-delta ${deltaDir || ""}`}>
              {deltaDir === "up" ? "▲" : deltaDir === "down" ? "▼" : ""} {delta}
            </span>
          )}
          {hint && <span>{hint}</span>}
        </div>
      )}
    </div>
  );
}

export function Card({ title, sub, right, children, flush, style }) {
  return (
    <div className="card" style={style}>
      {(title || right) && (
        <div className="card-head">
          <div>
            <div className="card-title">{title}</div>
            {sub && <div className="card-sub">{sub}</div>}
          </div>
          {right}
        </div>
      )}
      <div className={`card-body${flush ? " flush" : ""}`}>{children}</div>
    </div>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="seg">
      {options.map(o => (
        <div key={o.value} className={`seg-item${value === o.value ? " active" : ""}`}
             onClick={() => onChange(o.value)}>
          {o.label}
        </div>
      ))}
    </div>
  );
}

export function CompoundChip({ compound, active, onClick }) {
  return (
    <span className={`chip${active ? " active" : ""}`} onClick={onClick}>
      <span className={`swatch sw-${compound}`} />
      <span>{compound}</span>
    </span>
  );
}

export function Legend({ items }) {
  return (
    <div className="legend">
      {items.map((it, i) => (
        <div key={i} className="legend-item">
          {it.kind === "dot"
            ? <span className="legend-dot" style={{ background: it.color }} />
            : <span className="legend-swatch" style={{ background: it.color }} />}
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, hint }) {
  return (
    <div style={{
      border: "1px dashed var(--border)",
      borderRadius: 8,
      padding: "2.5rem",
      textAlign: "center",
      background: "var(--bg)",
      color: "var(--fg-3)",
    }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11,
                    letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--fg-4)" }}>
        ⌀ NO DATA
      </div>
      <div style={{ marginTop: 8, fontSize: 14, color: "var(--fg-2)" }}>{title}</div>
      {hint && <div style={{ marginTop: 4, fontSize: 12 }}>{hint}</div>}
    </div>
  );
}
