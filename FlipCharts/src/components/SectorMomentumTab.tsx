import React, { useState, useEffect } from 'react';
import { TrendingUp, RefreshCw, Layers, Calendar, Info } from 'lucide-react';

interface SectorMomentumTabProps {
  activeWatchlistId: string;
  watchlists: Array<{ id: string; name: string }>;
  onSelectWatchlist: (id: string) => void;
}

interface IndexData {
  date: string[];
  price_weighted: number[];
  equal_weighted: number[];
}

export const SectorMomentumTab: React.FC<SectorMomentumTabProps> = ({
  activeWatchlistId,
  watchlists,
  onSelectWatchlist,
}) => {
  const [timeframe, setTimeframe] = useState<'3m' | '1y'>('3m');
  const [data, setData] = useState<IndexData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchIndices = async () => {
    if (!activeWatchlistId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/sector-momentum?category=${encodeURIComponent(activeWatchlistId)}&timeframe=${timeframe}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch sector index data (${res.statusText})`);
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Error calculating sector momentum');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIndices();
  }, [activeWatchlistId, timeframe]);

  // Derived stats
  const latestPriceW = data?.price_weighted && data.price_weighted.length > 0 ? data.price_weighted[data.price_weighted.length - 1] : 100;
  const latestEqualW = data?.equal_weighted && data.equal_weighted.length > 0 ? data.equal_weighted[data.equal_weighted.length - 1] : 100;
  const priceWChange = latestPriceW - 100;
  const equalWChange = latestEqualW - 100;

  // Render SVG Chart for Base 100 lines
  const renderSvgChart = () => {
    if (!data || !data.date || data.date.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
          <Layers size={40} className="mb-2 opacity-30" />
          <p>No pricing data available in SQLite database for this watchlist.</p>
          <p className="text-xs text-gray-600 mt-1">Run a Market Data Sync in the Sync tab first.</p>
        </div>
      );
    }

    const width = 800;
    const height = 320;
    const padding = { top: 20, right: 30, bottom: 40, left: 50 };

    const allValues = [...data.price_weighted, ...data.equal_weighted, 100];
    const minVal = Math.min(...allValues) - 2;
    const maxVal = Math.max(...allValues) + 2;

    const xScale = (index: number) => 
      padding.left + (index / (data.date.length - 1 || 1)) * (width - padding.left - padding.right);
    
    const yScale = (val: number) => 
      height - padding.bottom - ((val - minVal) / (maxVal - minVal || 1)) * (height - padding.top - padding.bottom);

    const priceWPoints = data.price_weighted
      .map((val, idx) => `${xScale(idx)},${yScale(val)}`)
      .join(' ');

    const equalWPoints = data.equal_weighted
      .map((val, idx) => `${xScale(idx)},${yScale(val)}`)
      .join(' ');

    const baselineY = yScale(100);

    // Date Ticks (5 evenly spaced)
    const tickIndices = [
      0,
      Math.floor(data.date.length * 0.25),
      Math.floor(data.date.length * 0.5),
      Math.floor(data.date.length * 0.75),
      data.date.length - 1,
    ].filter((idx, i, self) => self.indexOf(idx) === i);

    return (
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[360px] bg-[#131722] rounded border border-[#242733] font-mono text-[10px]">
          {/* Grid lines */}
          {[minVal, 100, maxVal].map((val, i) => (
            <g key={i}>
              <line 
                x1={padding.left} 
                y1={yScale(val)} 
                x2={width - padding.right} 
                y2={yScale(val)} 
                stroke={val === 100 ? '#444c5e' : '#242733'} 
                strokeDasharray={val === 100 ? '4 4' : 'none'} 
              />
              <text x={padding.left - 8} y={yScale(val) + 3} fill={val === 100 ? '#26a69a' : '#888'} textAnchor="end">
                {val.toFixed(1)}
              </text>
            </g>
          ))}

          {/* Baseline 100 Marker */}
          <text x={width - padding.right + 5} y={baselineY + 3} fill="#888" textAnchor="start">
            100
          </text>

          {/* Date Ticks */}
          {tickIndices.map(idx => (
            <g key={idx}>
              <text x={xScale(idx)} y={height - 12} fill="#666" textAnchor="middle">
                {data.date[idx]}
              </text>
            </g>
          ))}

          {/* Price-Weighted Line (Green) */}
          <polyline
            fill="none"
            stroke="#26a69a"
            strokeWidth="2.5"
            points={priceWPoints}
          />

          {/* Equal-Weighted Line (Blue) */}
          <polyline
            fill="none"
            stroke="#2962ff"
            strokeWidth="2.5"
            points={equalWPoints}
          />
        </svg>
      </div>
    );
  };

  return (
    <div className="flex-1 p-6 bg-[#0b0e14] overflow-y-auto space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-[#242733] pb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="text-[#26a69a]" size={24} />
            Sector Momentum Analysis (Base 100)
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Normalizes component prices to 100 at start of period to visualize macro group strength.
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Watchlist Select */}
          <select
            value={activeWatchlistId}
            onChange={(e) => onSelectWatchlist(e.target.value)}
            className="bg-[#1c202d] border border-[#242733] text-white text-xs rounded px-3 py-1.5 focus:outline-none focus:border-[#26a69a]"
          >
            {watchlists.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>

          {/* Timeframe Toggle */}
          <div className="flex items-center bg-[#1c202d] border border-[#242733] rounded p-0.5">
            <button
              onClick={() => setTimeframe('3m')}
              className={`px-3 py-1 text-xs font-bold rounded transition-colors ${
                timeframe === '3m' ? 'bg-[#26a69a] text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              3 Months
            </button>
            <button
              onClick={() => setTimeframe('1y')}
              className={`px-3 py-1 text-xs font-bold rounded transition-colors ${
                timeframe === '1y' ? 'bg-[#26a69a] text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              1 Year
            </button>
          </div>

          <button
            onClick={fetchIndices}
            className="p-2 text-gray-400 hover:text-white bg-[#1c202d] border border-[#242733] rounded hover:bg-[#242733]"
            title="Refresh Index"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Summary KPI Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#131722] border border-[#242733] p-4 rounded flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">
              Price-Weighted Index (Dow Style)
            </span>
            <div className="text-2xl font-bold text-white font-mono">
              {latestPriceW.toFixed(2)}
              <span className={`text-sm font-normal ml-3 font-mono ${priceWChange >= 0 ? 'text-[#26a69a]' : 'text-[#ef5350]'}`}>
                {priceWChange >= 0 ? '+' : ''}{priceWChange.toFixed(2)}%
              </span>
            </div>
            <p className="text-[10px] text-gray-500 mt-1">Higher-priced stocks exert greater influence on overall curve.</p>
          </div>
          <div className="w-3 h-12 bg-[#26a69a] rounded-full" />
        </div>

        <div className="bg-[#131722] border border-[#242733] p-4 rounded flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">
              Equal-Weighted Index (Average Stock)
            </span>
            <div className="text-2xl font-bold text-white font-mono">
              {latestEqualW.toFixed(2)}
              <span className={`text-sm font-normal ml-3 font-mono ${equalWChange >= 0 ? 'text-[#2962ff]' : 'text-[#ef5350]'}`}>
                {equalWChange >= 0 ? '+' : ''}{equalWChange.toFixed(2)}%
              </span>
            </div>
            <p className="text-[10px] text-gray-500 mt-1">Normalizes each stock to 100 on Day 1 to measure true breadth.</p>
          </div>
          <div className="w-3 h-12 bg-[#2962ff] rounded-full" />
        </div>
      </div>

      {/* Main Index Chart */}
      <div className="bg-[#131722] border border-[#242733] p-5 rounded space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            Base 100 Sector Momentum Curves
          </h3>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-[#26a69a]">
              <span className="w-3 h-1 bg-[#26a69a] rounded-full"></span> Price-Weighted
            </span>
            <span className="flex items-center gap-1.5 text-[#2962ff]">
              <span className="w-3 h-1 bg-[#2962ff] rounded-full"></span> Equal-Weighted
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400">
            <RefreshCw className="animate-spin mr-2" size={20} />
            Calculating Base 100 Sector Indices...
          </div>
        ) : error ? (
          <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded">
            {error}
          </div>
        ) : (
          renderSvgChart()
        )}
      </div>

      {/* Info Explanation Card */}
      <div className="bg-[#1c202d] border border-[#242733] p-4 rounded text-xs text-gray-400 flex items-start gap-3">
        <Info className="text-blue-400 shrink-0 mt-0.5" size={16} />
        <div>
          <span className="font-bold text-white block mb-1">How Sector Momentum is Calculated</span>
          <p>
            Both index lines rebase all constituent stocks of the selected watchlist to <strong>100.0</strong> at the start date. 
            If the Equal-Weighted line (blue) outperforms the Price-Weighted line (green), momentum is broadly distributed across mid/small caps rather than dominated by a single high-priced outlier.
          </p>
        </div>
      </div>
    </div>
  );
};
