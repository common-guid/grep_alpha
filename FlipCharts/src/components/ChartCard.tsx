/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { useServices } from '../context/ServiceContext';
import { CandlestickData } from '../lib/charts/IChartAdapter';
import { Maximize2, RefreshCw, AlertCircle, Info, FileText, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { checkStaleness } from '../lib/utils/staleness';
import { TickerInfoModal } from './TickerInfoModal';
import { NotesModal } from './NotesModal';
import { ExpandedChartModal } from './ExpandedChartModal';

interface ChartCardProps {
  symbol: string;
  timeframe: string;
}

export const ChartCard: React.FC<ChartCardProps> = ({ symbol, timeframe }) => {
  const { api, chart, settings, watchlistItems } = useServices();
  const itemDetails = watchlistItems.find(item => item.symbol.toUpperCase() === symbol.toUpperCase());
  const containerRef = useRef<HTMLDivElement>(null);
  const { ref: inViewRef, inView } = useInView({
    triggerOnce: false,
    threshold: 0.1,
  });

  const [data, setData] = useState<CandlestickData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [isExpandedOpen, setIsExpandedOpen] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.fetchStockData(symbol, timeframe);
      setData(result);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (inView) {
      fetchData();
    }
  }, [inView, symbol, timeframe]);

  useEffect(() => {
    if (inView && data.length > 0 && containerRef.current) {
      const cleanup = chart.render(containerRef.current, data, {
        theme: settings.theme as 'dark' | 'light',
        timeframe,
        showVolume: true,
      });
      return cleanup;
    }
  }, [inView, data, settings.theme]);

  const latestCandle = data.length > 0 ? data[data.length - 1] : undefined;
  const staleness = checkStaleness(latestCandle?.time);
  const latestPrice = latestCandle ? latestCandle.close : null;
  const prevPrice = data.length > 1 ? data[data.length - 2].close : null;
  const change = latestPrice && prevPrice ? latestPrice - prevPrice : 0;
  const changePct = prevPrice ? (change / prevPrice) * 100 : 0;

  return (
    <div 
      ref={inViewRef}
      className="relative bg-[#131722] border border-[#242733] rounded-sm overflow-hidden h-[300px] flex flex-col group"
      id={`chart-${symbol}`}
    >
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1c202d] border-b border-[#242733]">
        <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="font-bold text-white text-sm truncate shrink-0">{symbol}</span>
                {latestPrice && (
                    <span className="text-xs text-yellow-400 font-mono shrink-0">
                        {latestPrice.toFixed(2)}
                    </span>
                )}
                {itemDetails?.status && (
                    <span className={cn(
                        "px-1 py-0.2 text-[8px] font-bold uppercase rounded border tracking-wider shrink-0",
                        itemDetails.status === 'core_holding' 
                          ? "bg-[#26a69a]/10 text-[#26a69a] border-[#26a69a]/30"
                          : itemDetails.status === 'watching'
                          ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                          : "bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
                    )}>
                        {itemDetails.status.replace('_', ' ')}
                    </span>
                )}
                {staleness.isStale && (
                    <span 
                        className="px-1.5 py-0.2 text-[8px] font-bold rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1 shrink-0 cursor-help"
                        title={`Market data last updated on ${staleness.lastDateStr} (${staleness.calendarDaysDiff} calendar days / ${staleness.tradingDaysMissing} trading days ago). Sync required.`}
                    >
                        <AlertTriangle size={10} className="text-amber-400 shrink-0" />
                        <span>Stale ({staleness.calendarDaysDiff}d)</span>
                    </span>
                )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                {latestPrice && (
                    <span className={cn(
                        "text-[10px] font-medium font-mono shrink-0",
                        change >= 0 ? "text-[#26a69a]" : "text-[#ef5350]"
                    )}>
                        {change >= 0 ? '+' : ''}{change.toFixed(2)} ({changePct.toFixed(2)}%)
                    </span>
                )}
                {data.length > 0 && (data[data.length - 1] as any).atr14 && (
                    <span className="text-[9px] text-amber-400 font-mono bg-[#131722] px-1 py-0.2 rounded border border-[#242733] shrink-0" title="14-day Average True Range">
                        ATR: ${(data[data.length - 1] as any).atr14.toFixed(2)} ({(((data[data.length - 1] as any).atr14 / latestPrice!) * 100).toFixed(1)}%)
                    </span>
                )}
                {itemDetails?.target_entry !== null && itemDetails?.target_entry !== undefined && (
                    <span className="text-[9px] text-gray-400 font-mono bg-[#131722] px-1 py-0.2 rounded border border-[#242733] shrink-0">
                        Tgt: ${itemDetails.target_entry.toFixed(2)}
                    </span>
                )}
            </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
                onClick={() => setIsNotesOpen(true)}
                className="p-1 hover:bg-[#2a2e39] rounded-sm text-gray-400"
                title="Notes"
            >
                <FileText size={14} />
            </button>
            <button 
                onClick={() => setIsInfoOpen(true)}
                className="p-1 hover:bg-[#2a2e39] rounded-sm text-gray-400"
                title="Ticker Info"
            >
                <Info size={14} />
            </button>
            <button 
                onClick={fetchData}
                className="p-1 hover:bg-[#2a2e39] rounded-sm text-gray-400"
                title="Refresh"
            >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button 
                onClick={() => setIsExpandedOpen(true)}
                className="p-1 hover:bg-[#2a2e39] rounded-sm text-gray-400"
                title="Expand Chart"
            >
                <Maximize2 size={14} />
            </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        {!inView && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-600 italic text-xs">
                Waiting for viewport...
            </div>
        )}
        
        {inView && loading && (
             <div className="absolute inset-0 flex items-center justify-center bg-[#131722] z-10">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
             </div>
        )}

        {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#131722] p-4 text-center z-10">
                <AlertCircle size={24} className="text-red-500 mb-2" />
                <p className="text-xs text-gray-400">{error}</p>
                <button 
                    onClick={fetchData}
                    className="mt-3 px-3 py-1 bg-[#26a69a] text-white text-[10px] rounded-sm hover:bg-[#2bbbad]"
                >
                    Retry
                </button>
            </div>
        )}

        <div ref={containerRef} className="w-full h-full" />
      </div>

      <AnimatePresence>
        {isInfoOpen && (
          <TickerInfoModal 
            symbol={symbol} 
            data={data}
            isOpen={isInfoOpen} 
            onClose={() => setIsInfoOpen(false)} 
          />
        )}
        {isNotesOpen && (
          <NotesModal 
            symbol={symbol} 
            isOpen={isNotesOpen} 
            onClose={() => setIsNotesOpen(false)} 
          />
        )}
        {isExpandedOpen && (
          <ExpandedChartModal
            symbol={symbol}
            timeframe={timeframe}
            data={data}
            isOpen={isExpandedOpen}
            onClose={() => setIsExpandedOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
