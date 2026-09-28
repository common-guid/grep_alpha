/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IApiClient } from './IApiClient';
import { CandlestickData } from '../charts/IChartAdapter';

export class DatabaseApiClient implements IApiClient {
  private fallbackClient?: IApiClient;

  constructor(fallbackClient?: IApiClient) {
    this.fallbackClient = fallbackClient;
  }

  async fetchStockData(symbol: string, timeframe: string): Promise<CandlestickData[]> {
    try {
      const response = await fetch(`/api/prices?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`);
      if (!response.ok) {
        throw new Error(`Market data service error (${response.status})`);
      }

      const data = await response.json();
      if (data && Array.isArray(data)) {
        return data;
      }
      return [];
    } catch (e: any) {
      if (this.fallbackClient) {
        try {
          return await this.fallbackClient.fetchStockData(symbol, timeframe);
        } catch {
          // Fallback failed, return clean error
        }
      }
      throw new Error(e.message || `No price data available for ${symbol}`);
    }
  }
}
