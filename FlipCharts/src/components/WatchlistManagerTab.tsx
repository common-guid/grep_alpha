import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Edit3, Tag, Search, Check, X, FileText, Layers } from 'lucide-react';
import { useServices } from '../context/ServiceContext';
import { WatchlistItem } from '../lib/utils/watchlistParser';

interface WatchlistManagerTabProps {
  activeWatchlistId: string;
  watchlists: Array<{ id: string; name: string; symbols: string[] }>;
  onSelectWatchlist: (id: string) => void;
  onWatchlistUpdated?: () => void;
}

export const WatchlistManagerTab: React.FC<WatchlistManagerTabProps> = ({
  activeWatchlistId,
  watchlists,
  onSelectWatchlist,
  onWatchlistUpdated,
}) => {
  const { watchlistItems, addTicker, updateTicker, removeTicker } = useServices();
  const [searchTerm, setSearchTerm] = useState('');

  // Add Ticker Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');
  const [newThesis, setNewThesis] = useState('');
  const [newStatus, setNewStatus] = useState('watching');
  const [newTarget, setNewTarget] = useState('');
  const [newTags, setNewTags] = useState('');

  // Edit Ticker Modal state
  const [editingItem, setEditingItem] = useState<WatchlistItem | null>(null);
  const [editTagsStr, setEditTagsStr] = useState('');

  // Filter tickers based on active tag / watchlist category
  const categoryTickers = useMemo(() => {
    if (!activeWatchlistId || activeWatchlistId === 'all') {
      return watchlistItems;
    }
    const target = activeWatchlistId.trim().toLowerCase();
    const cleanTarget = target.replace(/[_-]/g, '');

    return watchlistItems.filter((item) => {
      if (!item.tags || item.tags.length === 0) {
        return target === 'uncategorized';
      }
      return item.tags.some((tag) => {
        const normTag = tag.trim().toLowerCase();
        return normTag === target || normTag.replace(/[_-]/g, '') === cleanTarget;
      });
    });
  }, [watchlistItems, activeWatchlistId]);

  // Search filter across symbol, thesis, and tags
  const filteredTickers = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return categoryTickers;

    return categoryTickers.filter((t) => {
      const sym = t.symbol.toLowerCase();
      const thesis = (t.thesis || '').toLowerCase();
      const tags = Array.isArray(t.tags) ? t.tags.join(' ').toLowerCase() : '';
      return sym.includes(term) || thesis.includes(term) || tags.includes(term);
    });
  }, [categoryTickers, searchTerm]);

  const activeCategoryObj = watchlists.find((w) => w.id === activeWatchlistId) || {
    id: activeWatchlistId,
    name: activeWatchlistId === 'all' ? 'All Symbols' : activeWatchlistId,
    symbols: [],
  };

  const openAddModal = () => {
    setNewSymbol('');
    setNewThesis('');
    setNewStatus('watching');
    setNewTarget('');
    // Pre-fill active tag if not 'all'
    setNewTags(activeWatchlistId && activeWatchlistId !== 'all' ? activeWatchlistId : '');
    setIsAddModalOpen(true);
  };

  const handleAddTicker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbol.trim()) return;

    try {
      const parsedTags = newTags
        ? newTags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

      const item: WatchlistItem = {
        symbol: newSymbol.trim().toUpperCase(),
        thesis: newThesis.trim(),
        status: newStatus,
        target_entry: newTarget ? parseFloat(newTarget) : null,
        tags: parsedTags,
      };

      await addTicker(item);
      setIsAddModalOpen(false);
      if (onWatchlistUpdated) onWatchlistUpdated();
    } catch (err) {
      console.error('Failed to add ticker:', err);
    }
  };

  const handleRemoveTicker = async (symbol: string) => {
    if (!window.confirm(`Are you sure you want to remove ${symbol} from the master watchlist?`)) return;
    try {
      await removeTicker(symbol);
      if (onWatchlistUpdated) onWatchlistUpdated();
    } catch (err) {
      console.error('Failed to remove ticker:', err);
    }
  };

  const openEditModal = (item: WatchlistItem) => {
    setEditingItem({ ...item });
    setEditTagsStr(Array.isArray(item.tags) ? item.tags.join(', ') : '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    try {
      const parsedTags = editTagsStr
        ? editTagsStr
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

      await updateTicker(editingItem.symbol, {
        thesis: editingItem.thesis,
        status: editingItem.status,
        target_entry: editingItem.target_entry,
        tags: parsedTags,
      });

      setEditingItem(null);
      if (onWatchlistUpdated) onWatchlistUpdated();
    } catch (err) {
      console.error('Failed to update ticker:', err);
    }
  };

  return (
    <div className="flex-1 p-6 bg-[#0b0e14] overflow-y-auto space-y-6">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-[#242733] pb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Tag className="text-[#26a69a]" size={24} />
            Watchlist & Symbol Manager
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Managing <span className="text-white font-semibold font-mono">{activeCategoryObj.name}</span> — Edit investment theses, target entry prices, and tag taxonomy.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <select
            value={activeWatchlistId || 'all'}
            onChange={(e) => onSelectWatchlist(e.target.value)}
            className="bg-[#1c202d] border border-[#242733] text-white text-xs rounded px-3 py-2 focus:outline-none focus:border-[#26a69a]"
          >
            {watchlists.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.symbols.length})
              </option>
            ))}
          </select>

          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 bg-[#26a69a] hover:bg-[#2bbbad] text-white text-xs font-bold px-4 py-2 rounded transition-colors shadow-lg shadow-[#26a69a]/10"
          >
            <Plus size={16} /> Add Symbol
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search size={14} className="absolute left-3 top-2.5 text-gray-500" />
          <input
            type="text"
            placeholder="Search symbol, tags, or thesis..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#131722] border border-[#242733] text-white text-xs rounded pl-9 pr-3 py-2 focus:outline-none focus:border-[#26a69a]"
          />
        </div>
        <span className="text-xs text-gray-500 font-mono">
          Showing {filteredTickers.length} of {categoryTickers.length} tickers in {activeCategoryObj.name} (Total Master: {watchlistItems.length})
        </span>
      </div>

      {/* Tickers Data Table */}
      <div className="bg-[#131722] border border-[#242733] rounded overflow-hidden shadow-xl">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-[#1c202d] border-b border-[#242733] text-gray-400 font-bold uppercase tracking-wider text-[10px]">
              <th className="py-3 px-4">Symbol</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Target Entry</th>
              <th className="py-3 px-4">Tags</th>
              <th className="py-3 px-4">Thesis Note</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#242733] text-gray-300">
            {filteredTickers.map((t) => (
              <tr key={t.symbol} className="hover:bg-[#1c202d]/50 transition-colors group">
                <td className="py-3 px-4 font-bold text-white font-mono text-sm">{t.symbol}</td>
                <td className="py-3 px-4">
                  <span
                    className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded border ${
                      t.status === 'core_holding'
                        ? 'bg-[#26a69a]/10 text-[#26a69a] border-[#26a69a]/30'
                        : t.status === 'watching'
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                        : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
                    }`}
                  >
                    {t.status || 'watching'}
                  </span>
                </td>
                <td className="py-3 px-4 font-mono">
                  {t.target_entry != null ? (
                    <span className="text-[#26a69a] font-semibold">${Number(t.target_entry).toFixed(2)}</span>
                  ) : (
                    <span className="text-gray-600">-</span>
                  )}
                </td>
                <td className="py-3 px-4">
                  <div className="flex flex-wrap gap-1">
                    {Array.isArray(t.tags) && t.tags.length > 0 ? (
                      t.tags.map((tag) => (
                        <span
                          key={tag}
                          className="bg-[#1c202d] text-gray-300 border border-[#242733] px-1.5 py-0.5 rounded text-[10px]"
                        >
                          {tag}
                        </span>
                      ))
                    ) : (
                      <span className="text-gray-600 italic">No tags</span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-4 text-gray-300 max-w-md">
                  <div className="truncate" title={t.thesis || ''}>
                    {t.thesis || <span className="italic text-gray-600">No thesis entered</span>}
                  </div>
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => openEditModal(t)}
                      className="p-1.5 hover:bg-[#242733] text-gray-400 hover:text-white rounded transition-colors"
                      title="Edit metadata"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => handleRemoveTicker(t.symbol)}
                      className="p-1.5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded transition-colors"
                      title="Remove ticker"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredTickers.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-gray-500">
                  <Layers size={36} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm font-semibold">No tickers found in {activeCategoryObj.name}</p>
                  <p className="text-[11px] text-gray-600 mt-1">
                    Click &quot;Add Symbol&quot; to add a new ticker with this tag.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Ticker Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#131722] border border-[#242733] rounded-lg w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#242733] pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Add Symbol to {activeCategoryObj.name}
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddTicker} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-400 mb-1">Ticker Symbol *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AAPL, NVDA, LMT"
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value)}
                  className="w-full bg-[#1c202d] border border-[#242733] text-white rounded px-3 py-2 uppercase font-mono focus:border-[#26a69a] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 mb-1">Status</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="w-full bg-[#1c202d] border border-[#242733] text-white rounded px-3 py-2 focus:border-[#26a69a] focus:outline-none"
                  >
                    <option value="watching">watching</option>
                    <option value="core_holding">core_holding</option>
                    <option value="passed">passed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-400 mb-1">Target Entry ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 180.50"
                    value={newTarget}
                    onChange={(e) => setNewTarget(e.target.value)}
                    className="w-full bg-[#1c202d] border border-[#242733] text-white rounded px-3 py-2 font-mono focus:border-[#26a69a] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Tags (Comma-separated)</label>
                <input
                  type="text"
                  placeholder="e.g. Aero, Defense_Tech, AI_Adjacent"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  className="w-full bg-[#1c202d] border border-[#242733] text-white rounded px-3 py-2 focus:border-[#26a69a] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Investment Thesis</label>
                <textarea
                  rows={3}
                  placeholder="Trading setup note or institutional investment thesis..."
                  value={newThesis}
                  onChange={(e) => setNewThesis(e.target.value)}
                  className="w-full bg-[#1c202d] border border-[#242733] text-white rounded px-3 py-2 focus:border-[#26a69a] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-[#1c202d] text-gray-400 hover:text-white rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#26a69a] hover:bg-[#2bbbad] text-white font-bold rounded transition-colors"
                >
                  Add Symbol
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Ticker Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#131722] border border-[#242733] rounded-lg w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#242733] pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Edit Metadata: <span className="font-mono text-[#26a69a]">{editingItem.symbol}</span>
              </h3>
              <button onClick={() => setEditingItem(null)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 mb-1">Status</label>
                  <select
                    value={editingItem.status || 'watching'}
                    onChange={(e) => setEditingItem({ ...editingItem, status: e.target.value })}
                    className="w-full bg-[#1c202d] border border-[#242733] text-white rounded px-3 py-2 focus:border-[#26a69a] focus:outline-none"
                  >
                    <option value="watching">watching</option>
                    <option value="core_holding">core_holding</option>
                    <option value="passed">passed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-400 mb-1">Target Entry ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingItem.target_entry ?? ''}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        target_entry: e.target.value ? parseFloat(e.target.value) : null,
                      })
                    }
                    className="w-full bg-[#1c202d] border border-[#242733] text-white rounded px-3 py-2 font-mono focus:border-[#26a69a] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Tags (Comma-separated)</label>
                <input
                  type="text"
                  value={editTagsStr}
                  onChange={(e) => setEditTagsStr(e.target.value)}
                  placeholder="e.g. Aero, Defense_Tech, AI_Adjacent"
                  className="w-full bg-[#1c202d] border border-[#242733] text-white rounded px-3 py-2 focus:border-[#26a69a] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Investment Thesis</label>
                <textarea
                  rows={4}
                  value={editingItem.thesis || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, thesis: e.target.value })}
                  className="w-full bg-[#1c202d] border border-[#242733] text-white rounded px-3 py-2 focus:border-[#26a69a] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 bg-[#1c202d] text-gray-400 hover:text-white rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#26a69a] hover:bg-[#2bbbad] text-white font-bold rounded transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
