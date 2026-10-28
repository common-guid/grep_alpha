/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure helpers for the left % change axis (see LightweightChartsAdapter).
 */

/** Below this chart width the left % axis is hidden (labels would squeeze the plot). */
export const PERCENT_AXIS_MIN_WIDTH = 260;

/** % change of `price` vs `base`; NaN when base is unusable. */
export function percentFromBaseline(price: number, base: number): number {
  if (!Number.isFinite(price) || !Number.isFinite(base) || base === 0) return NaN;
  return (price / base - 1) * 100;
}

/** "+12.5%", "-3.0%", "0.0%" (one decimal, explicit sign). */
export function formatPercent(pct: number): string {
  if (!Number.isFinite(pct)) return '';
  const s = Math.abs(pct).toFixed(1);
  if (Number(s) === 0) return '0.0%';
  return `${pct > 0 ? '+' : '-'}${s}%`;
}

/**
 * Index of the first bar in the visible logical range (lightweight-charts'
 * Percentage-mode convention): ceil(from), clamped to the data. With fitContent
 * the range starts slightly before bar 0, so this is 0.
 */
export function baselineIndex(range: { from: number; to: number } | null, length: number): number {
  if (!range || length <= 0) return 0;
  const i = Math.ceil(range.from);
  return Math.max(0, Math.min(length - 1, i));
}
