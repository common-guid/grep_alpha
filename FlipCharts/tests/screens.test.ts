import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ScreenColumn, ScreenRun } from '../src/lib/utils/screens.ts';
import {
  formatValue, screenBadge, screenRowMap, filterByScreen, lastTradingDay, isScreenStale, parseScreenRun, parseScreenList,
} from '../src/lib/utils/screens.ts';
import { sortItems, resolveView, writeViewParams, isDefaultView, DEFAULT_VIEW } from '../src/lib/utils/chartFilters.ts';

const LR: ScreenColumn[] = [
  { key: 'slope_pct_per_day', label: 'Slope %/d', fmt: 'pct2' },
  { key: 'r2', label: 'R²', fmt: 'f2' },
];
const RSI: ScreenColumn[] = [
  { key: 'rsi', label: 'RSI', fmt: 'f1' },
  { key: 'chg', label: '5d', fmt: 'fracpct1' },
  { key: 'sector', label: 'Sector', fmt: 'text' },
];

test('formatValue covers every fmt family', () => {
  assert.equal(formatValue('f2', 0.9412), '0.94');
  assert.equal(formatValue('f0', -3.6), '−4');
  assert.equal(formatValue('pct2', 4.566), '+4.57%');
  assert.equal(formatValue('pct1', -0.04), '0.0%');
  assert.equal(formatValue('pct1', -1.25), '−1.3%');
  assert.equal(formatValue('fracpct1', 0.0525), '+5.3%');
  assert.equal(formatValue('usd', -12.5), '−$12.50');
  assert.equal(formatValue('int', 7.6), '8');
  assert.equal(formatValue('text', 'Tech'), 'Tech');
  assert.equal(formatValue('f2', null), '—');
  assert.equal(formatValue('f2', 'n/a'), 'n/a');
});

test('screenBadge is columns-driven (two different screens)', () => {
  const lr = screenBadge({ ticker: 'FIGS', rank: 1, slope_pct_per_day: 4.566, r2: 0.94 }, LR);
  assert.equal(lr.text, '#1 · Slope %/d +4.57% · R² 0.94');
  assert.equal(lr.short, '#1 · +4.57% · 0.94');
  const rsi = screenBadge({ ticker: 'X', rank: 3, rsi: 28.44, chg: -0.081, sector: 'Bio' }, RSI);
  assert.equal(rsi.text, '#3 · RSI 28.4 · 5d −8.1% · Sector Bio');
  assert.ok(rsi.title.includes('Sector: Bio'));
});

test('filterByScreen: watchlist order, off-watchlist extras only when asked, rank order', () => {
  const rows = screenRowMap({ rows: [{ ticker: 'ZZZ', rank: 1 }, { ticker: 'AAPL', rank: 3 }, { ticker: 'OFF2', rank: 2 }], columns: [] } as unknown as ScreenRun);
  const items = [{ symbol: 'MSFT' }, { symbol: 'aapl' }];
  const mk = (symbol: string) => ({ symbol });
  assert.deepEqual(filterByScreen(items, rows, false, mk).map((i) => i.symbol), ['aapl']);
  assert.deepEqual(filterByScreen(items, rows, true, mk).map((i) => i.symbol), ['aapl', 'ZZZ', 'OFF2']);
});

test('screen sorts: rank and column metric', () => {
  const items = [
    { symbol: 'A', rank: 3, metric: 1 }, { symbol: 'B', rank: 1, metric: null }, { symbol: 'C', rank: 2, metric: 5 }, { symbol: 'D' },
  ];
  assert.deepEqual(sortItems(items, 'screen_rank').map((i) => i.symbol), ['B', 'C', 'A', 'D']);
  assert.deepEqual(sortItems(items, 'sc:r2').map((i) => i.symbol), ['C', 'A', 'B', 'D']);
  const ties = [{ symbol: 'X', rank: 5, metric: 1 }, { symbol: 'Y', rank: 2, metric: 1 }];
  assert.deepEqual(sortItems(ties, 'sc:r2').map((i) => i.symbol), ['Y', 'X'], 'ties broken by rank');
});

test('screen in URL and localStorage', () => {
  const v = { ...DEFAULT_VIEW, screen: 'lr10', sort: 'sc:r2' as const, held: true };
  const p = writeViewParams(new URLSearchParams(), v);
  assert.equal(p.toString(), 'sort=sc%3Ar2&held=1&screen=lr10');
  assert.deepEqual(resolveView(new URLSearchParams(p.toString()), null), v);
  assert.deepEqual(resolveView(new URLSearchParams(''), JSON.parse(JSON.stringify(v))), v);
  assert.equal(resolveView(new URLSearchParams('screen=Bad Name'), null).screen, '');
  assert.equal(resolveView(new URLSearchParams('sort=sc:DROP'), null).sort, 'default');
  assert.equal(isDefaultView({ ...DEFAULT_VIEW, screen: 'x' }), false);
});

test('lastTradingDay / stale (ET close, weekends, holidays)', () => {
  // Thu 2026-10-15 15:00 ET (19:00Z) -> Wed 10-14; 17:00 ET -> Thu 10-15
  assert.equal(lastTradingDay(new Date('2026-10-15T19:00:00Z')), '2026-10-14');
  assert.equal(lastTradingDay(new Date('2026-10-15T21:00:00Z')), '2026-10-15');
  // Sat 10-17 -> Fri 10-16; Mon 10-19 morning -> Fri 10-16
  assert.equal(lastTradingDay(new Date('2026-10-17T15:00:00Z')), '2026-10-16');
  assert.equal(lastTradingDay(new Date('2026-10-19T13:00:00Z')), '2026-10-16');
  // Fri 2026-11-27 morning: Thanksgiving 11-26 skipped -> Wed 11-25
  assert.equal(lastTradingDay(new Date('2026-11-27T14:00:00Z')), '2026-11-25');
  assert.equal(isScreenStale('2026-10-15', new Date('2026-10-16T14:00:00Z')), false);
  assert.equal(isScreenStale('2026-10-14', new Date('2026-10-16T14:00:00Z')), true);
});

test('parsers', () => {
  assert.equal(parseScreenRun(null), null);
  const r = parseScreenRun({ screen: 'x', rows: [{ ticker: 'abc', rank: 1 }, { nope: 1 }], columns: [{ key: 'a' }, null] });
  assert.equal(r?.rows[0].ticker, 'ABC');
  assert.equal(r?.rows.length, 1);
  assert.equal(r?.columns.length, 1);
  assert.deepEqual(parseScreenList({ screens: [{ screen: 'a', latest: { as_of: '2026-10-15' } }, { bad: 1 }] }).length, 1);
  assert.deepEqual(parseScreenList(null), []);
});
