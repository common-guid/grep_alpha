/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CalendarDays, ArrowUpDown, X, Briefcase, ListFilter, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  ADDED_FILTERS, SORT_KEYS, DEFAULT_VIEW, GridView, AddedFilter, SortKey, isDefaultView,
} from '../lib/utils/chartFilters';
import type { PositionsSnapshot } from '../lib/utils/positions';
import type { ActiveScreen } from '../context/ScreenContext';
import { isScreenStale, shortDate } from '../lib/utils/screens';

interface GridControlsProps {
  view: GridView;
  onChange: (view: GridView) => void;
  shown: number;
  total: number;
  /** 'toolbar' = compact desktop strip above the grid; 'drawer' = 44px mobile drawer section. */
  variant: 'toolbar' | 'drawer';
  positions: PositionsSnapshot;
  screens: ActiveScreen;
}

const isScreenSort = (s: string) => s === 'screen_rank' || s.startsWith('sc:');

/** Short summary for the mobile header chip, e.g. "30d · Newest". */
export function viewSummary(view: GridView): string {
  const f = ADDED_FILTERS.find((x) => x.value === view.added)?.short ?? 'All';
  const s = SORT_KEYS.find((x) => x.value === view.sort)?.short ?? 'Default';
  const sc = view.screen ? `${view.screen} · ` : '';
  const srt = view.sort === 'screen_rank' ? 'Rank' : view.sort.startsWith('sc:') ? view.sort.slice(3) : s;
  return `${view.held ? 'Held · ' : ''}${sc}${f} · ${srt}`;
}

export const GridControls: React.FC<GridControlsProps> = ({ view, onChange, shown, total, variant, positions, screens }) => {
  const drawer = variant === 'drawer';
  const set = (patch: Partial<GridView>) => onChange({ ...view, ...patch });
  const selectCls = cn(
    'bg-[#131722] border border-[#2a2e39] rounded text-gray-200 focus:outline-none focus:border-[#26a69a]',
    drawer ? 'w-full h-11 px-3 text-sm' : 'h-7 px-1.5 text-[11px]'
  );
  const dateCls = cn(selectCls, drawer ? '' : 'w-[118px]', '[color-scheme:dark]');
  const labelCls = drawer
    ? 'block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1'
    : 'flex items-center gap-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider';

  const added = (
    <label className={labelCls}>
      {!drawer && <CalendarDays size={12} />}
      Added
      <select
        aria-label="Filter by date added"
        data-testid={`added-filter-${variant}`}
        className={cn(selectCls, drawer && 'mt-1', 'normal-case tracking-normal font-normal')}
        value={view.added}
        onChange={(e) => set({ added: e.target.value as AddedFilter })}
      >
        {ADDED_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>
    </label>
  );

  const range = view.added === 'custom' && (
    <div className={cn('flex items-center gap-1.5', drawer && 'gap-2')}>
      <input
        type="date"
        aria-label="Added from"
        data-testid={`added-from-${variant}`}
        className={dateCls}
        value={view.from}
        max={view.to || undefined}
        onChange={(e) => set({ from: e.target.value })}
      />
      <span className="text-gray-500 text-xs">–</span>
      <input
        type="date"
        aria-label="Added to"
        data-testid={`added-to-${variant}`}
        className={dateCls}
        value={view.to}
        min={view.from || undefined}
        onChange={(e) => set({ to: e.target.value })}
      />
    </div>
  );

  const unavailable = positions.status === 'unconfigured';
  const heldCount = positions.status === 'ok' ? positions.positions.length : null;
  const heldTitle = unavailable
    ? 'Paper keys not installed on the backend'
    : positions.status === 'error'
    ? "Couldn't reach Alpaca"
    : 'Show only symbols held in the Alpaca paper account';
  const heldToggle = (
    <button
      type="button"
      role="switch"
      aria-checked={view.held}
      aria-label="Held positions only"
      data-testid={`held-toggle-${variant}`}
      disabled={unavailable && !view.held}
      title={heldTitle}
      onClick={() => set({ held: !view.held })}
      className={cn(
        'flex items-center justify-center gap-1.5 rounded border font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        drawer ? 'w-full h-11 px-3 text-sm' : 'h-7 px-2 text-[11px]',
        view.held
          ? 'bg-[#26a69a]/20 border-[#26a69a]/60 text-[#26a69a]'
          : 'bg-[#131722] border-[#2a2e39] text-gray-300 hover:text-white'
      )}
    >
      <Briefcase size={drawer ? 16 : 12} />
      Held{heldCount !== null ? ` (${heldCount})` : ''}
      {positions.stale && <span className="text-amber-400" aria-label="stale">•</span>}
    </button>
  );

  const known = screens.list.some((x) => x.screen === view.screen);
  const screenPicker = (
    <label className={labelCls}>
      {!drawer && <ListFilter size={12} />}
      Screen
      <select
        aria-label="Filter by screen"
        data-testid={`screen-picker-${variant}`}
        className={cn(selectCls, drawer && 'mt-1', 'normal-case tracking-normal font-normal', !drawer && 'max-w-[190px]')}
        value={view.screen}
        onChange={(e) => {
          const screen = e.target.value;
          let sort = view.sort;
          if (!screen && isScreenSort(sort)) sort = 'default';
          if (screen && sort === 'default') sort = 'screen_rank';
          if (screen && sort.startsWith('sc:')) sort = 'screen_rank';
          onChange({ ...view, screen, sort });
        }}
      >
        <option value="">None</option>
        {screens.list.map((x) => (
          <option key={x.screen} value={x.screen}>
            {x.screen} · {shortDate(x.latest.as_of)} · {x.latest.row_count}
          </option>
        ))}
        {view.screen && !known && <option value={view.screen}>{view.screen} (not found)</option>}
      </select>
    </label>
  );

  const run = screens.run;
  const stale = !!run && isScreenStale(run.as_of);
  const screenChip = view.screen && run && (
    <span
      data-testid={`screen-chip-${variant}`}
      title={`Screen ${run.screen}: ${run.row_count} hits, as of ${run.as_of}, run ${run.run_at}${stale ? ' (stale)' : ''}`}
      className={cn(
        'inline-flex items-center gap-1 rounded border font-mono whitespace-nowrap',
        drawer ? 'h-11 px-3 text-xs' : 'h-6 px-1.5 text-[10px]',
        stale ? 'border-amber-500/50 text-amber-300 bg-amber-500/10' : 'border-violet-500/40 text-violet-300 bg-violet-500/10'
      )}
    >
      {stale && <AlertTriangle size={11} />}
      {run.screen} · {shortDate(run.as_of)} · {run.row_count}
    </span>
  );

  const sort = (
    <label className={labelCls}>
      {!drawer && <ArrowUpDown size={12} />}
      Sort
      <select
        aria-label="Sort charts"
        data-testid={`sort-${variant}`}
        className={cn(selectCls, drawer && 'mt-1', 'normal-case tracking-normal font-normal')}
        value={view.sort}
        onChange={(e) => set({ sort: e.target.value as SortKey })}
      >
        {SORT_KEYS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        {view.screen && <option value="screen_rank">Screen rank</option>}
        {view.screen && run?.columns.filter((c) => c.fmt !== 'text').map((c) => (
          <option key={c.key} value={`sc:${c.key}`}>Screen: {c.label} (high–low)</option>
        ))}
        {view.screen && view.sort.startsWith('sc:') && !run?.columns.some((c) => `sc:${c.key}` === view.sort) && (
          <option value={view.sort}>Screen: {view.sort.slice(3)}</option>
        )}
      </select>
    </label>
  );

  const count = (
    <span className="text-[11px] font-mono text-gray-500" data-testid={`grid-count-${variant}`} aria-live="polite">
      {shown} of {total}
    </span>
  );

  const reset = !isDefaultView(view) && (
    <button
      type="button"
      onClick={() => onChange(DEFAULT_VIEW)}
      className={cn(
        'flex items-center justify-center gap-1 text-gray-400 hover:text-white rounded hover:bg-[#242733]',
        drawer ? 'h-11 px-3 text-sm' : 'h-7 px-2 text-[11px]'
      )}
      title="Reset filter and sort"
    >
      <X size={drawer ? 16 : 12} /> Reset
    </button>
  );

  if (drawer) {
    return (
      <div className="px-4 space-y-3" data-testid="grid-controls-drawer">
        {heldToggle}
        {screenPicker}
        {screenChip}
        {added}
        {range}
        {sort}
        <div className="flex items-center justify-between">
          {count}
          {reset}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-4 flex-wrap px-3 py-1 border-b border-[#242733] bg-[#131722] shrink-0"
      data-testid="grid-controls-toolbar"
    >
      {heldToggle}
      {screenPicker}
      {screenChip}
      {added}
      {range}
      {sort}
      <div className="ml-auto flex items-center gap-2">
        {reset}
        {count}
      </div>
    </div>
  );
};
