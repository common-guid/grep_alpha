/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IApiClient } from './IApiClient';
import { CandlestickData } from '../charts/IChartAdapter';

export class DatabaseApiClient implements IApiClient {
  private fallbackClient: IApiClient;

  constructor(fallbackClient: IApiClient) {
    this.fallbackClient = fallbackClient;
  }

  async fetchStockData(symbol: string, timeframe: string): Promise<CandlestickData[]> {
    try {
      const response = await fetch(`/api/prices?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`);
      if (!response.ok) {
        throw new Error(`Database API error: ${response.statusText}`);
      }

      const data = await response.json();
      if (data && Array.isArray(data) && data.length > 0) {
        return data;
      }
      console.log(`No database records for ${symbol}. Falling back.`);
    } catch (e) {
      console.warn(`Failed to fetch database records for ${symbol}. Falling back.`, e);
    }

    return this.fallbackClient.fetchStockData(symbol, timeframe);
  }
}
