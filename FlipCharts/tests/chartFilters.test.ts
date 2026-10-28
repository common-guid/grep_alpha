import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GridView } from '../src/lib/utils/chartFilters.ts';
import {
  filterByAdded, sortItems, addedLabel, resolveView, writeViewParams, daysAgo, DEFAULT_VIEW,
} from '../src/lib/utils/chartFilters.ts';

const T = '2026-10-12';
const items = [
  { symbol: 'IMP', added: '2026-07-23', date: '2026-09-03' },
  { symbol: 'NONE' },
  { symbol: 'OCT5', added: '2026-10-05', date: '2026-10-05' },
  { symbol: 'AUG', added: '2026-08-12' },
  { symbol: 'SEP', added: '2026-09-28', date: '2026-10-05' },
  { symbol: 'OCT1', added: '2026-10-01', date: '2026-10-01' },
];
const v = (p: Partial<GridView>): GridView => ({ ...DEFAULT_VIEW, ...p });
const syms = (a: { symbol: string }[]) => a.map((i) => i.symbol);

test('daysAgo crosses month boundaries', () => {
  assert.equal(daysAgo(T, 7), '2026-10-05');
  assert.equal(daysAgo(T, 90), '2026-07-14');
});

test('filters', () => {
  assert.equal(filterByAdded(items, v({}), T), items);
  assert.deepEqual(syms(filterByAdded(items, v({ added: '7d' }), T)), ['OCT5']);
  assert.deepEqual(syms(filterByAdded(items, v({ added: '30d' }), T)), ['OCT5', 'SEP', 'OCT1']);
  assert.deepEqual(syms(filterByAdded(items, v({ added: '90d' }), T)), ['IMP', 'OCT5', 'AUG', 'SEP', 'OCT1']);
  assert.deepEqual(syms(filterByAdded(items, v({ added: 'month' }), T)), ['OCT5', 'OCT1']);
  assert.deepEqual(syms(filterByAdded(items, v({ added: 'refresh' }), T)), ['OCT5']);
  assert.deepEqual(syms(filterByAdded(items, v({ added: 'custom', from: '2026-08-01', to: '2026-09-30' }), T)), ['AUG', 'SEP']);
  assert.deepEqual(syms(filterByAdded(items, v({ added: 'custom' }), T)).length, 5, 'open range = all dated');
  assert.deepEqual(filterByAdded([{ symbol: 'A' }], v({ added: 'refresh' }), T), []);
});

test('undated never appear outside All', () => {
  for (const added of ['7d', '30d', '90d', 'month', 'refresh', 'custom'] as const) {
    assert.ok(!syms(filterByAdded(items, v({ added }), T)).includes('NONE'), added);
  }
});

test('sorts', () => {
  assert.equal(sortItems(items, 'default'), items);
  assert.deepEqual(syms(sortItems(items, 'added_desc')), ['OCT5', 'OCT1', 'SEP', 'AUG', 'IMP', 'NONE']);
  assert.deepEqual(syms(sortItems(items, 'added_asc')), ['IMP', 'AUG', 'SEP', 'OCT1', 'OCT5', 'NONE']);
  assert.deepEqual(syms(sortItems(items, 'ticker')), ['AUG', 'IMP', 'NONE', 'OCT1', 'OCT5', 'SEP']);
  assert.deepEqual(syms(sortItems(items, 'updated')), ['OCT5', 'SEP', 'OCT1', 'IMP', 'NONE', 'AUG']);
  assert.deepEqual(syms(items), ['IMP', 'NONE', 'OCT5', 'AUG', 'SEP', 'OCT1'], 'input not mutated');
});

test('labels', () => {
  assert.equal(addedLabel('2026-07-23', T), '≤07-23 (import)');
  assert.equal(addedLabel('2026-10-05', T), '+10-05');
  assert.equal(addedLabel('2025-12-01', T), '+2025-12-01');
  assert.equal(addedLabel(undefined, T), null);
});

test('URL wins over stored; invalid values ignored; round trip', () => {
  const stored = { added: '30d', sort: 'ticker' };
  assert.deepEqual(resolveView(new URLSearchParams(''), stored), v({ added: '30d', sort: 'ticker' }));
  assert.deepEqual(resolveView(new URLSearchParams('sort=added_asc'), stored), v({ sort: 'added_asc' }));
  assert.deepEqual(resolveView(new URLSearchParams('sort=bogus&added=1y'), stored), v({ added: '30d', sort: 'ticker' }));
  const view = v({ added: 'custom', sort: 'updated', from: '2026-08-01', to: '2026-09-01' });
  const p = writeViewParams(new URLSearchParams('tab=x'), view);
  assert.equal(p.toString(), 'tab=x&added=custom&sort=updated&from=2026-08-01&to=2026-09-01');
  assert.deepEqual(resolveView(new URLSearchParams(p.toString()), null), view);
  assert.equal(writeViewParams(new URLSearchParams(), DEFAULT_VIEW).toString(), '');
});

test('held flag: URL + storage round-trip, default view', () => {
  const view = v({ held: true, sort: 'ticker' });
  const p = writeViewParams(new URLSearchParams(), view);
  assert.equal(p.get('held'), '1');
  assert.deepEqual(resolveView(new URLSearchParams(p.toString()), null), view);
  assert.deepEqual(resolveView(new URLSearchParams(''), JSON.parse(JSON.stringify(view))), view, 'localStorage JSON boolean');
  assert.deepEqual(resolveView(new URLSearchParams('held=1'), { added: '30d' }), v({ held: true }), 'URL wins');
  assert.equal(resolveView(new URLSearchParams('held=yes'), null).held, false);
  assert.equal(writeViewParams(new URLSearchParams('held=1'), DEFAULT_VIEW).toString(), '');
});
