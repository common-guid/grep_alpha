/**
 * DrawingToolbar component for ExpandedChartModal
 * Renders tool buttons (trendline, ray, hline, vline, rect, measure), color swatches, eraser, clear-all.
 */

import React from 'react';
import {
  MousePointer2,
  TrendingUp,
  MoveUpRight,
  Minus,
  GripVertical,
  Square,
  Ruler,
  Eraser,
  Trash2,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { DrawingTool } from '../lib/charts/primitives/DrawingManager';

export interface DrawingToolbarProps {
  activeTool: DrawingTool | null;
  currentColor: string;
  onSelectTool: (tool: DrawingTool | null) => void;
  onChangeColor: (color: string) => void;
  onRemoveLast: () => void;
  onClearAll: () => void;
}

const PRESET_COLORS = ['#58a6ff', '#26a69a', '#ef5350', '#ffc107'];

export const DrawingToolbar: React.FC<DrawingToolbarProps> = ({
  activeTool,
  currentColor,
  onSelectTool,
  onChangeColor,
  onRemoveLast,
  onClearAll,
}) => {
  const tools: { id: DrawingTool; label: string; icon: React.ReactNode }[] = [
    { id: 'trendline', label: 'Trendline', icon: <TrendingUp size={18} /> },
    { id: 'ray', label: 'Ray', icon: <MoveUpRight size={18} /> },
    { id: 'hline', label: 'Horizontal Line', icon: <Minus size={18} /> },
    { id: 'vline', label: 'Vertical Line', icon: <GripVertical size={18} /> },
    { id: 'rect', label: 'Rectangle', icon: <Square size={18} /> },
    { id: 'measure', label: 'Measure', icon: <Ruler size={18} /> },
  ];

  return (
    <div className="w-14 border-r border-[#242733] bg-[#1c202d] flex flex-col items-center py-4 gap-3 shrink-0">
      {/* Pointer / Pan tool */}
      <button
        onClick={() => onSelectTool(null)}
        className={cn(
          'p-2 rounded-lg transition-all',
          activeTool === null
            ? 'text-[#26a69a] bg-[#26a69a]/10 border border-[#26a69a]/40'
            : 'text-gray-500 hover:text-white hover:bg-[#2a2e39]'
        )}
        title="Pointer (Pan & Select)"
      >
        <MousePointer2 size={18} />
      </button>

      <div className="w-8 h-px bg-[#242733] my-1" />

      {/* Drawing tools */}
      {tools.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelectTool(t.id)}
          className={cn(
            'p-2 rounded-lg transition-all',
            activeTool === t.id
              ? 'text-[#26a69a] bg-[#26a69a]/10 border border-[#26a69a]/40 shadow-sm'
              : 'text-gray-500 hover:text-white hover:bg-[#2a2e39]'
          )}
          title={t.label}
        >
          {t.icon}
        </button>
      ))}

      <div className="w-8 h-px bg-[#242733] my-1" />

      {/* Color swatches */}
      <div className="flex flex-col gap-1.5 items-center">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onChangeColor(c)}
            style={{ backgroundColor: c }}
            className={cn(
              'w-4 h-4 rounded-full transition-transform',
              currentColor === c ? 'scale-125 ring-2 ring-white/50' : 'opacity-70 hover:opacity-100'
            )}
            title={`Color ${c}`}
          />
        ))}
      </div>

      <div className="flex-1" />

      {/* Edit actions: Eraser & Clear All */}
      <button
        onClick={onRemoveLast}
        className="p-2 text-gray-500 hover:text-amber-400 hover:bg-[#2a2e39] rounded-lg transition-all"
        title="Remove Last Drawing"
      >
        <Eraser size={18} />
      </button>

      <button
        onClick={onClearAll}
        className="p-2 text-gray-500 hover:text-red-400 hover:bg-[#2a2e39] rounded-lg transition-all"
        title="Clear All Drawings"
      >
        <Trash2 size={18} />
      </button>
    </div>
  );
};
