/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { X, Settings, Download, Share2, MousePointer2, Pencil, Type, Ruler, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useServices } from '../context/ServiceContext';
import { CandlestickData } from '../lib/charts/IChartAdapter';
import { cn } from '../lib/utils';
import { checkStaleness } from '../lib/utils/staleness';

interface ExpandedChartModalProps {
  symbol: string;
  timeframe: string;
  data: CandlestickData[];
  isOpen: boolean;
  onClose: () => void;
}

export const ExpandedChartModal: React.FC<ExpandedChartModalProps> = ({ 
  symbol, 
  timeframe: initialTimeframe, 
  data: initialData, 
  isOpen, 
  onClose 
}) => {
  const { chart, settings, api } = useServices();
  const containerRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<CandlestickData[]>(initialData);
  const [timeframe, setTimeframe] = useState(initialTimeframe);
  const [loading, setLoading] = useState(false);
  const [showVolume, setShowVolume] = useState(true);

  const latestCandle = data.length > 0 ? data[data.length - 1] : undefined;
  const staleness = checkStaleness(latestCandle?.time);

  const fetchFullData = async (newTf: string) => {
    setLoading(true);
    try {
      const result = await api.fetchStockData(symbol, newTf);
      setData(result);
    } catch (err) {
      console.error('Failed to fetch expanded data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (timeframe !== initialTimeframe) {
      fetchFullData(timeframe);
    }
  }, [timeframe]);

  useEffect(() => {
    if (isOpen && data.length > 0 && containerRef.current) {
      const cleanup = chart.render(containerRef.current, data, {
        theme: settings.theme as 'dark' | 'light',
        timeframe,
        showVolume,
      });
      return cleanup;
    }
  }, [isOpen, data, settings.theme, showVolume]);

  const timeframes = [
    { label: 'One Day', value: '1D' },
    { label: 'One Week', value: '1W' },
    { label: 'Three Month', value: '3M' },
    { label: 'Six Month', value: '6M' },
    { label: 'One Year', value: '1Y' }
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <motion.div 
        initial={{ scale: 0.98, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.98, opacity: 0 }}
        className="bg-[#131722] border border-[#242733] w-full h-full rounded-xl shadow-3xl overflow-hidden flex flex-col"
      >
        {/* Header toolbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-[#242733] bg-[#1c202d]">
          <div className="flex items-center gap-6">
             <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-white leading-none">{symbol}</h2>
                  {staleness.isStale && (
                    <span 
                        className="px-2 py-0.5 text-[9px] font-bold rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1 shrink-0 cursor-help"
                        title={`Market data last updated on ${staleness.lastDateStr} (${staleness.calendarDaysDiff} days ago).`}
                    >
                        <AlertTriangle size={11} className="text-amber-400" />
                        <span>Data Stale ({staleness.calendarDaysDiff}d)</span>
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-gray-500 font-mono mt-1 uppercase tracking-widest italic">Full Analysis Mode</span>
             </div>


             <div className="h-8 w-px bg-[#242733]" />

             <div className="flex items-center gap-1 bg-[#131722] rounded-lg p-1 border border-[#242733]">
                {timeframes.map(tf => (
                    <button
                        key={tf.value}
                        onClick={() => setTimeframe(tf.value)}
                        className={cn(
                            "px-3 py-1.5 text-xs font-bold rounded-md transition-all whitespace-nowrap",
                            timeframe === tf.value 
                                ? "bg-[#26a69a] text-white shadow-lg" 
                                : "text-gray-500 hover:text-gray-300 hover:bg-[#1c202d]"
                        )}
                    >
                        {tf.label}
                    </button>
                ))}
             </div>

             <div className="flex items-center gap-2 ml-4">
                <button 
                    onClick={() => setShowVolume(!showVolume)}
                    className={cn(
                        "p-2 rounded-lg border transition-all",
                        showVolume ? "bg-[#26a69a]/10 border-[#26a69a] text-[#26a69a]" : "bg-[#131722] border-[#242733] text-gray-500"
                    )}
                    title="Toggle Volume"
                >
                    <TrendingUp size={18} />
                </button>
             </div>
          </div>

          <div className="flex items-center gap-3">
             <div className="flex items-center gap-1 bg-[#131722] rounded-lg p-1 border border-[#242733] mr-4">
                <button className="p-2 text-gray-500 hover:text-white rounded-md hover:bg-[#1c202d]"><Settings size={18} /></button>
                <button className="p-2 text-gray-500 hover:text-white rounded-md hover:bg-[#1c202d]"><Download size={18} /></button>
                <button className="p-2 text-gray-500 hover:text-white rounded-md hover:bg-[#1c202d]"><Share2 size={18} /></button>
             </div>
             <button 
                onClick={onClose}
                className="p-3 text-gray-400 hover:text-white hover:bg-red-500/20 rounded-xl transition-all"
             >
                <X size={24} />
             </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Side drawing tools (static for UI impact) */}
          <div className="w-14 border-r border-[#242733] bg-[#1c202d] flex flex-col items-center py-4 gap-4">
             <button className="p-2 text-[#26a69a] bg-[#26a69a]/10 rounded-lg"><MousePointer2 size={18} /></button>
             <button className="p-2 text-gray-500 hover:text-white hover:bg-[#2a2e39] rounded-lg"><Pencil size={18} /></button>
             <button className="p-2 text-gray-500 hover:text-white hover:bg-[#2a2e39] rounded-lg"><Type size={18} /></button>
             <button className="p-2 text-gray-500 hover:text-white hover:bg-[#2a2e39] rounded-lg"><Ruler size={18} /></button>
             <div className="flex-1" />
          </div>

          <div className="flex-1 relative bg-[#131722]">
             {loading && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#131722]/50 backdrop-blur-sm">
                    <div className="w-12 h-12 border-4 border-[#26a69a] border-t-transparent rounded-full animate-spin"></div>
                </div>
             )}
             <div ref={containerRef} className="w-full h-full" />
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// Help sub-component for volume icon
const TrendingUp = ({ size }: { size: number }) => (
    <svg 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
    >
        <path d="M3 3v18h18" />
        <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
    </svg>
);
