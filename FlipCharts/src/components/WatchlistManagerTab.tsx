import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit3, Tag, Search, Check, X, FileText } from 'lucide-react';

interface WatchlistManagerTabProps {
  activeWatchlistId: string;
  watchlists: Array<{ id: string; name: string }>;
  onSelectWatchlist: (id: string) => void;
  onWatchlistUpdated: () => void;
}

interface TickerMeta {
  symbol: string;
  status?: string;
  target_entry?: number | null;
  thesis?: string;
  tags?: string[] | string;
}

export const WatchlistManagerTab: React.FC<WatchlistManagerTabProps> = ({
  activeWatchlistId,
  watchlists,
  onSelectWatchlist,
  onWatchlistUpdated,
}) => {
  const [tickers, setTickers] = useState<TickerMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Add Ticker Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');
  const [newThesis, setNewThesis] = useState('');
  const [newStatus, setNewStatus] = useState('watching');
  const [newTarget, setNewTarget] = useState('');
  const [newTags, setNewTags] = useState('');

  // Edit Ticker Modal state
  const [editingItem, setEditingItem] = useState<TickerMeta | null>(null);

  const fetchWatchlistDetail = async () => {
    if (!activeWatchlistId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/watchlists/${activeWatchlistId}`);
      if (res.ok) {
        const data = await res.json();
        setTickers(data.tickers || []);
      }
    } catch (err) {
      console.error('Failed to fetch watchlist details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWatchlistDetail();
  }, [activeWatchlistId]);

  const handleAddTicker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbol.trim()) return;

    try {
      const payload = {
        symbol: newSymbol.trim().toUpperCase(),
        thesis: newThesis.trim(),
        status: newStatus,
        target_entry: newTarget ? parseFloat(newTarget) : null,
        tags: newTags ? newTags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      };

      const res = await fetch(`/api/watchlists/${activeWatchlistId}/tickers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsAddModalOpen(false);
        setNewSymbol('');
        setNewThesis('');
        setNewTarget('');
        setNewTags('');
        fetchWatchlistDetail();
        onWatchlistUpdated();
      }
    } catch (err) {
      console.error('Failed to add ticker:', err);
    }
  };

  const handleRemoveTicker = async (symbol: string) => {
    if (!window.confirm(`Are you sure you want to remove ${symbol} from '${activeWatchlistId}'?`)) return;
    try {
      const res = await fetch(`/api/watchlists/${activeWatchlistId}/tickers/${symbol}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchWatchlistDetail();
        onWatchlistUpdated();
      }
    } catch (err) {
      console.error('Failed to remove ticker:', err);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    try {
      const payload = {
        thesis: editingItem.thesis,
        status: editingItem.status,
        target_entry: editingItem.target_entry,
        tags: Array.isArray(editingItem.tags) 
          ? editingItem.tags 
          : typeof editingItem.tags === 'string'
          ? (editingItem.tags as string).split(',').map((t) => t.trim())
          : [],
      };

      const res = await fetch(`/api/watchlists/${activeWatchlistId}/tickers/${editingItem.symbol}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setEditingItem(null);
        fetchWatchlistDetail();
        onWatchlistUpdated();
      }
    } catch (err) {
      console.error('Failed to update ticker:', err);
    }
  };

  const filteredTickers = tickers.filter((t) => {
    const sym = t.symbol.toLowerCase();
    const thesis = (t.thesis || '').toLowerCase();
    const term = searchTerm.toLowerCase();
    return sym.includes(term) || thesis.includes(term);
  });

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
            Manage stock symbols, target entry prices, tags, and investment theses.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <select
            value={activeWatchlistId}
            onChange={(e) => onSelectWatchlist(e.target.value)}
            className="bg-[#1c202d] border border-[#242733] text-white text-xs rounded px-3 py-2 focus:outline-none focus:border-[#26a69a]"
          >
            {watchlists.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 bg-[#26a69a] hover:bg-[#2bbbad] text-white text-xs font-bold px-4 py-2 rounded transition-colors"
          >
            <Plus size={16} /> Add Symbol
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search size={14} className="absolute left-3 top-2.5 text-gray-500" />
          <input
            type="text"
            placeholder="Search symbol or thesis..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#131722] border border-[#242733] text-white text-xs rounded pl-9 pr-3 py-2 focus:outline-none focus:border-[#26a69a]"
          />
        </div>
        <span className="text-xs text-gray-500 font-mono">
          Showing {filteredTickers.length} of {tickers.length} tickers
        </span>
      </div>

      {/* Tickers Data Table */}
      <div className="bg-[#131722] border border-[#242733] rounded overflow-hidden">
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
              <tr key={t.symbol} className="hover:bg-[#1c202d]/50 transition-colors">
                <td className="py-3 px-4 font-bold text-white font-mono">{t.symbol}</td>
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
                  {t.target_entry != null ? `$${Number(t.target_entry).toFixed(2)}` : '-'}
                </td>
                <td className="py-3 px-4">
                  <div className="flex flex-wrap gap-1">
                    {Array.isArray(t.tags)
                      ? t.tags.map((tag) => (
                          <span key={tag} className="bg-[#1c202d] text-gray-400 border border-[#242733] px-1.5 py-0.5 rounded text-[10px]">
                            {tag}
                          </span>
                        ))
                      : typeof t.tags === 'string'
                      ? (t.tags as string).split(',').map((tag) => (
                          <span key={tag} className="bg-[#1c202d] text-gray-400 border border-[#242733] px-1.5 py-0.5 rounded text-[10px]">
                            {tag.trim()}
                          </span>
                        ))
                      : '-'}
                  </div>
                </td>
                <td className="py-3 px-4 text-gray-400 max-w-md truncate">
                  {t.thesis || <span className="italic text-gray-600">No thesis entered</span>}
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setEditingItem({ ...t })}
                      className="p-1 hover:bg-[#242733] text-gray-400 hover:text-white rounded"
                      title="Edit metadata"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => handleRemoveTicker(t.symbol)}
                      className="p-1 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded"
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
                <td colSpan={6} className="py-8 text-center text-gray-500">
                  No tickers found in this watchlist.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Ticker Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#131722] border border-[#242733] rounded w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#242733] pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Add Symbol to {activeWatchlistId}</h3>
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
                  placeholder="e.g. AAPL"
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
                  placeholder="e.g. large_cap, tech, momentum"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  className="w-full bg-[#1c202d] border border-[#242733] text-white rounded px-3 py-2 focus:border-[#26a69a] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Investment Thesis</label>
                <textarea
                  rows={3}
                  placeholder="Trading thesis or setup note..."
                  value={newThesis}
                  onChange={(e) => setNewThesis(e.target.value)}
                  className="w-full bg-[#1c202d] border border-[#242733] text-white rounded px-3 py-2 focus:border-[#26a69a] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-[#1c202d] text-gray-400 hover:text-white rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#26a69a] hover:bg-[#2bbbad] text-white font-bold rounded"
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#131722] border border-[#242733] rounded w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#242733] pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Edit Metadata: {editingItem.symbol}
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
                  className="px-4 py-2 bg-[#1c202d] text-gray-400 hover:text-white rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#26a69a] hover:bg-[#2bbbad] text-white font-bold rounded"
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
