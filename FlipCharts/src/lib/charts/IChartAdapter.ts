/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CandlestickData {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

import { DrawingManager } from './primitives/DrawingManager';

export interface ChartOptions {
  theme: 'dark' | 'light';
  timeframe: string;
  showVolume: boolean;
  drawingBridge?: { manager: DrawingManager };
  onVisibleRangeChange?: (range: { from: number; to: number }) => void;
  /**
   * Touch devices, grid cards only: let vertical/horizontal swipes that start
   * on the chart scroll the page (no touch drag-pan, no pinch-zoom). Mouse
   * behaviour is unaffected. The expanded chart keeps full touch pan/zoom.
   */
  scrollFriendlyTouch?: boolean;
}

export interface IChartAdapter {
  render(container: HTMLElement, data: CandlestickData[], options: ChartOptions): () => void;
}
