"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  ColorType,
  LineStyle,
  type IChartApi,
  type UTCTimestamp,
  type LineData,
  type WhitespaceData,
} from "lightweight-charts";
import type { Candle } from "@/lib/yahoo";
import type { Supertrend } from "@/lib/indicators";

interface Props {
  candles: Candle[];
  supertrend: Supertrend;
  rsi14: (number | null)[];
}

const GREEN = "#3fb950";
const RED = "#f85149";

export default function PriceChart({ candles, supertrend, rsi14 }: Props) {
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

    // --- price pane (0): candles + supertrend ---------------------------------
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: GREEN,
      downColor: RED,
      borderUpColor: GREEN,
      borderDownColor: RED,
      wickUpColor: GREEN,
      wickDownColor: RED,
    });
    candleSeries.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    // Supertrend is one line that flips colour with the trend. lightweight-charts
    // colours a whole series uniformly, so we draw two series — uptrend (green)
    // and downtrend (red) — using whitespace points to leave gaps where the
    // other trend is active. A one-bar overlap at each flip keeps the line joined.
    type Pt = LineData<UTCTimestamp> | WhitespaceData<UTCTimestamp>;
    const up: Pt[] = [];
    const down: Pt[] = [];
    supertrend.value.forEach((v, i) => {
      const time = candles[i].time as UTCTimestamp;
      const dir = supertrend.direction[i];
      if (v == null || dir == null) {
        up.push({ time });
        down.push({ time });
        return;
      }
      const flipped = i > 0 && supertrend.direction[i - 1] != null && supertrend.direction[i - 1] !== dir;
      up.push(dir === 1 || flipped ? { time, value: v } : { time });
      down.push(dir === -1 || flipped ? { time, value: v } : { time });
    });
    if (up.some((p) => "value" in p)) {
      chart
        .addSeries(LineSeries, { color: GREEN, lineWidth: 2, priceLineVisible: false, lastValueVisible: false })
        .setData(up);
    }
    if (down.some((p) => "value" in p)) {
      chart
        .addSeries(LineSeries, { color: RED, lineWidth: 2, priceLineVisible: false, lastValueVisible: false })
        .setData(down);
    }

    // --- RSI pane (1) ---------------------------------------------------------
    const rsiData = candles
      .map((c, i) => ({ time: c.time as UTCTimestamp, value: rsi14[i] }))
      .filter((p): p is { time: UTCTimestamp; value: number } => p.value != null);
    if (rsiData.length > 0) {
      const rsiSeries = chart.addSeries(
        LineSeries,
        { color: "#a371f7", lineWidth: 1, priceLineVisible: false, lastValueVisible: true },
        1 // paneIndex → separate pane below price
      );
      rsiSeries.setData(rsiData);
      for (const level of [70, 30]) {
        rsiSeries.createPriceLine({
          price: level,
          color: "#30363d",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: String(level),
        });
      }
      // keep the RSI pane compact relative to the price pane
      const panes = chart.panes();
      if (panes.length > 1) {
        panes[0].setHeight(320);
        panes[1].setHeight(120);
      }
    }

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, supertrend, rsi14]);

  return <div ref={containerRef} className="h-[480px] w-full" />;
}
