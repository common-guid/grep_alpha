import React, { useState, useEffect } from 'react';
import { Database, Zap, RefreshCw, CheckCircle2, AlertCircle, HardDrive, Clock, Server } from 'lucide-react';

interface StatusState {
  sync: {
    is_running: boolean;
    last_synced: string | null;
    last_log: string;
  };
  database: {
    path: string;
    unique_tickers: number;
    total_records: number;
    latest_date: string | null;
  };
}

export const SyncMonitorTab: React.FC = () => {
  const [status, setStatus] = useState<StatusState | null>(null);
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.sync?.last_log) {
          addLog(`[${new Date().toLocaleTimeString()}] ${data.sync.last_log}`);
        }
      }
    } catch (err) {
      console.error('Failed to fetch status:', err);
    } finally {
      setLoading(false);
    }
  };

  const addLog = (msg: string) => {
    setLogs((prev) => {
      if (prev.length > 0 && prev[prev.length - 1] === msg) return prev;
      return [...prev.slice(-100), msg];
    });
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleTriggerSync = async () => {
    setTriggering(true);
    addLog(`[${new Date().toLocaleTimeString()}] Triggering Alpaca EOD Market Data Sync...`);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();
      addLog(`[${new Date().toLocaleTimeString()}] Server: ${data.message}`);
      await fetchStatus();
    } catch (err: any) {
      addLog(`[${new Date().toLocaleTimeString()}] Error triggering sync: ${err.message}`);
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="flex-1 p-6 bg-[#0b0e14] overflow-y-auto space-y-6 font-sans">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-[#242733] pb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Zap className="text-[#26a69a]" size={24} />
            Market Data Sync & System Status
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Monitor SQLite database caching, date ranges, and trigger Alpaca API market data syncs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchStatus}
            className="p-2 text-gray-400 hover:text-white bg-[#1c202d] border border-[#242733] rounded hover:bg-[#242733]"
            title="Refresh Status"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={handleTriggerSync}
            disabled={status?.sync.is_running || triggering}
            className={`flex items-center gap-2 px-5 py-2 rounded text-xs font-bold transition-all ${
              status?.sync.is_running || triggering
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-[#26a69a] hover:bg-[#2bbbad] text-white shadow-lg shadow-[#26a69a]/20'
            }`}
          >
            <Zap size={16} className={status?.sync.is_running || triggering ? 'animate-bounce' : ''} />
            {status?.sync.is_running ? 'Sync in Progress...' : 'Start Market Data Sync'}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#131722] border border-[#242733] p-4 rounded flex items-center gap-4">
          <div className="p-3 bg-[#26a69a]/10 text-[#26a69a] rounded">
            <Database size={24} />
          </div>
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Cached Tickers</span>
            <span className="text-2xl font-bold text-white font-mono">{status?.database.unique_tickers ?? 0}</span>
          </div>
        </div>

        <div className="bg-[#131722] border border-[#242733] p-4 rounded flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 text-blue-400 rounded">
            <HardDrive size={24} />
          </div>
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total EOD Bars</span>
            <span className="text-2xl font-bold text-white font-mono">
              {(status?.database.total_records ?? 0).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="bg-[#131722] border border-[#242733] p-4 rounded flex items-center gap-4">
          <div className="p-3 bg-purple-500/10 text-purple-400 rounded">
            <Clock size={24} />
          </div>
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Latest Synced Bar</span>
            <span className="text-base font-bold text-white font-mono">
              {status?.database.latest_date || 'No Data'}
            </span>
          </div>
        </div>

        <div className="bg-[#131722] border border-[#242733] p-4 rounded flex items-center gap-4">
          <div className={`p-3 rounded ${status?.sync.is_running ? 'bg-yellow-500/10 text-yellow-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
            <Server size={24} />
          </div>
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Pipeline Status</span>
            <span className="text-sm font-bold text-white font-mono flex items-center gap-1.5 mt-0.5">
              {status?.sync.is_running ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-yellow-400 animate-ping"></span> Syncing...
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} className="text-emerald-400" /> Ready
                </>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Sync Log Terminal Window */}
      <div className="bg-[#131722] border border-[#242733] rounded overflow-hidden flex flex-col">
        <div className="bg-[#1c202d] px-4 py-2.5 border-b border-[#242733] flex items-center justify-between">
          <span className="text-xs font-bold text-gray-300 flex items-center gap-2 font-mono">
            <span className="w-2.5 h-2.5 rounded-full bg-[#26a69a]"></span> Live Ingestion Log Terminal
          </span>
          <span className="text-[10px] text-gray-500 font-mono">SQLite: {status?.database.path}</span>
        </div>

        <div className="p-4 bg-[#0b0e14] h-72 overflow-y-auto font-mono text-xs text-gray-300 space-y-1.5 scrollbar-thin">
          {logs.length === 0 ? (
            <div className="text-gray-600 italic">No sync activity logged yet. Click 'Start Market Data Sync' to ingest latest EOD pricing.</div>
          ) : (
            logs.map((line, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span className="text-[#26a69a] select-none">&gt;</span>
                <span className={line.includes('Error') || line.includes('error') ? 'text-red-400' : ''}>{line}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
