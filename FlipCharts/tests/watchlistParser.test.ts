import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWatchlistYaml, dumpWatchlistYaml, todayIso } from '../src/lib/utils/watchlistParser.ts';

const src = `- symbol: AAPL
  status: trimmed
  target_entry: 170
  thesis: '2026-09-03:Cash flow'
  tags: Big_Tech, Software
  date: '2026-10-05'
  added: '2026-07-23'
- symbol: msft
  status: watching
  target_entry: null
  thesis: ''
  tags: Software
`;

test('parses date and added', () => {
  const [a, m] = parseWatchlistYaml(src);
  assert.equal(a.date, '2026-10-05');
  assert.equal(a.added, '2026-07-23');
  assert.equal(m.symbol, 'MSFT');
  assert.equal(m.date, undefined);
  assert.equal(m.added, undefined);
});

test('round trip keeps date/added and every other field', () => {
  const once = parseWatchlistYaml(src);
  const dumped = dumpWatchlistYaml(once);
  assert.match(dumped, /  date: '2026-10-05'\n  added: '2026-07-23'\n/);
  assert.ok(!/MSFT[\s\S]*date:/.test(dumped), 'no date invented for undated symbol');
  assert.deepEqual(parseWatchlistYaml(dumped), once);
});

test('round trip of the real watchlist.yaml is lossless for date/added', async () => {
  const fs = await import('node:fs');
  const text = fs.readFileSync(new URL('../watchlist.yaml', import.meta.url), 'utf8');
  const items = parseWatchlistYaml(text);
  const again = parseWatchlistYaml(dumpWatchlistYaml(items));
  assert.deepEqual(again.map((i) => [i.symbol, i.date, i.added]), items.map((i) => [i.symbol, i.date, i.added]));
});

test('todayIso is local YYYY-MM-DD', () => {
  assert.equal(todayIso(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});
