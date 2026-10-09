/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createChart, ColorType, IChartApi, CandlestickSeries, LineSeries, HistogramSeries, CandlestickData as LWCandlestickData, TrackingModeExitMode } from 'lightweight-charts';
import { IChartAdapter, CandlestickData, ChartOptions } from './IChartAdapter';
import { DrawingPrimitive } from './primitives/DrawingPrimitive';

export class LightweightChartsAdapter implements IChartAdapter {
  render(container: HTMLElement, data: any[], options: ChartOptions): () => void {
    const chart: IChartApi = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
        textColor: '#d1d4dc',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
      },
      width: container.clientWidth,
      height: container.clientHeight,
      timeScale: {
        borderColor: '#242733',
        timeVisible: true,
        secondsVisible: false,
        // Keep the visible range (not the bar spacing) when the container
        // resizes, so a chart widened by collapsing the pane stays fitted.
        lockVisibleTimeRangeOnResize: true,
      },
      rightPriceScale: {
        borderColor: '#242733',
      },
      ...(options.scrollFriendlyTouch
        ? {
            // lightweight-charts only preventDefault()s a touchmove when a touch
            // drag is enabled or crosshair tracking is active, so turning these
            // off hands the swipe back to the page. Mouse options stay default.
            handleScroll: { horzTouchDrag: false, vertTouchDrag: false },
            handleScale: { pinch: false },
            // Long-press crosshair ends on touch end, instead of capturing the
            // next swipe until another tap (default OnNextTap).
            trackingMode: { exitMode: TrackingModeExitMode.OnTouchEnd },
          }
        : {}),
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    candlestickSeries.setData(data as LWCandlestickData[]);

    // 10 EMA Series (Cyan)
    const ema10Data = data
      .filter((d) => d.ema10 !== undefined && d.ema10 !== null)
      .map((d) => ({ time: d.time, value: d.ema10 }));
    if (ema10Data.length > 0) {
      const ema10Series = chart.addSeries(LineSeries, { color: '#00bec4', lineWidth: 1, title: '10 EMA' });
      ema10Series.setData(ema10Data as any);
    }

    // 50 SMA Series (Amber)
    const sma50Data = data
      .filter((d) => d.sma50 !== undefined && d.sma50 !== null)
      .map((d) => ({ time: d.time, value: d.sma50 }));
    if (sma50Data.length > 0) {
      const sma50Series = chart.addSeries(LineSeries, { color: '#ffc107', lineWidth: 1, title: '50 SMA' });
      sma50Series.setData(sma50Data as any);
    }

    // 200 SMA Series (Red)
    const sma200Data = data
      .filter((d) => d.sma200 !== undefined && d.sma200 !== null)
      .map((d) => ({ time: d.time, value: d.sma200 }));
    if (sma200Data.length > 0) {
      const sma200Series = chart.addSeries(LineSeries, { color: '#ff4757', lineWidth: 1, title: '200 SMA' });
      sma200Series.setData(sma200Data as any);
    }

    // Volume Series
    if (options.showVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: '#26a69a',
        priceFormat: {
          type: 'volume',
        },
        priceScaleId: '', // overlay
      });

      volumeSeries.priceScale().applyOptions({
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
      });

      const volumeData = data
        .filter((d) => d.volume !== undefined)
        .map((d) => ({
          time: d.time as LWCandlestickData['time'],
          value: d.volume!,
          color: d.close >= d.open ? 'rgba(38, 166, 154, 0.4)' : 'rgba(239, 83, 80, 0.4)',
        }));

      volumeSeries.setData(volumeData);
    }

    // Fit content
    chart.timeScale().fitContent();

    // Follow the container's size, not just the window's: the chart grid reflows
    // when the watchlist pane is collapsed/expanded without any window resize.
    let lastW = container.clientWidth;
    let lastH = container.clientHeight;
    let resizeFrame = 0;
    const handleResize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w === 0 || h === 0 || (w === lastW && h === lastH)) return;
        lastW = w;
        lastH = h;
        chart.applyOptions({ width: w, height: h });
      });
    };

    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);
    } else {
      window.addEventListener('resize', handleResize);
    }

    // Attach drawing primitive and event handlers if bridge is supplied
    let cleanupBridge: (() => void) | undefined;
    if (options.drawingBridge && options.drawingBridge.manager) {
      const manager = options.drawingBridge.manager;
      const primitive = new DrawingPrimitive(manager);
      primitive.setSeriesData(data as any);
      candlestickSeries.attachPrimitive(primitive);

      const handlePointerDown = (e: MouseEvent) => {
        if (!manager.getActiveTool()) return;
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        manager.handlePointerClick({ x, y }, chart, candlestickSeries, data as any);
      };

      const handlePointerMove = (e: MouseEvent) => {
        if (!manager.getActiveTool()) return;
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        manager.handlePointerMove({ x, y });
        // Request primitive redraw on mouse move when tool active
        chart.applyOptions({});
      };

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          manager.cancelPending();
          manager.setActiveTool(null);
          chart.applyOptions({});
        }
      };

      container.addEventListener('pointerdown', handlePointerDown);
      container.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('keydown', handleKeyDown);

      cleanupBridge = () => {
        container.removeEventListener('pointerdown', handlePointerDown);
        container.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('keydown', handleKeyDown);
        try {
          candlestickSeries.detachPrimitive(primitive);
        } catch (_) {}
      };
    }

    return () => {
      cancelAnimationFrame(resizeFrame);
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', handleResize);
      }
      if (cleanupBridge) {
        cleanupBridge();
      }
      chart.remove();
    };
  }
}
