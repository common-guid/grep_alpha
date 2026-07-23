/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createChart, ColorType, IChartApi, CandlestickSeries, LineSeries, HistogramSeries, CandlestickData as LWCandlestickData } from 'lightweight-charts';
import { IChartAdapter, CandlestickData, ChartOptions } from './IChartAdapter';

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
      },
      rightPriceScale: {
        borderColor: '#242733',
      },
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

    const handleResize = () => {
      chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }
}
