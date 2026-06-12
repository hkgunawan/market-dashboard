// Twelve Data — stocks, ETFs, forex/metals (XAU/USD). Free tier: 8 req/min, 800/day.
// Active only when TWELVEDATA_API_KEY is set; the TTL cache keeps us inside the quota.

import type { Candle, Quote, Range } from "./yahoo";

const BASE = "https://api.twelvedata.com";

export function hasTwelveData(): boolean {
  return Boolean(process.env.TWELVEDATA_API_KEY);
}

const RANGE_SERIES: Record<Range, { interval: string; outputsize: number }> = {
  "1d": { interval: "5min", outputsize: 288 },
  "5d": { interval: "30min", outputsize: 240 },
  "1mo": { interval: "1day", outputsize: 22 },
  "6mo": { interval: "1day", outputsize: 130 },
  "1y": { interval: "1day", outputsize: 252 },
  "5y": { interval: "1week", outputsize: 260 },
};

interface TdError {
  status?: string;
  code?: number;
  message?: string;
}

async function td<T>(path: string, params: Record<string, string>): Promise<T> {
  const apikey = process.env.TWELVEDATA_API_KEY;
  if (!apikey) throw new Error("TWELVEDATA_API_KEY not set");
  const qs = new URLSearchParams({ ...params, apikey, timezone: "UTC" });
  const res = await fetch(`${BASE}${path}?${qs}`, { next: { revalidate: 45 } });
  const data = (await res.json()) as T & TdError;
  if (!res.ok || data.status === "error") {
    throw new Error(`Twelve Data: ${data.message ?? res.status}`);
  }
  return data;
}

export async function getTdQuote(symbol: string): Promise<Quote> {
  const q = await td<{
    symbol: string;
    name?: string;
    close: string;
    previous_close: string;
    change: string;
    percent_change: string;
    currency?: string;
    timestamp?: number;
  }>("/quote", { symbol });
  return {
    symbol: symbol.toUpperCase(),
    name: q.name ?? symbol.toUpperCase(),
    price: parseFloat(q.close),
    prevClose: parseFloat(q.previous_close),
    change: parseFloat(q.change),
    changePct: parseFloat(q.percent_change),
    currency: q.currency ?? "USD",
    marketTime: q.timestamp ?? 0,
  };
}

export async function getTdHistory(symbol: string, range: Range): Promise<Candle[]> {
  const { interval, outputsize } = RANGE_SERIES[range];
  const data = await td<{
    values: { datetime: string; open: string; high: string; low: string; close: string }[];
  }>("/time_series", { symbol, interval, outputsize: String(outputsize) });
  return (data.values ?? [])
    .map((v) => ({
      // datetime is UTC (we pass timezone=UTC); daily values have no time part
      time: Math.floor(Date.parse(v.datetime.includes(":") ? `${v.datetime}Z` : `${v.datetime}T00:00:00Z`) / 1000),
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
    }))
    .reverse(); // Twelve Data returns newest-first
}
