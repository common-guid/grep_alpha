/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Screen results for the grid: the list of screens (GET /api/screens) and the
 * latest run of the active one (GET /api/screens/{name}/latest). Read-only.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ScreenRow, ScreenRun, ScreenSummary, parseScreenList, parseScreenRun, screenRowMap } from '../lib/utils/screens';

export const SCREENS_POLL_MS = 5 * 60_000;

export type ScreenStatus = 'none' | 'loading' | 'ok' | 'not_found' | 'error';

export interface ActiveScreen {
  list: ScreenSummary[];
  listLoaded: boolean;
  status: ScreenStatus;
  run: ScreenRun | null;
  rows: Map<string, ScreenRow>;
}

const EMPTY: ActiveScreen = { list: [], listLoaded: false, status: 'none', run: null, rows: new Map() };
const ScreenContext = createContext<ActiveScreen>(EMPTY);
export const useActiveScreen = () => useContext(ScreenContext);
export const ScreenProvider = ScreenContext.Provider;

/** Load the screen list and the active screen's latest run; refreshes every 5 min while visible. */
export function useScreens(active: string): ActiveScreen {
  const [list, setList] = useState<ScreenSummary[]>([]);
  const [listLoaded, setListLoaded] = useState(false);
  const [run, setRun] = useState<ScreenRun | null>(null);
  const [status, setStatus] = useState<ScreenStatus>('none');

  const loadList = useCallback(async () => {
    try {
      const res = await fetch('/api/screens', { headers: { Accept: 'application/json' } });
      if (res.ok) setList(parseScreenList(await res.json()));
    } catch {
      /* keep the last list */
    } finally {
      setListLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadList();
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') loadList(); }, SCREENS_POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') loadList(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [loadList]);

  // Refetch the run when the active screen changes or a newer run appears in the list.
  const latestId = list.find((s) => s.screen === active)?.latest.id;
  useEffect(() => {
    if (!active) { setRun(null); setStatus('none'); return; }
    let cancelled = false;
    setStatus((s) => (run && run.screen === active ? s : 'loading'));
    (async () => {
      try {
        const res = await fetch(`/api/screens/${encodeURIComponent(active)}/latest`, { headers: { Accept: 'application/json' } });
        if (cancelled) return;
        if (res.status === 404) { setRun(null); setStatus('not_found'); return; }
        if (!res.ok) throw new Error(String(res.status));
        const r = parseScreenRun(await res.json());
        if (cancelled) return;
        setRun(r);
        setStatus(r ? 'ok' : 'error');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, latestId]);

  const rows = useMemo(() => screenRowMap(status === 'ok' ? run : null), [run, status]);
  return useMemo(() => ({ list, listLoaded, status, run: status === 'ok' ? run : null, rows }), [list, listLoaded, status, run, rows]);
}
