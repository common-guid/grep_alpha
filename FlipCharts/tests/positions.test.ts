import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PaperPosition, PositionsSnapshot } from '../src/lib/utils/positions.ts';
import {
  parseSnapshot, positionsMap, filterByHeld, missingFromWatchlist, heldBadge,
} from '../src/lib/utils/positions.ts';

const P = (symbol: string, o: Partial<PaperPosition> = {}): PaperPosition => ({
  symbol, side: 'long', qty: 10, avg_entry_price: 100, current_price: 102, unrealized_plpc: 0.02, ...o,
});
const snap = (positions: PaperPosition[], o: Partial<PositionsSnapshot> = {}): PositionsSnapshot =>
  ({ status: 'ok', fetched_at: '2026-10-15T20:00:00Z', stale: false, error: null, positions, ...o });

test('parseSnapshot validates shape', () => {
  assert.equal(parseSnapshot(null).status, 'error');
  assert.equal(parseSnapshot({ status: 'weird', positions: [] }).status, 'error');
  const s = parseSnapshot({ status: 'ok', positions: [{ symbol: 'nvda', side: 'short' }, { nope: 1 }] });
  assert.equal(s.positions.length, 1);
  assert.equal(s.positions[0].symbol, 'NVDA');
  assert.equal(s.positions[0].side, 'short');
  assert.equal(parseSnapshot({ status: 'unconfigured', positions: [] }).status, 'unconfigured');
});

test('filterByHeld keeps order, adds missing held only when asked', () => {
  const held = positionsMap(snap([P('NVDA'), P('ZZZQ'), P('AAPL')]));
  const items = [{ symbol: 'MSFT' }, { symbol: 'nvda' }, { symbol: 'AAPL' }];
  const mk = (symbol: string) => ({ symbol });
  assert.deepEqual(filterByHeld(items, held, false, mk).map((i) => i.symbol), ['nvda', 'AAPL']);
  assert.deepEqual(filterByHeld(items, held, true, mk).map((i) => i.symbol), ['nvda', 'AAPL', 'ZZZQ']);
  assert.deepEqual(filterByHeld(items, new Map(), true, mk), []);
});

test('missingFromWatchlist only from fresh ok snapshots', () => {
  const s = snap([P('ZZZQ'), P('NVDA'), P('AAA')]);
  assert.deepEqual(missingFromWatchlist(s, ['nvda']), ['AAA', 'ZZZQ']);
  assert.deepEqual(missingFromWatchlist({ ...s, stale: true }, []), []);
  assert.deepEqual(missingFromWatchlist({ ...s, status: 'error' }, []), []);
});

test('heldBadge formatting', () => {
  assert.equal(heldBadge(P('A', { qty: 10, avg_entry_price: 185.2, unrealized_plpc: 0.02654 })).text, '10 @ 185.20 · +2.65%');
  const neg = heldBadge(P('A', { qty: 2.5, avg_entry_price: 50, unrealized_plpc: -0.012 }));
  assert.equal(neg.text, '2.5 @ 50.00 · −1.20%');
  assert.equal(neg.tone, 'down');
  assert.equal(neg.short, '2.5 · −1.20%');
  const sh = heldBadge(P('A', { side: 'short', qty: 5, avg_entry_price: 250, unrealized_plpc: 0.04 }));
  assert.equal(sh.text, 'SHORT 5 @ 250.00 · +4.00%');
  assert.equal(sh.tone, 'up');
  const flat = heldBadge(P('A', { unrealized_plpc: 0 }));
  assert.equal(flat.tone, 'flat');
  assert.equal(flat.text, '10 @ 100.00 · 0.00%');
  assert.equal(heldBadge(P('A', { qty: null, avg_entry_price: null, unrealized_plpc: null })).text, '? @ — · —');
});
