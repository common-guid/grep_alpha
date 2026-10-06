/**
 * Coordinates WatchlistStats so its /api/prices fan-out does not start until
 * at least one initial-viewport ChartCard has painted (or a timeout fires).
 * That lets visible chart fetches claim HTTP/1.1 connection slots first.
 */

const PAINTED_EVENT = 'grep-alpha:viewport-chart-painted';

export function notifyViewportChartPainted(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PAINTED_EVENT));
}

function scheduleIdle(cb: () => void): void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(cb, { timeout: 1500 });
  } else {
    setTimeout(cb, 50);
  }
}

/**
 * Resolves after the first viewport chart paint (then idle), or after timeoutMs.
 * Safe to call multiple times (e.g. on watchlist change).
 */
export function waitForViewportChartsPriority(timeoutMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener(PAINTED_EVENT, onPainted);
      window.clearTimeout(timer);
      scheduleIdle(resolve);
    };
    const onPainted = () => finish();
    window.addEventListener(PAINTED_EVENT, onPainted);
    const timer = window.setTimeout(finish, timeoutMs);
  });
}

/** Run async work over items with a fixed concurrency limit. */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Math.min(Math.max(1, concurrency), Math.max(1, items.length));
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}
