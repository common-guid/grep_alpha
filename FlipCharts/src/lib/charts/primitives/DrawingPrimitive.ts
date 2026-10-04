/**
 * LightweightCharts ISeriesPrimitive implementation
 * Attaches to candlestick series and delegates canvas drawing to DrawingManager.
 */

import type {
  ISeriesPrimitive,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import { DrawingManager } from './DrawingManager';

class DrawingPaneRenderer implements IPrimitivePaneRenderer {
  constructor(
    private manager: DrawingManager,
    private timeScale: any,
    private series: any,
    private seriesData?: Array<{ time: number | string }>
  ) {}

  draw(target: CanvasRenderingTarget2D) {
    this.manager.render(target, this.timeScale, this.series, this.seriesData);
  }
}

class DrawingPaneView implements IPrimitivePaneView {
  constructor(
    private manager: DrawingManager,
    private timeScale: any,
    private series: any,
    private seriesData?: Array<{ time: number | string }>
  ) {}

  renderer(): IPrimitivePaneRenderer | null {
    return new DrawingPaneRenderer(this.manager, this.timeScale, this.series, this.seriesData);
  }
}

export class DrawingPrimitive implements ISeriesPrimitive<Time> {
  private chart: any = null;
  private series: any = null;
  private paneView: DrawingPaneView | null = null;
  private requestUpdate: (() => void) | null = null;
  private seriesData?: Array<{ time: number | string }>;

  constructor(private manager: DrawingManager) {}

  public setSeriesData(data: Array<{ time: number | string }>) {
    this.seriesData = data;
  }

  attached(param: SeriesAttachedParameter<Time, any>): void {
    this.chart = param.chart;
    this.series = param.series;
    this.requestUpdate = param.requestUpdate;

    this.paneView = new DrawingPaneView(
      this.manager,
      this.chart.timeScale(),
      this.series,
      this.seriesData
    );

    // Subscribe to drawing manager changes to trigger chart rerenders
    this.unsubscribe = this.manager.subscribe(() => {
      if (this.requestUpdate) {
        this.requestUpdate();
      }
    });
  }

  private unsubscribe?: () => void;

  detached(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
    this.chart = null;
    this.series = null;
    this.paneView = null;
    this.requestUpdate = null;
  }

  updateAllViews(): void {
    if (this.chart && this.series) {
      this.paneView = new DrawingPaneView(
        this.manager,
        this.chart.timeScale(),
        this.series,
        this.seriesData
      );
    }
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.paneView ? [this.paneView] : [];
  }
}
