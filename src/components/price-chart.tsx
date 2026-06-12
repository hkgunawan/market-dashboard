"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  ColorType,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/yahoo";

interface Props {
  candles: Candle[];
  sma50: (number | null)[];
  sma200: (number | null)[];
}

export default function PriceChart({ candles, sma50, sma200 }: Props) {
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

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#3fb950",
      downColor: "#f85149",
      borderUpColor: "#3fb950",
      borderDownColor: "#f85149",
      wickUpColor: "#3fb950",
      wickDownColor: "#f85149",
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

    const lineData = (values: (number | null)[]) =>
      candles
        .map((c, i) => ({ time: c.time as UTCTimestamp, value: values[i] }))
        .filter((p): p is { time: UTCTimestamp; value: number } => p.value != null);

    const ma50 = lineData(sma50);
    if (ma50.length > 0) {
      chart
        .addSeries(LineSeries, { color: "#d29922", lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
        .setData(ma50);
    }
    const ma200 = lineData(sma200);
    if (ma200.length > 0) {
      chart
        .addSeries(LineSeries, { color: "#58a6ff", lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
        .setData(ma200);
    }

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, sma50, sma200]);

  return <div ref={containerRef} className="h-[420px] w-full" />;
}
