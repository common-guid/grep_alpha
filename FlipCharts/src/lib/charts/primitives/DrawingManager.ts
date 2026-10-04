/**
 * LightweightCharts Drawing Manager
 * Manages active tools, anchor capture, drawings collection, and canvas rendering dispatch.
 */

import { DrawingPoint, Point2D, pointToPixel, pixelToPoint, measureReadout } from './geometry';

export type DrawingTool = 'trendline' | 'ray' | 'hline' | 'vline' | 'rect' | 'measure';

export interface Drawing {
  id?: number | string;
  tool: DrawingTool;
  points: DrawingPoint[];
  color: string;
}

export class DrawingManager {
  private drawings: Drawing[] = [];
  private pendingPoints: DrawingPoint[] = [];
  private mousePos: Point2D | null = null;
  public activeTool: DrawingTool | null = null;
  public currentColor: string = '#58a6ff';
  private listeners: Set<(drawings: Drawing[]) => void> = new Set();

  public subscribe(cb: (drawings: Drawing[]) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  public getDrawings(): Drawing[] {
    return this.drawings;
  }

  public setDrawings(drawings: Drawing[]) {
    this.drawings = drawings;
    this.notifyChanged();
  }

  public getPendingPoints(): DrawingPoint[] {
    return this.pendingPoints;
  }

  public getActiveTool(): DrawingTool | null {
    return this.activeTool;
  }

  public setActiveTool(tool: DrawingTool | null) {
    this.activeTool = tool;
    this.pendingPoints = [];
    this.mousePos = null;
  }

  public removeLastDrawing() {
    if (this.drawings.length > 0) {
      this.drawings.pop();
      this.notifyChanged();
    }
  }

  public clearAll() {
    if (this.drawings.length > 0 || this.pendingPoints.length > 0) {
      this.drawings = [];
      this.pendingPoints = [];
      this.notifyChanged();
    }
  }

  public cancelPending() {
    if (this.pendingPoints.length > 0) {
      this.pendingPoints = [];
      this.mousePos = null;
    }
  }

  private notifyChanged() {
    for (const listener of Array.from(this.listeners)) {
      try {
        listener([...this.drawings]);
      } catch (e) {
        console.error('Error in drawing listener:', e);
      }
    }
  }

  /**
   * Pointer down / click handler called from adapter bridge.
   */
  public handlePointerClick(
    containerPx: Point2D,
    chart: any,
    series: any,
    seriesData?: Array<{ time: number | string }>
  ) {
    if (!this.activeTool) return;

    const timeScale = chart.timeScale();
    const pt = pixelToPoint(containerPx.x, containerPx.y, timeScale, series, seriesData);
    if (!pt) return;

    const expectedCount =
      this.activeTool === 'hline' || this.activeTool === 'vline' ? 1 : 2;

    const newPending = [...this.pendingPoints, pt];

    if (newPending.length >= expectedCount) {
      const newDrawing: Drawing = {
        tool: this.activeTool,
        points: newPending,
        color: this.currentColor,
      };
      this.drawings.push(newDrawing);
      this.pendingPoints = [];
      this.mousePos = null;
      // Reset active tool to pointer mode after completing shape
      this.activeTool = null;
      this.notifyChanged();
    } else {
      this.pendingPoints = newPending;
    }
  }

  public handlePointerMove(containerPx: Point2D) {
    if (this.activeTool && this.pendingPoints.length > 0) {
      this.mousePos = containerPx;
    } else {
      this.mousePos = null;
    }
  }

  /**
   * Main canvas render routine delegated by DrawingPrimitive.
   */
  public render(target: any, timeScale: any, series: any, seriesData?: Array<{ time: number | string }>) {
    if (!target || !timeScale || !series) return;

    target.useMediaCoordinateSpace((scope: any) => {
      const ctx: CanvasRenderingContext2D = scope.context;
      const mediaSize = scope.mediaSize;

      // Render completed drawings
      for (const drawing of this.drawings) {
        this.renderSingleDrawing(ctx, drawing, timeScale, series, mediaSize, false, seriesData);
      }

      // Render in-progress drawing if active
      if (this.activeTool && this.pendingPoints.length > 0) {
        let currentSecondPt: DrawingPoint | null = null;
        if (this.mousePos) {
          currentSecondPt = pixelToPoint(
            this.mousePos.x,
            this.mousePos.y,
            timeScale,
            series,
            seriesData
          );
        }

        const pts = [...this.pendingPoints];
        if (currentSecondPt) {
          pts.push(currentSecondPt);
        }

        const pendingDrawing: Drawing = {
          tool: this.activeTool,
          points: pts,
          color: this.currentColor,
        };

        this.renderSingleDrawing(ctx, pendingDrawing, timeScale, series, mediaSize, true, seriesData);
      }
    });
  }

  private renderSingleDrawing(
    ctx: CanvasRenderingContext2D,
    drawing: Drawing,
    timeScale: any,
    series: any,
    mediaSize: { width: number; height: number },
    isPending: boolean,
    seriesData?: Array<{ time: number | string }>
  ) {
    const { tool, points, color } = drawing;
    if (points.length === 0) return;

    const p1 = pointToPixel(points[0], timeScale, series);
    const p2 = points.length > 1 ? pointToPixel(points[1], timeScale, series) : null;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;

    if (isPending) {
      ctx.setLineDash([5, 5]);
    } else {
      ctx.setLineDash([]);
    }

    if (tool === 'hline') {
      if (p1) {
        ctx.beginPath();
        ctx.moveTo(0, p1.y);
        ctx.lineTo(mediaSize.width, p1.y);
        ctx.stroke();
      }
    } else if (tool === 'vline') {
      if (p1) {
        ctx.beginPath();
        ctx.moveTo(p1.x, 0);
        ctx.lineTo(p1.x, mediaSize.height);
        ctx.stroke();
      }
    } else if (tool === 'trendline') {
      if (p1 && p2) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      } else if (p1 && isPending) {
        // Draw anchor handle if second point is missing/offscreen
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, 3, 0, 2 * Math.PI);
        ctx.fill();
      }
    } else if (tool === 'ray') {
      if (p1 && p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        let endX = p2.x;
        let endY = p2.y;

        if (dx !== 0 || dy !== 0) {
          const scale = Math.max(mediaSize.width, mediaSize.height) * 2;
          endX = p1.x + dx * scale;
          endY = p1.y + dy * scale;
        }

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      }
    } else if (tool === 'rect') {
      if (p1 && p2) {
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x);
        const h = Math.abs(p2.y - p1.y);

        ctx.fillStyle = color + '1f'; // ~12% alpha
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      }
    } else if (tool === 'measure') {
      if (p1 && p2) {
        // Draw connecting line
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // Calculate readout data
        const timeToIndex = (time: number | string) => {
          if (!seriesData) return undefined;
          const idx = seriesData.findIndex((d) => d.time === time);
          return idx >= 0 ? idx : undefined;
        };

        const readout = measureReadout(points[0], points[1], timeToIndex);
        const priceSign = readout.deltaPrice >= 0 ? '+' : '';
        const pctSign = readout.deltaPct >= 0 ? '+' : '';
        const priceStr = `${priceSign}${readout.deltaPrice.toFixed(2)}`;
        const pctStr = `${pctSign}${readout.deltaPct.toFixed(2)}%`;
        const barsStr = readout.bars !== null ? `${readout.bars} bars` : '';

        const text = [priceStr, pctStr, barsStr].filter(Boolean).join(' | ');

        ctx.font = '10px sans-serif';
        const textMetrics = ctx.measureText(text);
        const padding = 6;
        const boxWidth = textMetrics.width + padding * 2;
        const boxHeight = 20;

        // Position readout box at second anchor
        const boxX = Math.min(mediaSize.width - boxWidth - 5, Math.max(5, p2.x + 10));
        const boxY = Math.min(mediaSize.height - boxHeight - 5, Math.max(5, p2.y - 10));

        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(28, 32, 48, 0.9)';
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

        ctx.fillStyle = readout.deltaPct >= 0 ? '#26a69a' : '#ef5350';
        ctx.fillText(text, boxX + padding, boxY + 14);
      }
    }

    // Draw anchor dots for in-progress or completed endpoints
    if (p1) {
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, 3, 0, 2 * Math.PI);
      ctx.fill();
    }
    if (p2) {
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p2.x, p2.y, 3, 0, 2 * Math.PI);
      ctx.fill();
    }

    ctx.restore();
  }
}
