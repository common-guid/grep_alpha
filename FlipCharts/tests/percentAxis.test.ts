import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPercent, percentFromBaseline, baselineIndex } from '../src/lib/charts/percentAxis.ts';

test('formatPercent: sign, one decimal, zero', () => {
  assert.equal(formatPercent(12.5), '+12.5%');
  assert.equal(formatPercent(-3), '-3.0%');
  assert.equal(formatPercent(0), '0.0%');
  assert.equal(formatPercent(-0.04), '0.0%');
  assert.equal(formatPercent(0.06), '+0.1%');
  assert.equal(formatPercent(NaN), '');
});

test('percentFromBaseline matches price/base - 1', () => {
  assert.equal(percentFromBaseline(110, 100), 10.000000000000009);
  assert.ok(Math.abs(percentFromBaseline(97, 100) + 3) < 1e-9);
  assert.ok(Number.isNaN(percentFromBaseline(10, 0)));
});

test('baselineIndex: first visible bar, clamped', () => {
  assert.equal(baselineIndex({ from: -2.5, to: 100 }, 120), 0);
  assert.equal(baselineIndex({ from: 40.2, to: 100 }, 120), 41);
  assert.equal(baselineIndex({ from: 40, to: 100 }, 120), 40);
  assert.equal(baselineIndex({ from: 500, to: 600 }, 120), 119);
  assert.equal(baselineIndex(null, 120), 0);
});
