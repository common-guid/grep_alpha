/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useServices } from '../context/ServiceContext';
import { CandlestickData } from '../lib/charts/IChartAdapter';
import { cn } from '../lib/utils';
import { ArrowUpRight, ArrowDownRight, TrendingUp } from 'lucide-react';

interface WatchlistStatsProps {
  symbols: string[];
}

interface PerformanceAverages {
  avg1w: number | null;
  avg1m: number | null;
  avg3m: number | null;
}

export const WatchlistStats: React.FC<WatchlistStatsProps> = ({ symbols }) => {
  const { api } = useServices();
  const [stats, setStats] = useState<PerformanceAverages>({ avg1w: null, avg1m: null, avg3m: null });
  const [loading, setLoading] = useState(false);

  const getTimeAsSeconds = (time: string | number): number => {
    if (typeof time === 'number') {
      return time;
    }
    const parsed = new Date(time).getTime() / 1000;
    return isNaN(parsed) ? 0 : parsed;
  };

  const findPriceAgo = (candles: CandlestickData[], secondsAgo: number): number | null => {
    if (candles.length === 0) return null;
    const latestTime = getTimeAsSeconds(candles[candles.length - 1].time);
    const targetTime = latestTime - secondsAgo;

    let closestCandle = candles[0];
    let minDiff = Math.abs(getTimeAsSeconds(candles[0].time) - targetTime);

    for (const candle of candles) {
      const diff = Math.abs(getTimeAsSeconds(candle.time) - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestCandle = candle;
      }
    }

    // Require that the matching candle is reasonably close to the target window
    const maxTolerableDiff = 5 * 86400;
    if (minDiff > maxTolerableDiff && candles.length < 15) {
      return null;
    }

    return closestCandle.close;
  };

  useEffect(() => {
    let active = true;
    if (symbols.length === 0) {
      setStats({ avg1w: null, avg1m: null, avg3m: null });
      return;
    }

    const calculateAverages = async () => {
      setLoading(true);
      try {
        const performances1w: number[] = [];
        const performances1m: number[] = [];
        const performances3m: number[] = [];

        // Fetch 3M timeframe as daily data for all symbols in parallel to get history
        const allData = await Promise.all(
          symbols.map(async (symbol) => {
            try {
              const res = await api.fetchStockData(symbol, '3M');
              return { symbol, candles: res };
            } catch (err) {
              console.warn(`Failed to fetch stats for ${symbol}`, err);
              return { symbol, candles: [] as CandlestickData[] };
            }
          })
        );

        if (!active) return;

        for (const item of allData) {
          const candles = item.candles;
          if (candles.length < 2) continue;

          const pLatest = candles[candles.length - 1].close;

          // 1 week = 7 days
          const p1w = findPriceAgo(candles, 7 * 86400);
          if (p1w && p1w > 0) {
            performances1w.push(((pLatest - p1w) / p1w) * 100);
          }

          // 1 month = 30 days
          const p1m = findPriceAgo(candles, 30 * 86400);
          if (p1m && p1m > 0) {
            performances1m.push(((pLatest - p1m) / p1m) * 100);
          }

          // 3 months = 90 days
          const p3m = findPriceAgo(candles, 90 * 86400);
          if (p3m && p3m > 0) {
            performances3m.push(((pLatest - p3m) / p3m) * 100);
          }
        }

        const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

        setStats({
          avg1w: avg(performances1w),
          avg1m: avg(performances1m),
          avg3m: avg(performances3m),
        });
      } catch (err) {
        console.error('Error calculating watchlist averages', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    calculateAverages();

    return () => {
      active = false;
    };
  }, [symbols.join(','), api]);

  const renderBadge = (label: string, value: number | null) => {
    if (value === null) {
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#1c202d] border border-[#242733] rounded-md text-[10px] text-gray-500 font-mono">
          <span>{label}:</span>
          <span className="animate-pulse">--</span>
        </div>
      );
    }

    const isPositive = value >= 0;

    return (
      <div className={cn(
        "flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono border transition-colors",
        isPositive 
          ? "bg-[#26a69a]/5 border-[#26a69a]/20 text-[#26a69a]" 
          : "bg-[#ef5350]/5 border-[#ef5350]/20 text-[#ef5350]"
      )}>
        <span className="text-gray-400 font-sans font-semibold mr-0.5">{label}:</span>
        <span className="font-bold">
          {isPositive ? '+' : ''}{value.toFixed(2)}%
        </span>
        {isPositive ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
      </div>
    );
  };

  return (
    <div className="flex items-center gap-2 select-none">
      {loading && (
        <div className="w-3 h-3 border border-t-transparent border-[#26a69a] rounded-full animate-spin shrink-0" />
      )}
      <div className="flex items-center gap-2">
        {renderBadge("1W Avg", stats.avg1w)}
        {renderBadge("1M Avg", stats.avg1m)}
        {renderBadge("3M Avg", stats.avg3m)}
      </div>
    </div>
  );
};
