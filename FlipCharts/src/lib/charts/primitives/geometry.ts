/**
 * Geometry and coordinate conversion helper functions for drawing primitives.
 */

export interface DrawingPoint {
  time: number | string;
  price: number;
}

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Converts a data coordinate point ({time, price}) into pixel coordinates ({x, y})
 * relative to the chart's main pane canvas.
 */
export function pointToPixel(
  pt: DrawingPoint,
  timeScale: any,
  series: any
): Point2D | null {
  if (!timeScale || !series) return null;
  const x = timeScale.timeToCoordinate(pt.time);
  const y = series.priceToCoordinate(pt.price);
  if (x === null || y === null || x === undefined || y === undefined) {
    return null;
  }
  return { x: Number(x), y: Number(y) };
}

/**
 * Converts pixel coordinates ({x, y}) back into data coordinates ({time, price}).
 * If coordinateToTime returns undefined (e.g. over weekend gaps), snaps to nearest candle time
 * from series data if available.
 */
export function pixelToPoint(
  x: number,
  y: number,
  timeScale: any,
  series: any,
  visibleSeriesData?: Array<{ time: number | string }>
): DrawingPoint | null {
  if (!timeScale || !series) return null;
  const price = series.coordinateToPrice(y);
  if (price === null || price === undefined) return null;

  let time = timeScale.coordinateToTime(x);
  if ((time === null || time === undefined) && visibleSeriesData && visibleSeriesData.length > 0) {
    // Weekend/gap snapping: find the candle closest in x space
    let minDistance = Infinity;
    let closestTime: number | string | null = null;
    for (const d of visibleSeriesData) {
      const cx = timeScale.timeToCoordinate(d.time);
      if (cx !== null && cx !== undefined) {
        const dist = Math.abs(Number(cx) - x);
        if (dist < minDistance) {
          minDistance = dist;
          closestTime = d.time;
        }
      }
    }
    time = closestTime;
  }

  if (time === null || time === undefined) return null;
  return { time, price: Number(price) };
}

/**
 * Calculates perpendicular distance from point P to line segment AB.
 */
export function lineHitTest(p: Point2D, a: Point2D, b: Point2D, tolPx: number = 6): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    const dist = Math.hypot(p.x - a.x, p.y - a.y);
    return dist <= tolPx;
  }

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  const dist = Math.hypot(p.x - projX, p.y - projY);

  return dist <= tolPx;
}

/**
 * Checks if point P is inside box defined by corners A and B.
 */
export function rectContains(p: Point2D, a: Point2D, b: Point2D): boolean {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);

  return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
}

/**
 * Calculates readout measurements between two anchor points.
 */
export function measureReadout(
  a: DrawingPoint,
  b: DrawingPoint,
  timeToIndex?: (time: number | string) => number | undefined
): { deltaPrice: number; deltaPct: number; bars: number | null } {
  const deltaPrice = b.price - a.price;
  const deltaPct = a.price !== 0 ? (deltaPrice / a.price) * 100 : 0;

  let bars: number | null = null;
  if (timeToIndex) {
    const idxA = timeToIndex(a.time);
    const idxB = timeToIndex(b.time);
    if (idxA !== undefined && idxB !== undefined) {
      bars = Math.abs(idxB - idxA);
    }
  }

  return {
    deltaPrice,
    deltaPct,
    bars,
  };
}
