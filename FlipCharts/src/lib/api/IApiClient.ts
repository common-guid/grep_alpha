/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CandlestickData } from '../charts/IChartAdapter';

export interface IApiClient {
  fetchStockData(symbol: string, timeframe: string): Promise<CandlestickData[]>;
}
