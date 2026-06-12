// Server-side fetchers for Yahoo Finance's public chart API (unofficial, no key).
// Always called from route handlers — never from the browser (CORS + UA requirements).

const YF_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  currency: string;
  marketTime: number;
}

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

export type Range = "1d" | "5d" | "1mo" | "6mo" | "1y" | "5y";

const RANGE_INTERVAL: Record<Range, string> = {
  "1d": "5m",
  "5d": "30m",
  "1mo": "1d",
  "6mo": "1d",
  "1y": "1d",
  "5y": "1wk",
};

interface YahooChartResponse {
  chart: {
    result?: Array<{
      meta: {
        symbol: string;
        shortName?: string;
        longName?: string;
        regularMarketPrice: number;
        chartPreviousClose?: number;
        previousClose?: number;
        currency?: string;
        regularMarketTime?: number;
      };
      timestamp?: number[];
      indicators: {
        quote: Array<{
          open: (number | null)[];
          high: (number | null)[];
          low: (number | null)[];
          close: (number | null)[];
        }>;
      };
    }>;
    error?: { code: string; description: string } | null;
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchChart(symbol: string, range: Range): Promise<YahooChartResponse> {
  const interval = RANGE_INTERVAL[range];
  const url = `${YF_BASE}/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  // Yahoo rate-limits bursts; retry once with backoff on 429.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      next: { revalidate: 60 },
    });
    if (res.ok) return res.json();
    if (res.status === 429 && attempt < 2) {
      await sleep(700 * (attempt + 1));
      continue;
    }
    throw new Error(`Yahoo responded ${res.status} for ${symbol}`);
  }
}

export async function getQuote(symbol: string): Promise<Quote> {
  const data = await fetchChart(symbol, "1d");
  const result = data.chart.result?.[0];
  if (!result) throw new Error(data.chart.error?.description ?? `No data for ${symbol}`);
  const m = result.meta;
  const prevClose = m.chartPreviousClose ?? m.previousClose ?? m.regularMarketPrice;
  const change = m.regularMarketPrice - prevClose;
  return {
    symbol: m.symbol,
    name: m.shortName ?? m.longName ?? m.symbol,
    price: m.regularMarketPrice,
    prevClose,
    change,
    changePct: prevClose ? (change / prevClose) * 100 : 0,
    currency: m.currency ?? "USD",
    marketTime: m.regularMarketTime ?? 0,
  };
}

export async function getHistory(symbol: string, range: Range): Promise<Candle[]> {
  const data = await fetchChart(symbol, range);
  const result = data.chart.result?.[0];
  if (!result?.timestamp) throw new Error(data.chart.error?.description ?? `No data for ${symbol}`);
  const q = result.indicators.quote[0];
  const candles: Candle[] = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if (o == null || h == null || l == null || c == null) continue;
    candles.push({ time: result.timestamp[i], open: o, high: h, low: l, close: c });
  }
  return candles;
}
