/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure helpers for filtering and sorting the Flip-Charts grid by date added.
 * `added` = first-seen date (frozen); `date` = last updated.
 */

/** Symbols first seen in the initial import commit; their real add date is unknown (≤ this). */
export const IMPORT_DATE = '2026-07-23';

export type AddedFilter = 'all' | '7d' | '30d' | '90d' | 'month' | 'refresh' | 'custom';
export type BaseSortKey = 'default' | 'added_desc' | 'added_asc' | 'ticker' | 'updated';
/** `screen_rank` and `sc:<column key>` only make sense while a screen is active. */
export type SortKey = BaseSortKey | 'screen_rank' | `sc:${string}`;

export interface GridView {
  added: AddedFilter;
  sort: SortKey;
  /** Inclusive YYYY-MM-DD bounds, used when added === 'custom'. Either may be empty. */
  from: string;
  to: string;
  /** Only symbols held in the Alpaca paper account (combines with the other filters). */
  held: boolean;
  /** Active screen name ('' = none); shows only that screen's latest hits. */
  screen: string;
}

export const DEFAULT_VIEW: GridView = { added: 'all', sort: 'default', from: '', to: '', held: false, screen: '' };

export const ADDED_FILTERS: { value: AddedFilter; label: string; short: string }[] = [
  { value: 'all', label: 'All', short: 'All' },
  { value: '7d', label: 'Last 7 days', short: '7d' },
  { value: '30d', label: 'Last 30 days', short: '30d' },
  { value: '90d', label: 'Last 90 days', short: '90d' },
  { value: 'month', label: 'This month', short: 'Month' },
  { value: 'refresh', label: 'Since last refresh', short: 'Latest' },
  { value: 'custom', label: 'Custom range', short: 'Range' },
];

export const SORT_KEYS: { value: BaseSortKey; label: string; short: string }[] = [
  { value: 'default', label: 'Default', short: 'Default' },
  { value: 'added_desc', label: 'Added: newest', short: 'Newest' },
  { value: 'added_asc', label: 'Added: oldest', short: 'Oldest' },
  { value: 'ticker', label: 'Ticker A–Z', short: 'A–Z' },
  { value: 'updated', label: 'Last updated', short: 'Updated' },
];

export interface DatedSymbol {
  symbol: string;
  added?: string;
  date?: string;
  /** Screen rank (1 = best) while a screen is active. */
  rank?: number;
  /** Value of the screen column chosen by an `sc:<key>` sort. */
  metric?: number | null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** YYYY-MM-DD for `today` minus `days` calendar days (local time). */
export function daysAgo(today: string, days: number): string {
  const [y, m, d] = today.split('-').map(Number);
  return isoOf(new Date(y, m - 1, d - days));
}

/** Most recent `added` date across all items (the latest refresh/add), or null. */
export function latestAdded(items: DatedSymbol[]): string | null {
  let max: string | null = null;
  for (const i of items) if (i.added && (!max || i.added > max)) max = i.added;
  return max;
}

/**
 * Filter by date added. Undated symbols appear only under 'all'.
 * Relative windows count back from `today`: '7d' keeps added >= today-7d.
 * `latest` is the latest added date across the whole watchlist (for 'refresh').
 */
export function filterByAdded<T extends DatedSymbol>(
  items: T[], view: GridView, today: string, latest: string | null = latestAdded(items),
): T[] {
  if (view.added === 'all') return items;
  let lo = '';
  let hi = '9999-12-31';
  switch (view.added) {
    case '7d': lo = daysAgo(today, 7); break;
    case '30d': lo = daysAgo(today, 30); break;
    case '90d': lo = daysAgo(today, 90); break;
    case 'month': lo = today.slice(0, 8) + '01'; break;
    case 'refresh': if (!latest) return []; lo = latest; break;
    case 'custom':
      if (ISO.test(view.from)) lo = view.from;
      if (ISO.test(view.to)) hi = view.to;
      break;
  }
  return items.filter((i) => !!i.added && i.added >= lo && i.added <= hi);
}

/** Stable sort; undated symbols always go last, keeping their original order. */
export function sortItems<T extends DatedSymbol>(items: T[], sort: SortKey): T[] {
  if (sort === 'default') return items;
  const indexed = items.map((item, idx) => ({ item, idx }));
  const byDate = (field: 'added' | 'date', dir: 1 | -1) =>
    (a: { item: T; idx: number }, b: { item: T; idx: number }) => {
      const av = a.item[field];
      const bv = b.item[field];
      if (av && !bv) return -1;
      if (!av && bv) return 1;
      if (av && bv && av !== bv) return av < bv ? -dir : dir;
      return a.idx - b.idx;
    };
  switch (sort) {
    case 'added_desc': indexed.sort(byDate('added', -1)); break;
    case 'added_asc': indexed.sort(byDate('added', 1)); break;
    case 'updated': indexed.sort(byDate('date', -1)); break;
    case 'ticker': indexed.sort((a, b) => a.item.symbol.localeCompare(b.item.symbol) || a.idx - b.idx); break;
    case 'screen_rank':
      indexed.sort((a, b) => (a.item.rank ?? Infinity) - (b.item.rank ?? Infinity) || a.idx - b.idx);
      break;
    default:
      if (sort.startsWith('sc:')) {
        // Screen metric, high to low; missing values last.
        const v = (x: { item: T }) => (typeof x.item.metric === 'number' && Number.isFinite(x.item.metric) ? x.item.metric : null);
        indexed.sort((a, b) => {
          const av = v(a); const bv = v(b);
          if (av !== null && bv === null) return -1;
          if (av === null && bv !== null) return 1;
          if (av !== null && bv !== null && av !== bv) return bv - av;
          return a.idx - b.idx;
        });
      }
  }
  return indexed.map((x) => x.item);
}

/** Short badge text for a card: "≤07-23 (import)", "+10-05", or "+2025-12-01" for other years. */
export function addedLabel(added: string | undefined, today: string): string | null {
  if (!added) return null;
  if (added === IMPORT_DATE) return '≤07-23 (import)';
  return added.slice(0, 4) === today.slice(0, 4) ? `+${added.slice(5)}` : `+${added}`;
}

const FILTER_SET = new Set(ADDED_FILTERS.map((f) => f.value));
const SORT_SET = new Set(SORT_KEYS.map((s) => s.value));

/** Parse a view from a query string or a stored JSON object; invalid parts fall back to defaults. */
export function parseView(src: URLSearchParams | Record<string, unknown> | null | undefined): Partial<GridView> {
  if (!src) return {};
  const get = (k: string): string | undefined => {
    const v = src instanceof URLSearchParams ? src.get(k) : (src as Record<string, unknown>)[k];
    if (typeof v === 'boolean') return v ? '1' : '0';
    return typeof v === 'string' ? v : undefined;
  };
  const out: Partial<GridView> = {};
  const added = get('added');
  if (added && FILTER_SET.has(added as AddedFilter)) out.added = added as AddedFilter;
  const sort = get('sort');
  if (sort && (SORT_SET.has(sort as BaseSortKey) || sort === 'screen_rank' || /^sc:[a-z_][a-z0-9_]{0,39}$/.test(sort))) {
    out.sort = sort as SortKey;
  }
  const screen = get('screen');
  if (screen !== undefined && (screen === '' || /^[a-z0-9][a-z0-9_.-]{0,63}$/.test(screen))) out.screen = screen;
  const from = get('from');
  if (from && ISO.test(from)) out.from = from;
  const to = get('to');
  if (to && ISO.test(to)) out.to = to;
  const held = get('held');
  if (held === '1' || held === 'true') out.held = true;
  else if (held === '0' || held === 'false') out.held = false;
  return out;
}

/** URL wins: any view param present in the URL replaces the stored view entirely. */
export function resolveView(url: URLSearchParams, stored: Record<string, unknown> | null): GridView {
  const fromUrl = parseView(url);
  if (Object.keys(fromUrl).length > 0) return { ...DEFAULT_VIEW, ...fromUrl };
  return { ...DEFAULT_VIEW, ...parseView(stored) };
}

/** Write the view into `params` (non-default parts only); returns the same object. */
export function writeViewParams(params: URLSearchParams, view: GridView): URLSearchParams {
  for (const k of ['added', 'sort', 'from', 'to', 'held', 'screen']) params.delete(k);
  if (view.added !== 'all') params.set('added', view.added);
  if (view.sort !== 'default') params.set('sort', view.sort);
  if (view.held) params.set('held', '1');
  if (view.screen) params.set('screen', view.screen);
  if (view.added === 'custom') {
    if (view.from) params.set('from', view.from);
    if (view.to) params.set('to', view.to);
  }
  return params;
}

export function isDefaultView(v: GridView): boolean {
  return v.added === 'all' && v.sort === 'default' && !v.held && !v.screen;
}
