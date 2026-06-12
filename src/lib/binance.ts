// Binance public API (no key) — primary source for crypto symbols like BTC-USD, ETH-USD.
// USD symbols are served from the USDT pair (1 USDT ≈ 1 USD).

import type { Candle, Quote, Range } from "./yahoo";

const BASE = "https://api.binance.com/api/v3";

export function toBinancePair(symbol: string): string | null {
  const m = symbol.toUpperCase().match(/^([A-Z0-9]{2,10})-USD$/);
  return m ? `${m[1]}USDT` : null;
}

const RANGE_KLINES: Record<Range, { interval: string; limit: number }> = {
  "1d": { interval: "5m", limit: 288 },
  "5d": { interval: "30m", limit: 240 },
  "1mo": { interval: "4h", limit: 186 },
  "6mo": { interval: "1d", limit: 183 },
  "1y": { interval: "1d", limit: 365 },
  "5y": { interval: "1w", limit: 261 },
};

export async function getBinanceQuote(symbol: string): Promise<Quote> {
  const pair = toBinancePair(symbol);
  if (!pair) throw new Error(`${symbol} is not a Binance-style symbol`);
  const res = await fetch(`${BASE}/ticker/24hr?symbol=${pair}`, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`Binance responded ${res.status} for ${pair}`);
  const t: { lastPrice: string; priceChange: string; priceChangePercent: string; closeTime: number } =
    await res.json();
  const price = parseFloat(t.lastPrice);
  const change = parseFloat(t.priceChange);
  return {
    symbol: symbol.toUpperCase(),
    name: symbol.toUpperCase().replace("-USD", ""),
    price,
    prevClose: price - change,
    change,
    changePct: parseFloat(t.priceChangePercent),
    currency: "USD",
    marketTime: Math.floor(t.closeTime / 1000),
  };
}

export async function getBinanceHistory(symbol: string, range: Range): Promise<Candle[]> {
  const pair = toBinancePair(symbol);
  if (!pair) throw new Error(`${symbol} is not a Binance-style symbol`);
  const { interval, limit } = RANGE_KLINES[range];
  const res = await fetch(`${BASE}/klines?symbol=${pair}&interval=${interval}&limit=${limit}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`Binance responded ${res.status} for ${pair}`);
  const rows: [number, string, string, string, string, ...unknown[]][] = await res.json();
  return rows.map((r) => ({
    time: Math.floor(r[0] / 1000),
    open: parseFloat(r[1]),
    high: parseFloat(r[2]),
    low: parseFloat(r[3]),
    close: parseFloat(r[4]),
  }));
}

export async function isOnBinance(symbol: string): Promise<boolean> {
  const pair = toBinancePair(symbol);
  if (!pair) return false;
  const res = await fetch(`${BASE}/exchangeInfo?symbol=${pair}`, { next: { revalidate: 86400 } });
  return res.ok;
}
