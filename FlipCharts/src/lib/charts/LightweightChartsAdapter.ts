/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createChart, ColorType, IChartApi, ISeriesApi, SeriesType, CandlestickSeries, LineSeries, HistogramSeries, CandlestickData as LWCandlestickData, TrackingModeExitMode, LogicalRange } from 'lightweight-charts';
import { IChartAdapter, CandlestickData, ChartOptions } from './IChartAdapter';
import { DrawingPrimitive } from './primitives/DrawingPrimitive';
import { formatPercent, percentFromBaseline, baselineIndex, PERCENT_AXIS_MIN_WIDTH } from './percentAxis';

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
      // Left axis: % change of the price at the same height vs the first visible
      // bar's close. It is a mirror of the right scale (see percentMirror below).
      leftPriceScale: {
        visible: container.clientWidth >= PERCENT_AXIS_MIN_WIDTH,
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

    // Moving averages: labels live in a top-left legend overlay instead of
    // the right price axis, where they covered the latest candles.
    const maSeries: { label: string; color: string; series: any; last: number }[] = [];

    // 10 EMA Series (Cyan)
    const ema10Data = data
      .filter((d) => d.ema10 !== undefined && d.ema10 !== null)
      .map((d) => ({ time: d.time, value: d.ema10 }));
    if (ema10Data.length > 0) {
      const ema10Series = chart.addSeries(LineSeries, { color: '#00bec4', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
      ema10Series.setData(ema10Data as any);
      maSeries.push({ label: '10 EMA', color: ((ema10Series.options() as any).color), series: ema10Series, last: ema10Data[ema10Data.length - 1].value });
    }

    // 50 SMA Series (Amber)
    const sma50Data = data
      .filter((d) => d.sma50 !== undefined && d.sma50 !== null)
      .map((d) => ({ time: d.time, value: d.sma50 }));
    if (sma50Data.length > 0) {
      const sma50Series = chart.addSeries(LineSeries, { color: '#ffc107', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
      sma50Series.setData(sma50Data as any);
      maSeries.push({ label: '50 SMA', color: ((sma50Series.options() as any).color), series: sma50Series, last: sma50Data[sma50Data.length - 1].value });
    }

    // 200 SMA Series (Red)
    const sma200Data = data
      .filter((d) => d.sma200 !== undefined && d.sma200 !== null)
      .map((d) => ({ time: d.time, value: d.sma200 }));
    if (sma200Data.length > 0) {
      const sma200Series = chart.addSeries(LineSeries, { color: '#ff4757', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
      sma200Series.setData(sma200Data as any);
      maSeries.push({ label: '200 SMA', color: ((sma200Series.options() as any).color), series: sma200Series, last: sma200Data[sma200Data.length - 1].value });
    }

    // --- Left % axis -----------------------------------------------------------
    // Alignment by construction: every series that sizes the right price scale
    // (candles + MA lines) is mirrored, invisible, onto the left scale with the
    // same data and the same (default) margins, so both scales autoscale to the
    // identical price range. The left scale stays in price units; only its labels
    // are formatted as % change from the baseline (first visible bar's close).
    // Volume is an overlay on its own scale and is not mirrored.
    const closes = (data as any[]).map((d) => d.close as number);
    let baseIdx = 0;
    const baseline = () => closes[Math.min(baseIdx, closes.length - 1)];
    const pctFormat = () => ({
      type: 'custom' as const,
      minMove: 0.01,
      formatter: (price: number) => formatPercent(percentFromBaseline(price, baseline())),
    });
    const hidden = {
      priceScaleId: 'left', lastValueVisible: false, priceLineVisible: false,
      crosshairMarkerVisible: false, priceFormat: pctFormat(),
    };
    const leftMirrors: ISeriesApi<SeriesType>[] = [];
    if (closes.length > 0) {
      const clear = 'rgba(0, 0, 0, 0)';
      const candleMirror = chart.addSeries(CandlestickSeries, {
        ...hidden, upColor: clear, downColor: clear, borderVisible: false, wickVisible: false,
      } as any);
      candleMirror.setData(data as LWCandlestickData[]);
      leftMirrors.push(candleMirror);
      for (const m of maSeries) {
        const mirror = chart.addSeries(LineSeries, { ...hidden, color: clear, lineWidth: 1 } as any);
        mirror.setData(m.series.data() as any);
        leftMirrors.push(mirror);
      }
    }
    const leftScale = chart.priceScale('left');
    const rightScale = chart.priceScale('right');
    // Re-label when the baseline bar changes on scroll/zoom (marks are cached
    // per price range, so a new formatter instance forces fresh labels).
    const onRange = (range: LogicalRange | null) => {
      const idx = baselineIndex(range, closes.length);
      if (idx === baseIdx || leftMirrors.length === 0) return;
      baseIdx = idx;
      leftMirrors[0].applyOptions({ priceFormat: pctFormat() } as any);
      positionLegend();
    };
    // If the user drags/zooms the right axis (manual price range), copy that
    // range to the left scale; return the left scale to autoscale with it.
    const syncManual = () => {
      if (leftMirrors.length === 0) return;
      const manual = !rightScale.options().autoScale;
      const rr = rightScale.getVisibleRange();
      if (manual && rr) {
        leftScale.setAutoScale(false);
        leftScale.setVisibleRange(rr);
      } else if (!manual && !leftScale.options().autoScale) {
        leftScale.setAutoScale(true);
      }
    };
    let syncFrame = 0;
    let syncing = false;
    const syncLoop = () => {
      syncManual();
      if (syncing) syncFrame = requestAnimationFrame(syncLoop);
    };
    const startSync = () => { if (!syncing) { syncing = true; syncFrame = requestAnimationFrame(syncLoop); } };
    const stopSync = () => { syncing = false; cancelAnimationFrame(syncFrame); requestAnimationFrame(() => syncManual()); };
    container.addEventListener('pointerdown', startSync);
    window.addEventListener('pointerup', stopSync);
    container.addEventListener('dblclick', stopSync);
    container.addEventListener('wheel', stopSync, { passive: true });

    // MA legend overlay (top-left of plot area). Shows latest values; updates
    // to the hovered bar on crosshair move. pointer-events: none so it never
    // blocks chart interaction or drawing tools.
    let legend: HTMLDivElement | undefined;
    let onCrosshair: ((p: any) => void) | undefined;
    // Keep the legend inside the plot area, clear of the left % axis labels.
    function positionLegend() {
      if (!legend) return;
      const w = leftScale.options().visible ? leftScale.width() : 0;
      legend.style.left = `${w + 4}px`;
    }
    if (maSeries.length > 0) {
      if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
      legend = document.createElement('div');
      legend.className = 'ma-legend';
      legend.setAttribute('data-testid', 'ma-legend');
      Object.assign(legend.style, {
        position: 'absolute', top: '4px', left: '4px', zIndex: '3', // left is set by positionLegend()
        pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: '1px',
        padding: '2px 5px', borderRadius: '3px', background: 'rgba(19, 23, 34, 0.6)',
        font: '10px/1.25 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        whiteSpace: 'nowrap',
      } as Partial<CSSStyleDeclaration>);
      const valueEls: HTMLSpanElement[] = [];
      for (const m of maSeries) {
        const row = document.createElement('div');
        row.style.color = m.color;
        const lab = document.createElement('span');
        lab.textContent = m.label + ' ';
        const val = document.createElement('span');
        val.textContent = Number(m.last).toFixed(2);
        row.append(lab, val);
        legend.appendChild(row);
        valueEls.push(val);
      }
      container.appendChild(legend);
      onCrosshair = (param: any) => {
        maSeries.forEach((m, i) => {
          const d = param && param.time !== undefined ? param.seriesData?.get(m.series) : undefined;
          const v = d && typeof d.value === 'number' ? d.value : m.last;
          valueEls[i].textContent = Number(v).toFixed(2);
        });
      };
      chart.subscribeCrosshairMove(onCrosshair);
    }

    positionLegend();

    // Volume Series
    if (options.showVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: '#26a69a',
        // lightweight-charts paints an overlay series' last-value label on EVERY
        // visible price axis, so with the left % axis it would also appear there.
        // The built-in label is turned off and re-drawn on the right axis only by
        // volumeAxisLabel() below (same text, colour, position as before).
        lastValueVisible: false,
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
      candlestickSeries.attachPrimitive(volumeAxisLabel(chart, volumeSeries, volumeData));
    }

    // Fit content
    chart.timeScale().fitContent();
    baseIdx = baselineIndex(chart.timeScale().getVisibleLogicalRange(), closes.length);
    if (leftMirrors.length) leftMirrors[0].applyOptions({ priceFormat: pctFormat() } as any);
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    // Read-only handle for headless verification of axis alignment.
    Object.defineProperty(container, '__gaPercentAxis', {
      configurable: true,
      value: { chart, price: candlestickSeries, mirror: leftMirrors[0], baseline, format: (p: number) => formatPercent(percentFromBaseline(p, baseline())) },
    });
    // The axis width is known after the first paint.
    let legendFrame = requestAnimationFrame(() => { legendFrame = requestAnimationFrame(positionLegend); });

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
        chart.applyOptions({ width: w, height: h, leftPriceScale: { visible: w >= PERCENT_AXIS_MIN_WIDTH } });
        requestAnimationFrame(positionLegend);
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
      if (onCrosshair) chart.unsubscribeCrosshairMove(onCrosshair);
      cancelAnimationFrame(legendFrame);
      syncing = false;
      cancelAnimationFrame(syncFrame);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      delete (container as any).__gaPercentAxis;
      container.removeEventListener('pointerdown', startSync);
      window.removeEventListener('pointerup', stopSync);
      container.removeEventListener('dblclick', stopSync);
      container.removeEventListener('wheel', stopSync);
      if (legend) legend.remove();
      chart.remove();
    };
  }
}

/**
 * Right-axis-only last-value label for the volume overlay. Mirrors the built-in
 * series label: value of the last visible bar, background = that bar's colour
 * without alpha, white/black text by luminance. Attached to the candlestick
 * series (right scale) so lightweight-charts only renders it on the right axis.
 */
function volumeAxisLabel(
  chart: IChartApi,
  volume: ISeriesApi<'Histogram'>,
  bars: { value: number; color: string }[],
) {
  const lastVisible = () => {
    const r = chart.timeScale().getVisibleLogicalRange();
    if (!r || bars.length === 0) return null;
    const i = Math.max(0, Math.min(bars.length - 1, Math.floor(r.to)));
    return Math.ceil(r.from) > bars.length - 1 ? null : bars[i];
  };
  const rgb = (c: string) => {
    const m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
    const h = c.replace('#', '');
    return [0, 2, 4].map((o) => parseInt(h.slice(o, o + 2), 16));
  };
  const view = {
    coordinate: () => { const b = lastVisible(); return b ? (volume.priceToCoordinate(b.value) ?? -100) : -100; },
    text: () => { const b = lastVisible(); return b ? volume.priceFormatter().format(b.value) : ''; },
    backColor: () => { const b = lastVisible(); const [r, g, bl] = rgb(b ? b.color : '#26a69a'); return `rgb(${r}, ${g}, ${bl})`; },
    textColor: () => { const b = lastVisible(); const [r, g, bl] = rgb(b ? b.color : '#26a69a'); return 0.199 * r + 0.687 * g + 0.114 * bl > 160 ? 'black' : 'white'; },
    visible: () => lastVisible() !== null,
    tickVisible: () => true,
  };
  return { updateAllViews() {}, priceAxisViews: () => [view] };
}
