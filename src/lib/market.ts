// Provider facade with graceful degradation:
//   crypto (X-USD)  -> Binance (no key)
//   everything else -> Twelve Data when TWELVEDATA_API_KEY is set, else Yahoo
//   Yahoo is also the fallback if Twelve Data errors (quota, unknown symbol).
// All results go through the TTL cache so UI polling never bursts the upstreams.

import { cached } from "./cache";
import { getBinanceHistory, getBinanceQuote, isOnBinance, toBinancePair } from "./binance";
import { getTdHistory, getTdQuote, hasTwelveData } from "./twelvedata";
import { getHistory as yahooHistory, getQuote as yahooQuote, type Candle, type Quote, type Range } from "./yahoo";

export type { Candle, Quote, Range };

async function useBinance(symbol: string): Promise<boolean> {
  if (!toBinancePair(symbol)) return false;
  return cached(`binance:has:${symbol}`, 86_400_000, () => isOnBinance(symbol));
}

export async function getQuote(symbol: string): Promise<Quote> {
  return cached(`quote:${symbol}`, 45_000, async () => {
    if (await useBinance(symbol)) return getBinanceQuote(symbol);
    if (hasTwelveData()) {
      try {
        return await getTdQuote(symbol);
      } catch {
        /* fall through to Yahoo */
      }
    }
    return yahooQuote(symbol);
  });
}

export async function getHistory(symbol: string, range: Range): Promise<Candle[]> {
  return cached(`history:${symbol}:${range}`, 90_000, async () => {
    if (await useBinance(symbol)) return getBinanceHistory(symbol, range);
    if (hasTwelveData()) {
      try {
        return await getTdHistory(symbol, range);
      } catch {
        /* fall through to Yahoo */
      }
    }
    return yahooHistory(symbol, range);
  });
}

// Sequential — a parallel burst is what trips upstream rate limiters.
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
