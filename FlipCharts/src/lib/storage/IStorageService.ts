/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Watchlist {
  id: string;
  name: string;
  symbols: string[];
}

export interface UserSettings {
  alpacaKey: string;
  alpacaSecret: string;
  alphaVantageKey: string;
  preferredApi: 'alpaca' | 'alphavantage';
  theme: 'dark' | 'light';
}

export interface IStorageService {
  getSettings(): Promise<UserSettings>;
  saveSettings(settings: UserSettings): Promise<void>;
  getNotes(symbol: string): Promise<string>;
  saveNotes(symbol: string, notes: string): Promise<void>;
}

