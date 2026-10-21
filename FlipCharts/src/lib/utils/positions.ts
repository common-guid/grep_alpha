/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure helpers for Alpaca PAPER positions (GET /api/positions on the backend).
 */

export interface PaperPosition {
  symbol: string;
  side: 'long' | 'short';
  qty: number | null;
  avg_entry_price: number | null;
  current_price: number | null;
  market_value?: number | null;
  unrealized_pl?: number | null;
  unrealized_plpc: number | null;
  on_watchlist?: boolean;
}

export type PositionsStatus = 'loading' | 'ok' | 'unconfigured' | 'error';

export interface PositionsSnapshot {
  status: PositionsStatus;
  fetched_at: string | null;
  stale: boolean;
  positions: PaperPosition[];
  error: string | null;
}

export const LOADING_SNAPSHOT: PositionsSnapshot = {
  status: 'loading', fetched_at: null, stale: false, positions: [], error: null,
};

/** Coerce an unknown JSON body into a snapshot; anything malformed becomes an error snapshot. */
export function parseSnapshot(body: unknown): PositionsSnapshot {
  const b = body as Partial<PositionsSnapshot> | null;
  if (!b || typeof b !== 'object' || !Array.isArray(b.positions)
    || !['ok', 'unconfigured', 'error'].includes(String(b.status))) {
    return { ...LOADING_SNAPSHOT, status: 'error', error: 'Unexpected response from /api/positions' };
  }
  return {
    status: b.status as PositionsStatus,
    fetched_at: b.fetched_at ?? null,
    stale: !!b.stale,
    error: b.error ?? null,
    positions: b.positions
      .filter((p) => p && typeof p.symbol === 'string' && p.symbol)
      .map((p) => ({ ...p, symbol: p.symbol.toUpperCase(), side: p.side === 'short' ? 'short' : 'long' })),
  };
}

export function positionsMap(snap: PositionsSnapshot): Map<string, PaperPosition> {
  const m = new Map<string, PaperPosition>();
  for (const p of snap.positions) m.set(p.symbol.toUpperCase(), p);
  return m;
}

/**
 * Keep only held symbols. When `extraHeld` is true (the "All Symbols" list), held
 * symbols missing from `symbols` are appended so a fresh fill shows before the
 * watchlist sync lands.
 */
export function filterByHeld<T extends { symbol: string }>(
  items: T[], held: Map<string, PaperPosition>, extraHeld: boolean, make: (symbol: string) => T,
): T[] {
  const out = items.filter((i) => held.has(i.symbol.toUpperCase()));
  if (extraHeld) {
    const have = new Set(items.map((i) => i.symbol.toUpperCase()));
    for (const sym of [...held.keys()].sort()) if (!have.has(sym)) out.push(make(sym));
  }
  return out;
}

/** Symbols held but not on the watchlist, sorted; drives the auto-sync. */
export function missingFromWatchlist(snap: PositionsSnapshot, watchlist: Iterable<string>): string[] {
  if (snap.status !== 'ok' || snap.stale) return [];
  const have = new Set([...watchlist].map((s) => s.toUpperCase()));
  return snap.positions.map((p) => p.symbol).filter((s) => !have.has(s)).sort();
}

function fmtQty(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function fmtPct(plpc: number): string {
  const pct = plpc * 100;
  const s = Math.abs(pct) < 0.005 ? '0.00' : Math.abs(pct).toFixed(2);
  return `${pct > 0.0049 ? '+' : pct < -0.0049 ? '−' : ''}${s}%`;
}

export interface HeldBadge {
  /** Full text, e.g. "10 @ 185.20 · +2.65%" or "SHORT 5 @ 250.00 · −1.20%". */
  text: string;
  /** Narrow-card text, e.g. "10 · +2.65%". */
  short: string;
  tone: 'up' | 'down' | 'flat';
  title: string;
}

export function heldBadge(p: PaperPosition): HeldBadge {
  const side = p.side === 'short' ? 'SHORT ' : '';
  const qty = p.qty != null ? fmtQty(p.qty) : '?';
  const avg = p.avg_entry_price != null ? p.avg_entry_price.toFixed(2) : '—';
  const pct = p.unrealized_plpc != null ? fmtPct(p.unrealized_plpc) : '—';
  const tone = p.unrealized_plpc == null || Math.abs(p.unrealized_plpc) < 0.00005
    ? 'flat' : p.unrealized_plpc > 0 ? 'up' : 'down';
  const pl = p.unrealized_pl != null ? ` · unrealized ${p.unrealized_pl >= 0 ? '+' : '−'}$${Math.abs(p.unrealized_pl).toFixed(2)}` : '';
  return {
    text: `${side}${qty} @ ${avg} · ${pct}`,
    short: `${side}${qty} · ${pct}`,
    tone,
    title: `Paper position: ${p.side} ${qty} sh, avg cost ${avg}${p.current_price != null ? `, last ${p.current_price.toFixed(2)}` : ''}${pl} (${pct})`,
  };
}
