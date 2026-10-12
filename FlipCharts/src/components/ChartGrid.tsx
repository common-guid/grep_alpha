/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ChartCard } from './ChartCard';

interface ChartGridProps {
  symbols: string[];
  timeframe: string;
  /** Shown instead of the default text when `symbols` is empty (e.g. a date filter matched nothing). */
  emptyMessage?: React.ReactNode;
}

export const ChartGrid: React.FC<ChartGridProps> = ({ symbols, timeframe, emptyMessage }) => {
  if (symbols.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 h-full">
        {emptyMessage ?? 'No tickers in this watchlist. Add some to get started.'}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1 p-1 bg-[#0b0e14]">
      {/* key={symbol}: re-sorting reorders existing cards; charts are not re-created. */}
      {symbols.map((symbol) => (
        <ChartCard key={symbol} symbol={symbol} timeframe={timeframe} />
      ))}
    </div>
  );
};
