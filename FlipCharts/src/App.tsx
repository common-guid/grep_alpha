/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ServiceProvider, useServices } from './context/ServiceContext';
import { Sidebar } from './components/Sidebar';
import { ChartGrid } from './components/ChartGrid';
import { SettingsModal } from './components/SettingsModal';
import { WatchlistStats } from './components/WatchlistStats';
import { SectorMomentumTab } from './components/SectorMomentumTab';
import { WatchlistManagerTab } from './components/WatchlistManagerTab';
import { SyncMonitorTab } from './components/SyncMonitorTab';
import { GridControls, viewSummary } from './components/GridControls';
import {
  GridView, resolveView, writeViewParams, filterByAdded, sortItems, latestAdded, isDefaultView,
} from './lib/utils/chartFilters';
import { todayIso } from './lib/utils/watchlistParser';
import { PositionsProvider, usePositions } from './context/PositionsContext';
import { filterByHeld } from './lib/utils/positions';
import { Settings, Layers, TrendingUp, BarChart2, Tag, Zap, Menu, PanelLeftClose, PanelLeftOpen, SlidersHorizontal } from 'lucide-react';
import { cn } from './lib/utils';
import { useMediaQuery } from './lib/useMediaQuery';

type ActiveTab = 'charts' | 'momentum' | 'manager' | 'sync';

const GRID_VIEW_KEY = 'grep-alpha:grid-view';

function loadInitialView(): GridView {
  let stored: Record<string, unknown> | null = null;
  try {
    stored = JSON.parse(window.localStorage.getItem(GRID_VIEW_KEY) || 'null');
  } catch {
    stored = null;
  }
  // URL wins over localStorage when it carries any view param.
  return resolveView(new URLSearchParams(window.location.search), stored);
}

const AppContent: React.FC = () => {
  const { watchlists, refreshWatchlists, watchlistItems } = useServices();
  const { snapshot: positions, held } = usePositions();
  const [gridView, setGridView] = useState<GridView>(loadInitialView);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('charts');
  const [activeWatchlistId, setActiveWatchlistId] = useState<string>('');
  const [timeframe, setTimeframe] = useState('3M');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Watchlist pane: inline on md+ (open by default, collapsible); an overlay
  // drawer below md (closed by default so the charts get the full width).
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [isPaneOpen, setIsPaneOpen] = useState<boolean>(isDesktop);
  const paneToggleRef = useRef<HTMLButtonElement>(null);
  const paneCloseRef = useRef<HTMLButtonElement>(null);
  const isDrawerOpen = !isDesktop && isPaneOpen;

  // Crossing the breakpoint (rotation, window resize) resets to that layout's default.
  useEffect(() => {
    setIsPaneOpen(isDesktop);
  }, [isDesktop]);

  const closeDrawer = useCallback(() => {
    setIsPaneOpen(false);
    paneToggleRef.current?.focus();
  }, []);

  // Drawer: Escape closes it; focus moves into it when it opens.
  useEffect(() => {
    if (!isDrawerOpen) return;
    paneCloseRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDrawerOpen, closeDrawer]);

  const handleSelectWatchlist = useCallback((id: string) => {
    setActiveWatchlistId(id);
    if (!isDesktop) closeDrawer();
  }, [isDesktop, closeDrawer]);

  useEffect(() => {
    if (watchlists.length > 0 && !activeWatchlistId) {
      setActiveWatchlistId(watchlists[0].id);
    }
  }, [watchlists, activeWatchlistId]);

  const activeWatchlist = watchlists.find((w) => w.id === activeWatchlistId);

  // Persist the grid view to localStorage and the URL (replaceState: no history spam).
  useEffect(() => {
    try {
      window.localStorage.setItem(GRID_VIEW_KEY, JSON.stringify(gridView));
    } catch {
      /* storage unavailable */
    }
    const params = writeViewParams(new URLSearchParams(window.location.search), gridView);
    const qs = params.toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, '', url);
    }
  }, [gridView]);

  const itemsBySymbol = useMemo(() => {
    const m = new Map<string, (typeof watchlistItems)[number]>();
    for (const i of watchlistItems) m.set(i.symbol.toUpperCase(), i);
    return m;
  }, [watchlistItems]);

  const latestAddedDate = useMemo(() => latestAdded(watchlistItems), [watchlistItems]);

  // Tag selection -> date-added filter -> held filter -> sort. Symbols stay the React
  // keys, so a re-sort moves existing ChartCards instead of re-creating their charts.
  const gridSymbols = useMemo(() => {
    if (!activeWatchlist) return [];
    if (isDefaultView(gridView)) return activeWatchlist.symbols;
    const rows = activeWatchlist.symbols.map((symbol) => {
      const it = itemsBySymbol.get(symbol.toUpperCase());
      return { symbol, added: it?.added, date: it?.date } as { symbol: string; added?: string; date?: string };
    });
    let filtered = filterByAdded(rows, gridView, todayIso(), latestAddedDate);
    if (gridView.held) {
      // On "All Symbols", a just-filled symbol shows even before the watchlist sync lands.
      const extra = activeWatchlist.id === 'all' && gridView.added === 'all';
      filtered = filterByHeld(filtered, held, extra, (symbol) => ({ symbol }));
    }
    return sortItems(filtered, gridView.sort).map((r) => r.symbol);
  }, [activeWatchlist, gridView, itemsBySymbol, latestAddedDate, held]);

  // After a filter/sort change, jump back to the top so the new first cards are the
  // ones in view (their IntersectionObservers fire on the layout change).
  useEffect(() => {
    gridScrollRef.current?.scrollTo({ top: 0 });
  }, [gridView]);

  const gridControlsProps = {
    view: gridView,
    onChange: setGridView,
    shown: gridSymbols.length,
    total: activeWatchlist?.symbols.length ?? 0,
    positions,
  };

  const heldNotice = gridView.held && (positions.status === 'unconfigured'
    ? 'Paper keys are not installed on the backend, so held positions are unavailable.'
    : positions.status === 'error'
    ? `Couldn't reach Alpaca: positions unavailable${positions.error ? ` (${positions.error})` : ''}.`
    : positions.stale
    ? `Couldn't reach Alpaca: showing last known positions${positions.fetched_at ? ` from ${new Date(positions.fetched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}.`
    : null);

  const emptyGridMessage = isDefaultView(gridView) ? undefined : gridView.held ? (
    <span data-testid="held-empty">
      {positions.status === 'loading' ? 'Loading paper positions…'
        : positions.status === 'unconfigured' ? 'Held positions unavailable: paper keys not installed.'
        : positions.status === 'error' ? "Held positions unavailable: couldn't reach Alpaca."
        : held.size === 0 ? 'No open paper positions.'
        : 'No held positions match these filters.'}{' '}
      <button type="button" className="text-[#26a69a] underline min-h-11 touch:px-2" onClick={() => setGridView({ ...gridView, held: false })}>
        Show all charts
      </button>
    </span>
  ) : (
    <>
      No charts added in this range.{' '}
      <button type="button" className="text-[#26a69a] underline min-h-11 touch:px-2" onClick={() => setGridView({ ...gridView, added: 'all', from: '', to: '' })}>
        Show all
      </button>
    </>
  );

  const timeframes = [
    { label: '1D', value: '1D' },
    { label: '1W', value: '1W' },
    { label: '3M', value: '3M' },
    { label: '6M', value: '6M' },
    { label: '1Y', value: '1Y' },
  ];

  const views: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'charts', label: 'Flip-Charts', icon: <BarChart2 size={18} /> },
    { id: 'momentum', label: 'Sector Momentum', icon: <TrendingUp size={18} /> },
    { id: 'manager', label: 'Watchlist Manager', icon: <Tag size={18} /> },
    { id: 'sync', label: 'Market Sync', icon: <Zap size={18} /> },
  ];
  const activeView = views.find((v) => v.id === activeTab);

  const handleSelectView = (id: string) => {
    setActiveTab(id as ActiveTab);
    closeDrawer();
  };

  const paneToggle = (
    <button
      ref={paneToggleRef}
      type="button"
      onClick={() => setIsPaneOpen((open) => !open)}
      className="-ml-1.5 md:-ml-2 shrink-0 h-11 w-11 md:h-9 md:w-9 flex items-center justify-center text-gray-400 hover:text-white rounded hover:bg-[#1c202d]"
      aria-controls="watchlist-pane"
      aria-expanded={isPaneOpen}
      aria-label={isPaneOpen ? 'Hide watchlist pane' : 'Show watchlist pane'}
      title={isPaneOpen ? 'Hide watchlists' : 'Show watchlists'}
    >
      {isDesktop
        ? (isPaneOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />)
        : <Menu size={22} />}
    </button>
  );

  return (
    <div className="flex h-screen w-screen bg-[#0b0e14] text-white overflow-hidden font-sans">
      {isDrawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}

      <div
        id="watchlist-pane"
        className={cn(
          'shrink-0 h-full',
          isDesktop
            ? !isPaneOpen && 'hidden'
            : cn(
                'fixed inset-y-0 left-0 z-50 shadow-2xl transition-transform duration-200 ease-out',
                isPaneOpen ? 'translate-x-0' : '-translate-x-full'
              )
        )}
        role={isDesktop ? undefined : 'dialog'}
        aria-modal={isDrawerOpen ? true : undefined}
        aria-label={isDesktop ? 'Watchlists' : 'Menu'}
        inert={!isDesktop && !isPaneOpen ? true : undefined}
      >
        <Sidebar
          activeWatchlistId={activeWatchlistId}
          onSelectWatchlist={handleSelectWatchlist}
          onClose={isDesktop ? undefined : closeDrawer}
          closeButtonRef={paneCloseRef}
          views={isDesktop ? undefined : views}
          activeViewId={activeTab}
          onSelectView={handleSelectView}
          filterSection={!isDesktop && activeTab === 'charts' ? <GridControls {...gridControlsProps} variant="drawer" /> : undefined}
        />
      </div>

      <main className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
        {/* Top Header Navigation & Toolbar (md and up: unchanged) */}
        {isDesktop ? (
        <header className="h-16 border-b border-[#242733] bg-[#131722] flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-6">
            {paneToggle}

            {/* Watchlist Info */}
            <div className="flex flex-col justify-center min-w-[120px]">
              <h2 className="text-sm font-bold leading-tight">{activeWatchlist?.name}</h2>
              {activeWatchlist && activeWatchlist.symbols.length > 0 && (
                <div className="mt-1">
                  <WatchlistStats symbols={activeWatchlist.symbols} />
                </div>
              )}
            </div>

            <div className="h-8 w-px bg-[#242733]" />

            {/* Navigation Tabs */}
            <nav className="flex items-center gap-1 bg-[#1c202d] rounded p-1">
              <button
                onClick={() => setActiveTab('charts')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded transition-colors whitespace-nowrap',
                  activeTab === 'charts' ? 'bg-[#26a69a] text-white' : 'text-gray-400 hover:text-gray-200'
                )}
              >
                <BarChart2 size={14} /> Flip-Charts
              </button>

              <button
                onClick={() => setActiveTab('momentum')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded transition-colors whitespace-nowrap',
                  activeTab === 'momentum' ? 'bg-[#26a69a] text-white' : 'text-gray-400 hover:text-gray-200'
                )}
              >
                <TrendingUp size={14} /> Sector Momentum
              </button>

              <button
                onClick={() => setActiveTab('manager')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded transition-colors whitespace-nowrap',
                  activeTab === 'manager' ? 'bg-[#26a69a] text-white' : 'text-gray-400 hover:text-gray-200'
                )}
              >
                <Tag size={14} /> Watchlist Manager
              </button>

              <button
                onClick={() => setActiveTab('sync')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded transition-colors whitespace-nowrap',
                  activeTab === 'sync' ? 'bg-[#26a69a] text-white' : 'text-gray-400 hover:text-gray-200'
                )}
              >
                <Zap size={14} /> Market Sync
              </button>
            </nav>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-4">
            {/* Timeframe Selector (visible on Flip-Charts tab) */}
            {activeTab === 'charts' && (
              <div className="flex items-center gap-1 bg-[#1c202d] rounded p-1">
                {timeframes.map((tf) => (
                  <button
                    key={tf.value}
                    onClick={() => setTimeframe(tf.value)}
                    className={cn(
                      'px-2 py-0.5 text-[10px] font-bold rounded transition-colors whitespace-nowrap',
                      timeframe === tf.value ? 'bg-[#26a69a] text-white' : 'text-gray-500 hover:text-gray-300'
                    )}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-gray-400 hover:text-white rounded hover:bg-[#1c202d]"
              title="Settings"
            >
              <Settings size={20} />
            </button>
          </div>
        </header>
        ) : (
        /* Phone header: two rows, every control on-screen. Views (tabs) live in the drawer. */
        <header className="border-b border-[#242733] bg-[#131722] shrink-0 px-3 pt-1.5 pb-1.5 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 min-w-0">
            {paneToggle}
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <h2 className="text-sm font-bold leading-tight truncate">
                {activeTab === 'charts' ? activeWatchlist?.name : activeView?.label}
              </h2>
              {activeWatchlist && activeWatchlist.symbols.length > 0 && (
                <div className="mt-1 overflow-x-auto scrollbar-hide">
                  <WatchlistStats symbols={activeWatchlist.symbols} compact />
                </div>
              )}
            </div>
            {activeTab === 'charts' && (
              <button
                type="button"
                onClick={() => setIsPaneOpen(true)}
                data-testid="grid-view-chip"
                className={cn(
                  'shrink-0 h-11 px-2.5 flex items-center gap-1.5 rounded text-[11px] font-bold whitespace-nowrap',
                  isDefaultView(gridView)
                    ? 'text-gray-400 bg-[#1c202d] hover:text-white'
                    : 'text-[#26a69a] bg-[#26a69a]/15 hover:bg-[#26a69a]/25'
                )}
                aria-label={`Filter and sort charts (${viewSummary(gridView)}, ${gridSymbols.length} of ${activeWatchlist?.symbols.length ?? 0})`}
                title="Filter & sort"
              >
                <SlidersHorizontal size={14} />
                {isDefaultView(gridView) ? 'Sort' : viewSummary(gridView)}
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="-mr-1.5 shrink-0 h-11 w-11 flex items-center justify-center text-gray-400 hover:text-white rounded hover:bg-[#1c202d]"
              aria-label="Settings"
              title="Settings"
            >
              <Settings size={20} />
            </button>
          </div>

          {activeTab === 'charts' && (
            <div className="grid grid-cols-5 gap-1" role="group" aria-label="Timeframe">
              {timeframes.map((tf) => (
                <button
                  key={tf.value}
                  type="button"
                  onClick={() => setTimeframe(tf.value)}
                  aria-pressed={timeframe === tf.value}
                  className={cn(
                    'h-11 text-xs font-bold rounded transition-colors',
                    timeframe === tf.value ? 'bg-[#26a69a] text-white' : 'bg-[#1c202d] text-gray-400 hover:text-gray-200'
                  )}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          )}
        </header>
        )}

        {/* Tab Content Renderer */}
        {isDesktop && activeTab === 'charts' && activeWatchlist && (
          <GridControls {...gridControlsProps} variant="toolbar" />
        )}
        {activeTab === 'charts' && heldNotice && (
          <div role="status" data-testid="held-notice" className="shrink-0 px-3 py-1.5 text-[11px] bg-amber-500/10 text-amber-300 border-b border-amber-500/30">
            {heldNotice}
          </div>
        )}
        <div ref={gridScrollRef} className="flex-1 overflow-y-auto scrollbar-hide flex flex-col">
          {activeTab === 'charts' && (
            activeWatchlist ? (
              <ChartGrid
                symbols={gridSymbols}
                timeframe={timeframe}
                emptyMessage={emptyGridMessage}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <Layers size={48} className="mx-auto mb-4 opacity-20" />
                  <p>Select or create a watchlist to get started</p>
                </div>
              </div>
            )
          )}

          {activeTab === 'momentum' && (
            <SectorMomentumTab
              activeWatchlistId={activeWatchlistId}
              watchlists={watchlists}
              onSelectWatchlist={setActiveWatchlistId}
            />
          )}

          {activeTab === 'manager' && (
            <WatchlistManagerTab
              activeWatchlistId={activeWatchlistId}
              watchlists={watchlists}
              onSelectWatchlist={setActiveWatchlistId}
              onWatchlistUpdated={refreshWatchlists}
            />
          )}

          {activeTab === 'sync' && <SyncMonitorTab />}
        </div>
      </main>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
};

const PositionsBridge: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { watchlistItems, refreshWatchlists } = useServices();
  const symbols = useMemo(() => watchlistItems.map((i) => i.symbol), [watchlistItems]);
  return (
    <PositionsProvider watchlistSymbols={symbols} watchlistLoaded={watchlistItems.length > 0} refreshWatchlists={refreshWatchlists}>
      {children}
    </PositionsProvider>
  );
};

export default function App() {
  return (
    <ServiceProvider>
      <PositionsBridge>
        <AppContent />
      </PositionsBridge>
    </ServiceProvider>
  );
}
