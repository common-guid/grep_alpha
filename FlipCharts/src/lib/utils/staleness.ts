/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface StalenessResult {
  isStale: boolean;
  lastDateStr: string;
  calendarDaysDiff: number;
  tradingDaysMissing: number;
}

/**
 * Calculates whether candlestick price data is stale based on trading calendar days.
 * 
 * Rules:
 * - Normalizes last candle date and current date to UTC start-of-day.
 * - Counts missing business days (Monday to Friday), excluding Saturdays and Sundays.
 * - Weekend safety: Friday EOD data tested on Saturday or Sunday has 0 missing trading days.
 * - Marks data as stale if missing trading days >= tradingDaysThreshold (default: 2).
 * 
 * @param lastCandleTime Unix timestamp in seconds, date string (e.g. '2026-03-20'), or Date object.
 * @param tradingDaysThreshold Number of missing trading sessions to trigger stale warning (default: 2).
 */
export function checkStaleness(
  lastCandleTime: number | string | undefined,
  tradingDaysThreshold = 2
): StalenessResult {
  if (!lastCandleTime) {
    return { isStale: false, lastDateStr: 'N/A', calendarDaysDiff: 0, tradingDaysMissing: 0 };
  }

  let lastDate: Date;
  if (typeof lastCandleTime === 'number') {
    // Unix timestamp in seconds -> milliseconds
    lastDate = new Date(lastCandleTime * 1000);
  } else {
    lastDate = new Date(lastCandleTime);
  }

  if (isNaN(lastDate.getTime())) {
    return { isStale: false, lastDateStr: 'Invalid Date', calendarDaysDiff: 0, tradingDaysMissing: 0 };
  }

  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const lastUTC = Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), lastDate.getUTCDate());

  const msPerDay = 1000 * 60 * 60 * 24;
  const calendarDaysDiff = Math.max(0, Math.floor((todayUTC - lastUTC) / msPerDay));

  if (calendarDaysDiff === 0) {
    return {
      isStale: false,
      lastDateStr: lastDate.toISOString().split('T')[0],
      calendarDaysDiff: 0,
      tradingDaysMissing: 0,
    };
  }

  // Count missing trading/business days (Mon-Fri) strictly between lastUTC + 1 day and todayUTC
  let tradingDaysMissing = 0;
  const cursor = new Date(lastUTC + msPerDay);

  while (cursor.getTime() <= todayUTC) {
    const dayOfWeek = cursor.getUTCDay();
    // 0 = Sunday, 6 = Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      tradingDaysMissing++;
    }
    cursor.setTime(cursor.getTime() + msPerDay);
  }

  const isStale = tradingDaysMissing >= tradingDaysThreshold;
  const lastDateStr = lastDate.toISOString().split('T')[0];

  return {
    isStale,
    lastDateStr,
    calendarDaysDiff,
    tradingDaysMissing,
  };
}
