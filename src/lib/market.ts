// Provider facade: crypto (X-USD) is served by Binance, everything else by Yahoo.
// All results go through the TTL cache so UI polling never bursts the upstreams.

import { cached } from "./cache";
import { getBinanceHistory, getBinanceQuote, isOnBinance, toBinancePair } from "./binance";
import { getHistory as yahooHistory, getQuote as yahooQuote, type Candle, type Quote, type Range } from "./yahoo";

export type { Candle, Quote, Range };

async function useBinance(symbol: string): Promise<boolean> {
  if (!toBinancePair(symbol)) return false;
  return cached(`binance:has:${symbol}`, 86_400_000, () => isOnBinance(symbol));
}

export async function getQuote(symbol: string): Promise<Quote> {
  return cached(`quote:${symbol}`, 45_000, async () =>
    (await useBinance(symbol)) ? getBinanceQuote(symbol) : yahooQuote(symbol)
  );
}

export async function getHistory(symbol: string, range: Range): Promise<Candle[]> {
  return cached(`history:${symbol}:${range}`, 90_000, async () =>
    (await useBinance(symbol)) ? getBinanceHistory(symbol, range) : yahooHistory(symbol, range)
  );
}

// Sequential with a small stagger — a parallel burst of Yahoo calls trips its rate limiter.
export async function getQuotes(symbols: string[]): Promise<{ quotes: Quote[]; failed: string[] }> {
  const quotes: Quote[] = [];
  const failed: string[] = [];
  for (const symbol of symbols) {
    try {
      quotes.push(await getQuote(symbol));
    } catch {
      failed.push(symbol);
    }
  }
  return { quotes, failed };
}
