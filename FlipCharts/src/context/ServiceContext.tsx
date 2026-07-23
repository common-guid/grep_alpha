import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { IStorageService, UserSettings } from '../lib/storage/IStorageService';
import { LocalStorageService } from '../lib/storage/LocalStorageService';
import { IApiClient } from '../lib/api/IApiClient';
import { AlphaVantageApiClient, AlpacaApiClient } from '../lib/api/ApiClient';
import { DatabaseApiClient } from '../lib/api/DatabaseApiClient';
import { IChartAdapter } from '../lib/charts/IChartAdapter';
import { LightweightChartsAdapter } from '../lib/charts/LightweightChartsAdapter';
import { parseWatchlistYaml, WatchlistItem } from '../lib/utils/watchlistParser';

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

  // Derive watchlists dynamically from tags in watchlistItems
  const watchlists = useMemo<DerivedWatchlist[]>(() => {
    const tagMap = new Map<string, string[]>();
    
    for (const item of watchlistItems) {
      const tags = item.tags.length > 0 ? item.tags : ['uncategorized'];
      for (const tag of tags) {
        if (!tagMap.has(tag)) {
          tagMap.set(tag, []);
        }
        const list = tagMap.get(tag)!;
        if (!list.includes(item.symbol)) {
          list.push(item.symbol);
        }
      }
    }

    return Array.from(tagMap.entries()).map(([tag, symbols]) => {
      // Clean up display name
      const displayName = tag
        .split(/[_-]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      
      return {
        id: tag,
        name: displayName,
        symbols
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
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
