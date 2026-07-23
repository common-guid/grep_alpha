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

export interface ChartOptions {
  theme: 'dark' | 'light';
  timeframe: string;
  showVolume: boolean;
  onVisibleRangeChange?: (range: { from: number; to: number }) => void;
}

export interface IChartAdapter {
  render(container: HTMLElement, data: CandlestickData[], options: ChartOptions): () => void;
}
