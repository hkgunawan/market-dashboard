"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  ColorType,
  LineStyle,
  type IChartApi,
  type UTCTimestamp,
  type LineData,
  type WhitespaceData,
  type SeriesMarker,
} from "lightweight-charts";
import type { Candle } from "@/lib/yahoo";
import type { Supertrend, MacdResult } from "@/lib/indicators";

interface Props {
  candles: Candle[];
  supertrend: Supertrend;
  macd: MacdResult;
}

const GREEN = "#3fb950";
const RED = "#f85149";
const YELLOW = "#d29922";
// 4-colour MACD histogram (Chris Moody scheme)
const HIST_UP_RISING = "#29b6f6"; // positive & rising — bright blue
const HIST_UP_FALLING = "#1565c0"; // positive & falling — dark blue
const HIST_DN_FALLING = "#f85149"; // negative & falling — bright red
const HIST_DN_RISING = "#7d1f1b"; // negative & rising — dark red

export default function PriceChart({ candles, supertrend, macd }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8b949e",
        fontFamily: "var(--font-geist-mono), monospace",
        panes: { separatorColor: "#30363d", separatorHoverColor: "#484f58" },
      },
      grid: {
        vertLines: { color: "#161b22" },
        horzLines: { color: "#161b22" },
      },
      timeScale: { borderColor: "#30363d", timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: "#30363d" },
      crosshair: { horzLine: { labelBackgroundColor: "#30363d" }, vertLine: { labelBackgroundColor: "#30363d" } },
    });
    chartRef.current = chart;

    const t = (i: number) => candles[i].time as UTCTimestamp;
    type Pt = LineData<UTCTimestamp> | WhitespaceData<UTCTimestamp>;

    // --- price pane (0): candles + supertrend + buy/sell markers --------------
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: GREEN,
      downColor: RED,
      borderUpColor: GREEN,
      borderDownColor: RED,
      wickUpColor: GREEN,
      wickDownColor: RED,
    });
    candleSeries.setData(
      candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close }))
    );

    // Supertrend line flips colour with the trend — drawn as two series with a
    // one-bar overlap at flips so the segments stay visually joined.
    const up: Pt[] = [];
    const down: Pt[] = [];
    const markers: SeriesMarker<UTCTimestamp>[] = [];
    supertrend.value.forEach((v, i) => {
      const time = t(i);
      const dir = supertrend.direction[i];
      if (v == null || dir == null) {
        up.push({ time });
        down.push({ time });
        return;
      }
      const prevDir = i > 0 ? supertrend.direction[i - 1] : null;
      const flipped = prevDir != null && prevDir !== dir;
      up.push(dir === 1 || flipped ? { time, value: v } : { time });
      down.push(dir === -1 || flipped ? { time, value: v } : { time });
      // Kıvanç's buy/sell signals fire on each trend flip
      if (flipped) {
        markers.push(
          dir === 1
            ? { time, position: "belowBar", color: GREEN, shape: "arrowUp", text: "Buy" }
            : { time, position: "aboveBar", color: RED, shape: "arrowDown", text: "Sell" }
        );
      }
    });
    if (up.some((p) => "value" in p))
      chart
        .addSeries(LineSeries, { color: GREEN, lineWidth: 2, priceLineVisible: false, lastValueVisible: false })
        .setData(up);
    if (down.some((p) => "value" in p))
      chart
        .addSeries(LineSeries, { color: RED, lineWidth: 2, priceLineVisible: false, lastValueVisible: false })
        .setData(down);
    if (markers.length) createSeriesMarkers(candleSeries, markers);

    // --- MACD pane (1): histogram + macd line (slope-coloured) + signal -------
    const hist = macd.hist
      .map((h, i) => {
        if (h == null) return null;
        const prev = i > 0 ? macd.hist[i - 1] : null;
        const rising = prev == null || h >= prev;
        const color =
          h >= 0 ? (rising ? HIST_UP_RISING : HIST_UP_FALLING) : rising ? HIST_DN_RISING : HIST_DN_FALLING;
        return { time: t(i), value: h, color };
      })
      .filter((p): p is { time: UTCTimestamp; value: number; color: string } => p != null);

    if (hist.length) {
      const histSeries = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, 1);
      histSeries.setData(hist);

      // MACD line — Chris Moody colours it by SLOPE: green while rising, red
      // while falling. Two series with a one-bar overlap at each slope change
      // keep the line joined.
      const mUp: Pt[] = [];
      const mDn: Pt[] = [];
      let prevDir: 1 | -1 | null = null;
      macd.macd.forEach((m, i) => {
        const time = t(i);
        const prevM = i > 0 ? macd.macd[i - 1] : null;
        if (m == null || macd.signal[i] == null || prevM == null) {
          mUp.push({ time });
          mDn.push({ time });
          prevDir = null;
          return;
        }
        const dir: 1 | -1 = m >= prevM ? 1 : -1;
        const flipped = prevDir != null && prevDir !== dir;
        mUp.push(dir === 1 || flipped ? { time, value: m } : { time });
        mDn.push(dir === -1 || flipped ? { time, value: m } : { time });
        prevDir = dir;
      });
      chart
        .addSeries(LineSeries, { color: GREEN, lineWidth: 2, priceLineVisible: false, lastValueVisible: false }, 1)
        .setData(mUp);
      chart
        .addSeries(LineSeries, { color: RED, lineWidth: 2, priceLineVisible: false, lastValueVisible: false }, 1)
        .setData(mDn);

      const signal = macd.signal
        .map((s, i) => ({ time: t(i), value: s }))
        .filter((p): p is { time: UTCTimestamp; value: number } => p.value != null);
      const sigSeries = chart.addSeries(
        LineSeries,
        { color: YELLOW, lineWidth: 1, priceLineVisible: false, lastValueVisible: true },
        1
      );
      sigSeries.setData(signal);
      sigSeries.createPriceLine({
        price: 0,
        color: "#30363d",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
      });

      const panes = chart.panes();
      if (panes.length > 1) {
        panes[0].setHeight(330);
        panes[1].setHeight(140);
      }
    }

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, supertrend, macd]);

  return <div ref={containerRef} className="h-[500px] w-full" />;
}
