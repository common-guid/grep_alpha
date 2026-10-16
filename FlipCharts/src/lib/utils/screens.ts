/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure helpers for screen results (GET /api/screens..., contract docs/screens-api.md).
 * Everything is driven by the run's `columns`, so any screen works without code changes.
 */

export interface ScreenColumn { key: string; label: string; fmt: string }
export interface ScreenRow { ticker: string; rank: number; on_watchlist?: boolean; [k: string]: unknown }
export interface ScreenRun {
  id: number; screen: string; version: number; run_at: string; as_of: string;
  params: Record<string, unknown>; universe: Record<string, unknown>; source: string;
  columns: ScreenColumn[]; rows: ScreenRow[]; row_count: number;
}
export interface ScreenSummary {
  screen: string; runs: number;
  latest: { id: number; run_at: string; as_of: string; row_count: number; source: string };
}

export const SCREEN_NAME_RE = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
export const SCREEN_SORT_RE = /^sc:[a-z_][a-z0-9_]{0,39}$/;

export function parseScreenList(body: unknown): ScreenSummary[] {
  const s = (body as { screens?: unknown })?.screens;
  if (!Array.isArray(s)) return [];
  return s.filter((x) => x && typeof x.screen === 'string' && x.latest && typeof x.latest.as_of === 'string');
}

export function parseScreenRun(body: unknown): ScreenRun | null {
  const b = body as Partial<ScreenRun> | null;
  if (!b || typeof b.screen !== 'string' || !Array.isArray(b.rows) || !Array.isArray(b.columns)) return null;
  return {
    ...(b as ScreenRun),
    rows: b.rows.filter((r) => r && typeof r.ticker === 'string').map((r) => ({ ...r, ticker: r.ticker.toUpperCase() })),
    columns: b.columns.filter((c) => c && typeof c.key === 'string'),
  };
}

const MINUS = '−';

/** Format one value per the column's fmt (f0-f4, pct0-4, fracpct0-4, usd, int, text). */
export function formatValue(fmt: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (fmt === 'text' || typeof v !== 'number' || !Number.isFinite(v)) return String(v);
  const m = /^(f|pct|fracpct)([0-4])$/.exec(fmt);
  if (m) {
    const d = Number(m[2]);
    if (m[1] === 'f') return v < 0 ? MINUS + Math.abs(v).toFixed(d) : v.toFixed(d);
    const pct = m[1] === 'fracpct' ? v * 100 : v;
    const s = Math.abs(pct).toFixed(d);
    const zero = Number(s) === 0;
    return `${zero ? '' : pct > 0 ? '+' : MINUS}${s}%`;
  }
  if (fmt === 'usd') return `${v < 0 ? MINUS : ''}$${Math.abs(v).toFixed(2)}`;
  if (fmt === 'int') return String(Math.round(v));
  return String(v);
}

/** Card badge: "#1 · Slope %/d +4.57% · R² 0.94" (first `max` columns). */
export function screenBadge(row: ScreenRow, columns: ScreenColumn[], max = 3): { text: string; short: string; title: string } {
  const parts = columns.slice(0, max).map((c) => `${c.label} ${formatValue(c.fmt, row[c.key])}`);
  const all = columns.map((c) => `${c.label}: ${formatValue(c.fmt, row[c.key])}`);
  const vals = columns.slice(0, 2).map((c) => formatValue(c.fmt, row[c.key]));
  return {
    text: [`#${row.rank}`, ...parts].join(' · '),
    short: [`#${row.rank}`, ...vals].join(' · '),
    title: `Rank ${row.rank}${all.length ? ` · ${all.join(' · ')}` : ''}`,
  };
}

export function screenRowMap(run: ScreenRun | null): Map<string, ScreenRow> {
  const m = new Map<string, ScreenRow>();
  for (const r of run?.rows ?? []) m.set(r.ticker.toUpperCase(), r);
  return m;
}

/**
 * Keep only symbols the screen returned. With `extra` (All Symbols, no date filter,
 * Held off), screen hits missing from `items` are appended in rank order.
 */
export function filterByScreen<T extends { symbol: string }>(
  items: T[], rows: Map<string, ScreenRow>, extra: boolean, make: (symbol: string) => T,
): T[] {
  const out = items.filter((i) => rows.has(i.symbol.toUpperCase()));
  if (extra) {
    const have = new Set(items.map((i) => i.symbol.toUpperCase()));
    const missing = [...rows.values()].filter((r) => !have.has(r.ticker)).sort((a, b) => a.rank - b.rank);
    for (const r of missing) out.push(make(r.ticker));
  }
  return out;
}

// NYSE full-day closures (weekdays). Extend yearly.
const HOLIDAYS = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03',
  '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05',
  '2027-09-06', '2027-11-25', '2027-12-24',
]);

function etParts(now: Date): { date: string; minutes: number } {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

function isTradingDay(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd !== 0 && wd !== 6 && !HOLIDAYS.has(iso);
}

function prevDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/** Most recent trading day whose close is in (after 16:30 ET counts today). */
export function lastTradingDay(now: Date = new Date()): string {
  const { date, minutes } = etParts(now);
  let d = date;
  if (!(isTradingDay(d) && minutes >= 16 * 60 + 30)) d = prevDay(d);
  while (!isTradingDay(d)) d = prevDay(d);
  return d;
}

export function isScreenStale(asOf: string, now: Date = new Date()): boolean {
  return asOf < lastTradingDay(now);
}

/** "10-15" style short date, with the year when it isn't the current one. */
export function shortDate(iso: string, now: Date = new Date()): string {
  return iso.slice(0, 4) === String(now.getFullYear()) ? iso.slice(5) : iso;
}
