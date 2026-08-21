import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { IStorageService, UserSettings } from '../lib/storage/IStorageService';
import { LocalStorageService } from '../lib/storage/LocalStorageService';
import { IApiClient } from '../lib/api/IApiClient';
import { AlphaVantageApiClient, AlpacaApiClient } from '../lib/api/ApiClient';
import { DatabaseApiClient } from '../lib/api/DatabaseApiClient';
import { IChartAdapter } from '../lib/charts/IChartAdapter';
import { LightweightChartsAdapter } from '../lib/charts/LightweightChartsAdapter';
import { parseWatchlistYaml, dumpWatchlistYaml, WatchlistItem } from '../lib/utils/watchlistParser';

export interface DerivedWatchlist {
  id: string;
  name: string;
  symbols: string[];
}

interface Services {
  storage: IStorageService;
  api: IApiClient;
  chart: IChartAdapter;
  settings: UserSettings;
  watchlistItems: WatchlistItem[];
  watchlists: DerivedWatchlist[];
  refreshWatchlists: () => Promise<void>;
  saveWatchlist: (items: WatchlistItem[]) => Promise<void>;
  addTicker: (item: WatchlistItem) => Promise<void>;
  updateTicker: (symbol: string, updates: Partial<WatchlistItem>) => Promise<void>;
  removeTicker: (symbol: string) => Promise<void>;
  updateSettings: (settings: UserSettings) => Promise<void>;
  getNotes: (symbol: string) => Promise<string>;
  saveNotes: (symbol: string, notes: string) => Promise<void>;
}

const ServiceContext = createContext<Services | null>(null);

export const ServiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const storage = useMemo(() => new LocalStorageService(), []);
  const chart = useMemo(() => new LightweightChartsAdapter(), []);
  
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);

  const refreshWatchlists = async () => {
    try {
      // Append a cache-buster query param so that updates in IDE are fetched immediately
      const res = await fetch(`/watchlist.yaml?t=${Date.now()}`);
      if (!res.ok) throw new Error('Failed to fetch watchlist.yaml');
      const text = await res.text();
      const parsed = parseWatchlistYaml(text);
      setWatchlistItems(parsed);
    } catch (err) {
      console.error('Error loading watchlist.yaml:', err);
    }
  };

  const saveWatchlist = async (items: WatchlistItem[]) => {
    try {
      setWatchlistItems(items);
      const yamlContent = dumpWatchlistYaml(items);
      
      // Save directly via backend or Vite middleware endpoint
      await fetch('/api/watchlist/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml: yamlContent, items }),
      }).catch((err) => {
        console.warn('API save failed, using local state:', err);
      });
    } catch (err) {
      console.error('Error saving watchlist:', err);
    }
  };

  const addTicker = async (newItem: WatchlistItem) => {
    const sym = newItem.symbol.toUpperCase().trim();
    const existingIdx = watchlistItems.findIndex((i) => i.symbol.toUpperCase() === sym);
    let updated: WatchlistItem[];

    if (existingIdx >= 0) {
      // Merge with existing ticker
      const existing = watchlistItems[existingIdx];
      const mergedTags = Array.from(new Set([...existing.tags, ...newItem.tags]));
      const mergedItem: WatchlistItem = {
        ...existing,
        ...newItem,
        symbol: sym,
        tags: mergedTags,
      };
      updated = [...watchlistItems];
      updated[existingIdx] = mergedItem;
    } else {
      updated = [...watchlistItems, { ...newItem, symbol: sym }];
    }

    await saveWatchlist(updated);
  };

  const updateTicker = async (symbol: string, updates: Partial<WatchlistItem>) => {
    const sym = symbol.toUpperCase().trim();
    const updated = watchlistItems.map((item) => {
      if (item.symbol.toUpperCase() === sym) {
        return { ...item, ...updates, symbol: sym };
      }
      return item;
    });
    await saveWatchlist(updated);
  };

  const removeTicker = async (symbol: string) => {
    const sym = symbol.toUpperCase().trim();
    const updated = watchlistItems.filter((item) => item.symbol.toUpperCase() !== sym);
    await saveWatchlist(updated);
  };

  useEffect(() => {
    const init = async () => {
      const s = await storage.getSettings();
      setSettings(s);
      await refreshWatchlists();
    };
    init();
  }, [storage]);

  const api = useMemo(() => {
    if (!settings) return null;
    const baseClient = settings.preferredApi === 'alpaca' 
      ? new AlpacaApiClient(settings) 
      : new AlphaVantageApiClient(settings);
    return new DatabaseApiClient(baseClient);
  }, [settings]);

  const updateSettings = async (newSettings: UserSettings) => {
    await storage.saveSettings(newSettings);
    setSettings(newSettings);
  };

  const getNotes = async (symbol: string) => {
    return storage.getNotes(symbol);
  };

  const saveNotes = async (symbol: string, notes: string) => {
    await storage.saveNotes(symbol, notes);
  };

  // Derive watchlists dynamically from tags in watchlistItems, with 'all' at the top
  const watchlists = useMemo<DerivedWatchlist[]>(() => {
    const tagMap = new Map<string, string[]>();
    
    // Add All Symbols list
    const allSymbols = watchlistItems.map((i) => i.symbol);
    tagMap.set('all', allSymbols);

    for (const item of watchlistItems) {
      const tags = item.tags.length > 0 ? item.tags : ['uncategorized'];
      for (const tag of tags) {
        const cleanTag = tag.trim();
        if (!cleanTag) continue;
        const normKey = cleanTag.toLowerCase();
        if (!tagMap.has(normKey)) {
          tagMap.set(normKey, []);
        }
        const list = tagMap.get(normKey)!;
        if (!list.includes(item.symbol)) {
          list.push(item.symbol);
        }
      }
    }

    const result: DerivedWatchlist[] = [];
    for (const [tagKey, symbols] of tagMap.entries()) {
      if (tagKey === 'all') {
        result.push({
          id: 'all',
          name: 'All Symbols',
          symbols,
        });
      } else {
        const displayName = tagKey
          .split(/[_-]/)
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        result.push({
          id: tagKey,
          name: displayName,
          symbols,
        });
      }
    }

    return result.sort((a, b) => {
      if (a.id === 'all') return -1;
      if (b.id === 'all') return 1;
      return a.name.localeCompare(b.name);
    });
  }, [watchlistItems]);

  if (!settings || !api) return <div className="bg-[#0b0e14] h-screen w-screen flex items-center justify-center text-white">Loading...</div>;

  return (
    <ServiceContext.Provider value={{
      storage,
      api,
      chart,
      settings,
      watchlistItems,
      watchlists,
      refreshWatchlists,
      saveWatchlist,
      addTicker,
      updateTicker,
      removeTicker,
      updateSettings,
      getNotes,
      saveNotes,
    }}>
      {children}
    </ServiceContext.Provider>
  );
};


export const useServices = () => {
  const context = useContext(ServiceContext);
  if (!context) throw new Error('useServices must be used within ServiceProvider');
  return context;
};
