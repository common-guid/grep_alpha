/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cn } from '../lib/utils';
import { usePositions } from '../context/PositionsContext';
import { heldBadge } from '../lib/utils/positions';

/** "10 @ 185.20 · +2.65%" for a symbol held in the Alpaca paper account; nothing otherwise. */
export const HeldBadge: React.FC<{ symbol: string; size?: 'card' | 'modal' }> = ({ symbol, size = 'card' }) => {
  const { held, snapshot } = usePositions();
  const pos = held.get(symbol.toUpperCase());
  if (!pos) return null;
  const b = heldBadge(pos);
  return (
    <span
      data-testid="held-badge"
      title={`${b.title}${snapshot.stale ? ' · last known, Alpaca unreachable' : ''}`}
      className={cn(
        'font-mono rounded border shrink-0 cursor-help whitespace-nowrap',
        size === 'card' ? 'px-1 py-0.2 text-[9px]' : 'px-2 py-0.5 text-[11px]',
        b.tone === 'up' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40'
          : b.tone === 'down' ? 'bg-red-500/10 text-red-400 border-red-500/40'
          : 'bg-[#131722] text-gray-300 border-[#2a2e39]',
        snapshot.stale && 'opacity-70'
      )}
    >
      {size === 'card' ? (
        <>
          <span className="sm:hidden">{b.short}</span>
          <span className="hidden sm:inline">{b.text}</span>
        </>
      ) : b.text}
    </span>
  );
};
