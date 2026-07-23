/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ServiceProvider, useServices } from './context/ServiceContext';
import { Sidebar } from './components/Sidebar';
import { ChartGrid } from './components/ChartGrid';
import { SettingsModal } from './components/SettingsModal';
import { WatchlistStats } from './components/WatchlistStats';
import { SectorMomentumTab } from './components/SectorMomentumTab';
import { WatchlistManagerTab } from './components/WatchlistManagerTab';
import { SyncMonitorTab } from './components/SyncMonitorTab';
import { Settings, Layers, TrendingUp, BarChart2, Tag, Zap } from 'lucide-react';
import { cn } from './lib/utils';

type ActiveTab = 'charts' | 'momentum' | 'manager' | 'sync';

const AppContent: React.FC = () => {
  const { watchlists, refreshWatchlists } = useServices();
  const [activeTab, setActiveTab] = useState<ActiveTab>('charts');
  const [activeWatchlistId, setActiveWatchlistId] = useState<string>('');
  const [timeframe, setTimeframe] = useState('3M');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    if (watchlists.length > 0 && !activeWatchlistId) {
      setActiveWatchlistId(watchlists[0].id);
    }
  }, [watchlists, activeWatchlistId]);

  const activeWatchlist = watchlists.find((w) => w.id === activeWatchlistId);

  const timeframes = [
    { label: '1D', value: '1D' },
    { label: '1W', value: '1W' },
    { label: '3M', value: '3M' },
    { label: '6M', value: '6M' },
    { label: '1Y', value: '1Y' },
  ];

  return (
    <div className="flex h-screen w-screen bg-[#0b0e14] text-white overflow-hidden font-sans">
      <Sidebar activeWatchlistId={activeWatchlistId} onSelectWatchlist={setActiveWatchlistId} />

      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Header Navigation & Toolbar */}
        <header className="h-16 border-b border-[#242733] bg-[#131722] flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-6">
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

        {/* Tab Content Renderer */}
        <div className="flex-1 overflow-y-auto scrollbar-hide flex flex-col">
          {activeTab === 'charts' && (
            activeWatchlist ? (
              <ChartGrid symbols={activeWatchlist.symbols} timeframe={timeframe} />
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

export default function App() {
  return (
    <ServiceProvider>
      <AppContent />
    </ServiceProvider>
  );
}
