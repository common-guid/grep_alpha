/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ChartCard } from './ChartCard';

interface ChartGridProps {
  symbols: string[];
  timeframe: string;
}

export const ChartGrid: React.FC<ChartGridProps> = ({ symbols, timeframe }) => {
  if (symbols.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 h-full">
        No tickers in this watchlist. Add some to get started.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1 p-1 bg-[#0b0e14]">
      {symbols.map((symbol) => (
        <ChartCard key={symbol} symbol={symbol} timeframe={timeframe} />
      ))}
    </div>
  );
};
