/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IStorageService, UserSettings } from './IStorageService';

const SETTINGS_KEY = 'chart_reviewer_settings';
const NOTES_PREFIX = 'chart_reviewer_notes_';

const DEFAULT_SETTINGS: UserSettings = {
  alpacaKey: '',
  alpacaSecret: '',
  alphaVantageKey: '',
  preferredApi: 'alphavantage',
  theme: 'dark',
};

export class LocalStorageService implements IStorageService {
  async getSettings(): Promise<UserSettings> {
    const data = localStorage.getItem(SETTINGS_KEY);
    if (!data) return DEFAULT_SETTINGS;
    try {
      const saved = JSON.parse(data);
      return { ...DEFAULT_SETTINGS, ...saved };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  async saveSettings(settings: UserSettings): Promise<void> {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  async getNotes(symbol: string): Promise<string> {
    return localStorage.getItem(`${NOTES_PREFIX}${symbol}`) || '';
  }

  async saveNotes(symbol: string, notes: string): Promise<void> {
    localStorage.setItem(`${NOTES_PREFIX}${symbol}`, notes);
  }
}
