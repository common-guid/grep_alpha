import React from 'react';
import { useServices } from '../context/ServiceContext';
import { List, TrendingUp, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

interface SidebarProps {
  activeWatchlistId: string;
  onSelectWatchlist: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeWatchlistId, onSelectWatchlist }) => {
  const { watchlists, refreshWatchlists } = useServices();
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshWatchlists();
    setIsRefreshing(false);
  };

  return (
    <div className="w-64 bg-[#1c202d] border-r border-[#242733] flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-[#242733] flex items-center gap-2">
        <TrendingUp className="text-[#26a69a]" size={20} />
        <h1 className="text-sm font-bold text-white uppercase tracking-wider">Stock Reviewer</h1>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <div className="px-4 mb-3 flex items-center justify-between">
          <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Watchlist Tags</h2>
          <button 
            onClick={handleRefresh}
            className="text-gray-400 hover:text-white p-1 hover:bg-[#242733] rounded transition-colors"
            title="Reload watchlist.yaml"
          >
            <RefreshCw size={12} className={cn(isRefreshing && "animate-spin")} />
          </button>
        </div>

        <nav className="space-y-px">
          {watchlists.map(list => (
            <div 
              key={list.id}
              onClick={() => onSelectWatchlist(list.id)}
              className={cn(
                "group px-4 py-2 cursor-pointer flex items-center justify-between text-xs transition-colors",
                activeWatchlistId === list.id 
                  ? "bg-[#2a2e39] text-white border-l-2 border-[#26a69a]" 
                  : "text-gray-400 hover:bg-[#242733] hover:text-gray-200"
              )}
            >
              <div className="flex items-center gap-3 truncate">
                <List size={14} className={activeWatchlistId === list.id ? "text-[#26a69a]" : "text-gray-500"} />
                <span className="truncate">{list.name}</span>
              </div>
              <span className="text-[10px] text-gray-500 font-mono bg-[#131722]/50 px-1.5 py-0.5 rounded">
                {list.symbols.length}
              </span>
            </div>
          ))}
          {watchlists.length === 0 && (
            <div className="px-4 py-3 text-xs text-gray-500 italic">
              No tags found. Check watchlist.yaml.
            </div>
          )}
        </nav>
      </div>

      <div className="p-4 border-t border-[#242733] text-[10px] text-gray-600 italic">
        Select a tag to filter charts
      </div>
    </div>
  );
};
