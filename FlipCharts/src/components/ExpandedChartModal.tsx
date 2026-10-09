/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { X, Settings, Download, Share2, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { useServices } from '../context/ServiceContext';
import { CandlestickData } from '../lib/charts/IChartAdapter';
import { cn } from '../lib/utils';
import { checkStaleness } from '../lib/utils/staleness';
import { DrawingManager, DrawingTool } from '../lib/charts/primitives/DrawingManager';
import { DrawingToolbar } from './DrawingToolbar';

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
  const { chart, settings, api, getDrawings, saveDrawings } = useServices();
  const containerRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<CandlestickData[]>(initialData);
  const [timeframe, setTimeframe] = useState(initialTimeframe);
  const [loading, setLoading] = useState(false);
  const [showVolume, setShowVolume] = useState(true);

  const drawingManager = useMemo(() => new DrawingManager(), [symbol]);
  const [activeTool, setActiveTool] = useState<DrawingTool | null>(null);
  const [currentColor, setCurrentColor] = useState<string>('#58a6ff');

  const latestCandle = data.length > 0 ? data[data.length - 1] : undefined;
  const staleness = checkStaleness(latestCandle?.time);

  // Load stored drawings on mount
  useEffect(() => {
    if (isOpen) {
      getDrawings(symbol).then((stored) => {
        drawingManager.setDrawings(stored);
      });
    }
  }, [isOpen, symbol, getDrawings, drawingManager]);

  // Debounced auto-save on drawing change
  useEffect(() => {
    let timeout: any;
    const unsubscribe = drawingManager.subscribe((drawings) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        saveDrawings(symbol, drawings);
      }, 500);
    });
    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [symbol, saveDrawings, drawingManager]);

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
        drawingBridge: { manager: drawingManager },
      });
      return cleanup;
    }
  }, [isOpen, data, settings.theme, showVolume, drawingManager]);

  const timeframes = [
    { label: 'One Day', value: '1D' },
    { label: 'One Week', value: '1W' },
    { label: 'Three Month', value: '3M' },
    { label: 'Six Month', value: '6M' },
    { label: 'One Year', value: '1Y' }
  ];

  // Escape: first cancels an active drawing tool, otherwise closes the modal.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (activeTool !== null) {
        setActiveTool(null);
        drawingManager.setActiveTool(null);
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, activeTool, drawingManager, onClose]);

  // Backdrop click closes, but only if the press also started on the backdrop
  // (a drawing/pan drag that ends outside the chart must not close it).
  const backdropPressRef = useRef(false);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md max-md:p-0"
      role="dialog"
      aria-modal="true"
      aria-label={`${symbol} expanded chart`}
      onPointerDown={(e) => { backdropPressRef.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (e.target === e.currentTarget && backdropPressRef.current) onClose();
        backdropPressRef.current = false;
      }}
    >
      <motion.div 
        initial={{ scale: 0.98, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.98, opacity: 0 }}
        className="relative bg-[#131722] border border-[#242733] w-full h-full rounded-xl shadow-3xl overflow-hidden flex flex-col max-md:rounded-none max-md:border-0"
      >
        {/* Phones: always-visible close button pinned top-right */}
        <button
          type="button"
          onClick={onClose}
          className="md:hidden absolute top-1 right-1 z-20 h-11 w-11 flex items-center justify-center text-gray-300 hover:text-white bg-[#1c202d] hover:bg-red-500/20 rounded-lg"
          aria-label="Close expanded chart"
          title="Close"
        >
          <X size={24} />
        </button>
        {/* Header toolbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-[#242733] bg-[#1c202d] max-md:pl-3 max-md:pr-14 max-md:py-2">
          <div className="flex items-center gap-6 max-md:flex-1 max-md:flex-wrap max-md:gap-x-3 max-md:gap-y-2">
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
                <span className="text-[10px] text-gray-500 font-mono mt-1 uppercase tracking-widest italic max-md:hidden">Full Analysis Mode</span>
             </div>


             <div className="h-8 w-px bg-[#242733] max-md:hidden" />

             <div className="flex items-center gap-1 bg-[#131722] rounded-lg p-1 border border-[#242733] max-md:order-last max-md:w-full max-md:grid max-md:grid-cols-5">
                {timeframes.map(tf => (
                    <button
                        key={tf.value}
                        onClick={() => setTimeframe(tf.value)}
                        className={cn(
                            "px-3 py-1.5 text-xs font-bold rounded-md transition-all whitespace-nowrap max-md:h-11 max-md:px-1",
                            timeframe === tf.value 
                                ? "bg-[#26a69a] text-white shadow-lg" 
                                : "text-gray-500 hover:text-gray-300 hover:bg-[#1c202d]"
                        )}
                    >
                        <span className="md:hidden">{tf.value}</span>
                        <span className="max-md:hidden">{tf.label}</span>
                    </button>
                ))}
             </div>

             <div className="flex items-center gap-2 ml-4 max-md:ml-auto">
                <button 
                    onClick={() => setShowVolume(!showVolume)}
                    className={cn(
                        "p-2 rounded-lg border transition-all max-md:h-11 max-md:w-11 max-md:flex max-md:items-center max-md:justify-center",
                        showVolume ? "bg-[#26a69a]/10 border-[#26a69a] text-[#26a69a]" : "bg-[#131722] border-[#242733] text-gray-500"
                    )}
                    title="Toggle Volume"
                >
                    <TrendingUp size={18} />
                </button>
             </div>
          </div>

          <div className="flex items-center gap-3 max-md:hidden">
             <div className="flex items-center gap-1 bg-[#131722] rounded-lg p-1 border border-[#242733] mr-4">
                <button className="p-2 text-gray-500 hover:text-white rounded-md hover:bg-[#1c202d]"><Settings size={18} /></button>
                <button className="p-2 text-gray-500 hover:text-white rounded-md hover:bg-[#1c202d]"><Download size={18} /></button>
                <button className="p-2 text-gray-500 hover:text-white rounded-md hover:bg-[#1c202d]"><Share2 size={18} /></button>
             </div>
             <button 
                onClick={onClose}
                className="p-3 text-gray-400 hover:text-white hover:bg-red-500/20 rounded-xl transition-all"
                aria-label="Close expanded chart"
             >
                <X size={24} />
             </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Drawing tools toolbar */}
          <DrawingToolbar
            activeTool={activeTool}
            currentColor={currentColor}
            onSelectTool={(tool) => {
              setActiveTool(tool);
              drawingManager.setActiveTool(tool);
            }}
            onChangeColor={(color) => {
              setCurrentColor(color);
              drawingManager.currentColor = color;
            }}
            onRemoveLast={() => drawingManager.removeLastDrawing()}
            onClearAll={() => drawingManager.clearAll()}
          />

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
