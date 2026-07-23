/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IApiClient } from './IApiClient';
import { CandlestickData } from '../charts/IChartAdapter';
import { UserSettings } from '../storage/IStorageService';

function getSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function getSeededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export class AlpacaApiClient implements IApiClient {
  private keyId: string;
  private secretKey: string;

  constructor(settings: UserSettings) {
    this.keyId = settings.alpacaKey || (import.meta.env.VITE_ALPACA_KEY_ID as string) || '';
    this.secretKey = settings.alpacaSecret || (import.meta.env.VITE_ALPACA_SECRET_KEY as string) || '';
  }

  async fetchStockData(symbol: string, timeframe: string): Promise<CandlestickData[]> {
    if (!this.keyId || !this.secretKey) {
      throw new Error('Alpaca API credentials not found');
    }

    // Note: Alpaca Market Data V2 often has CORS issues in direct browser requests.
    // In a real prod app, this would hit a backend proxy.
    // For this MVP, we try to fetch from their public endpoints or mock if it fails.
    
    // Mapping our simple timeframes to Alpaca
    let alpacaTF = '1Day';
    let limit = 100;

    if (timeframe === '1D') {
      alpacaTF = '15Min';
      limit = 96; // 24 hours of 15-minute bars
    } else if (timeframe === '1W') {
      alpacaTF = '1Hour';
      limit = 168; // 7 days of 1-hour bars
    } else if (timeframe === '3M') {
      alpacaTF = '1Day';
      limit = 90; // approx 3 months of daily bars
    } else if (timeframe === '6M') {
      alpacaTF = '1Day';
      limit = 180; // approx 6 months of daily bars
    } else if (timeframe === '1Y') {
      alpacaTF = '1Day';
      limit = 365; // 1 year of daily bars
    }

    const url = `https://data.alpaca.markets/v2/stocks/${symbol}/bars?timeframe=${alpacaTF}&limit=${limit}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'APCA-API-KEY-ID': this.keyId,
          'APCA-API-SECRET-KEY': this.secretKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Alpaca API error: ${response.statusText}`);
      }

      const data = await response.json();
      const bars = data.bars || [];

      return bars.map((bar: any) => ({
        time: Math.floor(new Date(bar.t).getTime() / 1000),
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
      }));
    } catch (e) {
      console.warn('Alpaca fetch failed, using fallback or empty data', e);
      // Fallback to mock data for demonstration if credentials fail or CORS blocks
      return this.generateMockData(symbol, timeframe);
    }
  }

  private generateMockData(symbol: string, timeframe: string): CandlestickData[] {
    const data: CandlestickData[] = [];
    const seed = getSeed(symbol + timeframe + 'alpaca');
    const rand = getSeededRandom(seed);
    let price = 100 + rand() * 100;
    const now = Math.floor(Date.now() / 1000);
    
    let count = 100;
    let step = 86400; // default 1 day

    if (timeframe === '1D') {
      count = 96; // 24 hours of 15-min bars
      step = 900; // 15 minutes
    } else if (timeframe === '1W') {
      count = 168; // 7 days of 1-hour bars
      step = 3600; // 1 hour
    } else if (timeframe === '3M') {
      count = 90; // 90 days
      step = 86400;
    } else if (timeframe === '6M') {
      count = 180; // 180 days
      step = 86400;
    } else if (timeframe === '1Y') {
      count = 365; // 365 days
      step = 86400;
    }

    for (let i = 0; i < count; i++) {
        const open = price;
        const close = open + (rand() - 0.5) * 5;
        const high = Math.max(open, close) + rand() * 2;
        const low = Math.min(open, close) - rand() * 2;
        data.push({
            time: now - (count - i) * step,
            open,
            high,
            low,
            close,
            volume: 1000 + rand() * 5000,
        });
        price = close;
    }
    return data;
  }
}

export class AlphaVantageApiClient implements IApiClient {
  private apiKey: string;

  constructor(settings: UserSettings) {
    this.apiKey = settings.alphaVantageKey || (import.meta.env.VITE_ALPHA_VANTAGE_KEY as string) || '';
  }

  async fetchStockData(symbol: string, timeframe: string): Promise<CandlestickData[]> {
    if (!this.apiKey) {
      throw new Error('Alpha Vantage API key not found');
    }

    let functionType = 'TIME_SERIES_DAILY';
    let outputsize = 'compact';
    let timeSeriesKey = 'Time Series (Daily)';
    let extraParams = '';

    if (timeframe === '1D') {
      functionType = 'TIME_SERIES_INTRADAY';
      extraParams = '&interval=15min';
      outputsize = 'compact';
      timeSeriesKey = 'Time Series (15min)';
    } else if (timeframe === '1W') {
      functionType = 'TIME_SERIES_INTRADAY';
      extraParams = '&interval=60min';
      outputsize = 'compact';
      timeSeriesKey = 'Time Series (60min)';
    } else if (timeframe === '3M') {
      functionType = 'TIME_SERIES_DAILY';
      outputsize = 'compact';
      timeSeriesKey = 'Time Series (Daily)';
    } else if (timeframe === '6M' || timeframe === '1Y') {
      functionType = 'TIME_SERIES_DAILY';
      outputsize = 'full';
      timeSeriesKey = 'Time Series (Daily)';
    }

    const url = `https://www.alphavantage.co/query?function=${functionType}&symbol=${symbol}&outputsize=${outputsize}${extraParams}&apikey=${this.apiKey}`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      const series = data[timeSeriesKey];
      if (!series) {
        if (data['Note']) throw new Error('Alpha Vantage API Rate Limit Reached');
        throw new Error('Alpha Vantage API Error or Symbol not found');
      }

      const results = Object.entries(series).map(([time, values]: [string, any]) => {
        let t: number | string = time;
        if (time.includes('-') || time.includes(' ') || time.includes(':')) {
          t = Math.floor(new Date(time).getTime() / 1000);
        }
        return {
          time: t,
          open: parseFloat(values['1. open']),
          high: parseFloat(values['2. high']),
          low: parseFloat(values['3. low']),
          close: parseFloat(values['4. close']),
          volume: parseFloat(values['5. volume']),
        };
      }).filter(item => typeof item.time === 'number' && !isNaN(item.time))
        .sort((a, b) => (a.time as number) - (b.time as number));

      if (timeframe === '1D') return results.slice(-96);
      if (timeframe === '1W') return results.slice(-168);
      if (timeframe === '3M') return results.slice(-90);
      if (timeframe === '6M') return results.slice(-180);
      if (timeframe === '1Y') return results.slice(-365);
      
      return results;
    } catch (e) {
        console.warn('Alpha Vantage fetch failed', e);
        return this.generateMockData(symbol, timeframe);
    }
  }

  private generateMockData(symbol: string, timeframe: string): CandlestickData[] {
    const data: CandlestickData[] = [];
    const seed = getSeed(symbol + timeframe + 'alphavantage');
    const rand = getSeededRandom(seed);
    let price = 150 + rand() * 200;
    const now = Math.floor(Date.now() / 1000);
    
    let count = 100;
    let step = 86400; // default 1 day

    if (timeframe === '1D') {
      count = 96; // 24 hours of 15-min bars
      step = 900; // 15 minutes
    } else if (timeframe === '1W') {
      count = 168; // 7 days of 1-hour bars
      step = 3600; // 1 hour
    } else if (timeframe === '3M') {
      count = 90; // 90 days
      step = 86400;
    } else if (timeframe === '6M') {
      count = 180; // 180 days
      step = 86400;
    } else if (timeframe === '1Y') {
      count = 365; // 365 days
      step = 86400;
    }

    for (let i = 0; i < count; i++) {
        const open = price;
        const close = open + (rand() - 0.5) * 10;
        const high = Math.max(open, close) + rand() * 4;
        const low = Math.min(open, close) - rand() * 4;
        data.push({
            time: now - (count - i) * step,
            open,
            high,
            low,
            close,
            volume: 2000 + rand() * 8000,
        });
        price = close;
    }
    return data;
  }
}
