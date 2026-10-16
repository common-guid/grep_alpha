/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useActiveScreen } from '../context/ScreenContext';
import { screenBadge } from '../lib/utils/screens';

/** "#1 · Slope %/d +4.57% · R² 0.94" while a screen is active and returned this symbol. */
export const ScreenBadge: React.FC<{ symbol: string }> = ({ symbol }) => {
  const { run, rows } = useActiveScreen();
  const row = rows.get(symbol.toUpperCase());
  if (!run || !row) return null;
  const b = screenBadge(row, run.columns);
  return (
    <span
      data-testid="screen-badge"
      title={`${run.screen} (as of ${run.as_of}) · ${b.title}`}
      className="px-1 py-0.2 text-[9px] font-mono rounded border shrink-0 cursor-help whitespace-nowrap bg-violet-500/10 text-violet-300 border-violet-500/40"
    >
      <span className="sm:hidden">{b.short}</span>
      <span className="hidden sm:inline">{b.text}</span>
    </span>
  );
};

/** Marks a card whose symbol is not in watchlist.yaml (screen hit or held position). */
export const OffWatchlistBadge: React.FC = () => (
  <span
    data-testid="off-watchlist-badge"
    title="Not on the watchlist: shown because a screen returned it or it is held. Not added automatically."
    className="px-1 py-0.2 text-[8px] font-bold uppercase rounded border tracking-wider shrink-0 text-gray-400 border-dashed border-gray-500/60"
  >
    off-watchlist
  </span>
);
