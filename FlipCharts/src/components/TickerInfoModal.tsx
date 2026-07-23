/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, Info, Globe, Building2, TrendingUp, Users, Activity, BarChart3 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CandlestickData } from '../lib/charts/IChartAdapter';
import { useServices } from '../context/ServiceContext';

interface TickerInfoModalProps {
  symbol: string;
  data: CandlestickData[];
  isOpen: boolean;
  onClose: () => void;
}

export const TickerInfoModal: React.FC<TickerInfoModalProps> = ({ symbol, data, isOpen, onClose }) => {
  const { watchlistItems } = useServices();
  const itemDetails = watchlistItems.find(item => item.symbol.toUpperCase() === symbol.toUpperCase());

  const calculateATR = (candles: CandlestickData[], period: number = 14) => {
    if (candles.length < period + 1) return null;
    
    const trueRanges = [];
    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
    }
    
    const relevantTRs = trueRanges.slice(-period);
    const sum = relevantTRs.reduce((a, b) => a + b, 0);
    return sum / relevantTRs.length;
  };

  const atr = calculateATR(data);
  const latestCandle = data.length > 0 ? data[data.length - 1] : null;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-[#1c202d] border border-[#242733] w-full max-w-2xl rounded-lg shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b border-[#242733] bg-[#131722]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#26a69a]/10 rounded-lg text-[#26a69a]">
              <Info size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">{symbol} Information</h2>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">Market Data Insight</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-gray-400 hover:text-white hover:bg-[#2a2e39] rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-8 space-y-8">
          {/* Market Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-[#131722] border border-[#242733] rounded-xl flex flex-col gap-1">
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Avg True Range (14)</span>
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-[#26a69a]" />
                <span className="text-lg font-mono text-white">{atr ? atr.toFixed(2) : '--'}</span>
              </div>
            </div>
            <div className="p-4 bg-[#131722] border border-[#242733] rounded-xl flex flex-col gap-1">
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Day High</span>
              <div className="flex items-center gap-2">
                <TrendingUp size={14} className="text-[#26a69a]" />
                <span className="text-lg font-mono text-white">{latestCandle ? latestCandle.high.toFixed(2) : '--'}</span>
              </div>
            </div>
            <div className="p-4 bg-[#131722] border border-[#242733] rounded-xl flex flex-col gap-1">
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Day Low</span>
              <div className="flex items-center gap-2">
                <TrendingUp size={14} className="text-[#ef5350] rotate-180" />
                <span className="text-lg font-mono text-white">{latestCandle ? latestCandle.low.toFixed(2) : '--'}</span>
              </div>
            </div>
            <div className="p-4 bg-[#131722] border border-[#242733] rounded-xl flex flex-col gap-1">
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Volume</span>
              <div className="flex items-center gap-2">
                <BarChart3 size={14} className="text-blue-400" />
                <span className="text-lg font-mono text-white">{latestCandle?.volume ? (latestCandle.volume > 1000000 ? (latestCandle.volume / 1000000).toFixed(1) + 'M' : latestCandle.volume.toLocaleString()) : '--'}</span>
              </div>
            </div>
          </div>

          {itemDetails && (
            <div className="p-5 bg-[#131722]/60 border border-[#242733] rounded-xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#242733] pb-3">
                <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Watchlist Profile</h3>
                <div className="flex items-center gap-2">
                  {itemDetails.status && (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                      itemDetails.status === 'core_holding' 
                        ? 'bg-[#26a69a]/10 text-[#26a69a] border-[#26a69a]/30'
                        : itemDetails.status === 'watching'
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                        : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
                    }`}>
                      {itemDetails.status.replace('_', ' ')}
                    </span>
                  )}
                  {itemDetails.target_entry !== null && (
                    <span className="text-[10px] text-gray-300 font-mono bg-[#1c202d] px-2 py-0.5 rounded border border-[#242733]">
                      Target: ${itemDetails.target_entry.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>

              {itemDetails.thesis && (
                <div className="space-y-1">
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Investment Thesis</h4>
                  <p className="text-sm text-gray-300 leading-relaxed font-sans italic">
                    "{itemDetails.thesis}"
                  </p>
                </div>
              )}

              {itemDetails.tags && itemDetails.tags.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Associated Tags</h4>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {itemDetails.tags.map(tag => (
                      <span key={tag} className="text-[10px] text-gray-400 bg-[#1c202d] px-2 py-0.5 rounded-full border border-[#242733]">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
               <div className="flex items-start gap-3">
                  <div className="mt-1 p-1.5 bg-[#2a2e39] rounded text-gray-400">
                    <Building2 size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">Company Overview</h3>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      Detailed company profile, business model, and sector information will be displayed here soon.
                    </p>
                  </div>
               </div>

               <div className="flex items-start gap-3">
                  <div className="mt-1 p-1.5 bg-[#2a2e39] rounded text-gray-400">
                    <Globe size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">Headquarters</h3>
                    <p className="text-sm text-gray-400">Information coming soon.</p>
                  </div>
               </div>
            </div>

            <div className="space-y-4">
               <div className="flex items-start gap-3">
                  <div className="mt-1 p-1.5 bg-[#2a2e39] rounded text-gray-400">
                    <TrendingUp size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">Financial Health</h3>
                    <p className="text-sm text-gray-400">Quarterly earnings highlights and key financial ratios will be listed here.</p>
                  </div>
               </div>

               <div className="flex items-start gap-3">
                  <div className="mt-1 p-1.5 bg-[#2a2e39] rounded text-gray-400">
                    <Users size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">Key Personnel</h3>
                    <p className="text-sm text-gray-400">Management team and board member details.</p>
                  </div>
               </div>
            </div>
          </div>

          <div className="p-4 bg-[#26a69a]/5 border border-[#26a69a]/20 rounded-xl">
             <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#26a69a] animate-pulse" />
                <h4 className="text-[10px] font-bold text-[#26a69a] uppercase tracking-widest">Next Phase</h4>
             </div>
             <p className="text-xs text-gray-400">
                Integration with Alpha Vantage company fundamental APIs is planned for the next major release to provide live data updates for this dashboard.
             </p>
          </div>
        </div>

        <div className="px-6 py-4 bg-[#131722] border-t border-[#242733] flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-[#2a2e39] text-gray-200 text-sm font-bold rounded-lg hover:bg-[#343a46] transition-colors shadow-lg"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
};
