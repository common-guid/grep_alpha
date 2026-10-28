/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Alpaca PAPER positions for the grid: polls GET /api/positions (read-only, cached
 * ~60s server-side) while the tab is visible, and runs the idempotent
 * POST /api/positions/sync-watchlist when a held symbol is missing from the
 * watchlist, then reloads the watchlist.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  LOADING_SNAPSHOT, PaperPosition, PositionsSnapshot, missingFromWatchlist, parseSnapshot, positionsMap,
} from '../lib/utils/positions';

export const POSITIONS_POLL_MS = 60_000;

interface PositionsValue {
  snapshot: PositionsSnapshot;
  held: Map<string, PaperPosition>;
  refresh: () => Promise<void>;
}

const PositionsContext = createContext<PositionsValue>({
  snapshot: LOADING_SNAPSHOT, held: new Map(), refresh: async () => {},
});

export const usePositions = () => useContext(PositionsContext);

interface ProviderProps {
  /** Symbols currently on the watchlist (all tags). */
  watchlistSymbols: string[];
  /** True once the watchlist YAML has loaded; no auto-sync before that. */
  watchlistLoaded: boolean;
  refreshWatchlists: () => Promise<void>;
  children: React.ReactNode;
}

export const PositionsProvider: React.FC<ProviderProps> = ({
  watchlistSymbols, watchlistLoaded, refreshWatchlists, children,
}) => {
  const [snapshot, setSnapshot] = useState<PositionsSnapshot>(LOADING_SNAPSHOT);
  const syncedKeys = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/positions', { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSnapshot(parseSnapshot(await res.json()));
    } catch (e) {
      setSnapshot((prev) => (prev.status === 'ok'
        ? { ...prev, stale: true, error: 'Could not reach the backend' }
        : { ...LOADING_SNAPSHOT, status: 'error', error: 'Could not reach the backend' }));
    }
  }, []);

  // Poll while visible; refresh immediately when the tab becomes visible again.
  useEffect(() => {
    refresh();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, POSITIONS_POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refresh]);

  // Auto-sync: a held symbol is missing from the watchlist. Once per distinct set.
  const missing = useMemo(
    () => (watchlistLoaded ? missingFromWatchlist(snapshot, watchlistSymbols) : []),
    [snapshot, watchlistSymbols, watchlistLoaded],
  );
  useEffect(() => {
    if (missing.length === 0) return;
    const key = missing.join(',');
    if (syncedKeys.current.has(key)) return;
    syncedKeys.current.add(key);
    (async () => {
      try {
        const res = await fetch('/api/positions/sync-watchlist', { method: 'POST' });
        if (res.ok) {
          await refreshWatchlists();
          await refresh();
        }
      } catch {
        /* backend unreachable: the Held view still shows these via the synthetic entries */
      }
    })();
  }, [missing, refreshWatchlists, refresh]);

  const held = useMemo(() => positionsMap(snapshot), [snapshot]);
  const value = useMemo(() => ({ snapshot, held, refresh }), [snapshot, held, refresh]);
  return <PositionsContext.Provider value={value}>{children}</PositionsContext.Provider>;
};
