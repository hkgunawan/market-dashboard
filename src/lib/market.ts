// Provider facade with graceful degradation:
//   crypto (X-USD)  -> Binance (no key)
//   everything else -> Twelve Data when TWELVEDATA_API_KEY is set, else Yahoo
//   Yahoo is also the fallback if Twelve Data errors (quota, unknown symbol).
// All results go through the TTL cache so UI polling never bursts the upstreams.

import { cached } from "./cache";
import { getBinanceHistory, getBinanceQuote, toBinancePair } from "./binance";
import { getTdHistory, getTdQuote, hasTwelveData } from "./twelvedata";
import { getHistory as yahooHistory, getQuote as yahooQuote, type Candle, type Quote, type Range } from "./yahoo";

export type { Candle, Quote, Range };

// Crypto symbol in Twelve Data's notation: BTC-USD -> BTC/USD (used as the
// fallback when Binance blocks the caller — e.g. it rejects datacenter IPs,
// so Binance works in local dev but not from Vercel's serverless region).
function toTdCrypto(symbol: string): string {
  return symbol.toUpperCase().replace(/-USD$/, "/USD");
}

export async function getQuote(symbol: string): Promise<Quote> {
  const isCrypto = Boolean(toBinancePair(symbol));
  // crypto (Binance, no limit) stays fresh; stocks/ETFs cache longer to respect Twelve Data's 8 req/min free tier
  const ttl = isCrypto ? 45_000 : 10 * 60_000;
  return cached(`quote:${symbol}`, ttl, async () => {
    if (isCrypto) {
      try {
        return await getBinanceQuote(symbol);
      } catch (e) {
        // Binance is blocked from some hosts (e.g. Vercel) — fall back to Twelve Data
        if (hasTwelveData()) {
          const q = await getTdQuote(toTdCrypto(symbol));
          return { ...q, symbol: symbol.toUpperCase() }; // normalize BTC/USD back to BTC-USD
        }
        throw e;
      }
    }
    if (hasTwelveData()) {
      try {
        return await getTdQuote(symbol);
      } catch (e) {
        try {
          return await yahooQuote(symbol);
        } catch {
          throw e; // surface the Twelve Data error (e.g. rate limit), not Yahoo's 429
        }
      }
    }
    return yahooQuote(symbol);
  });
}

export async function getHistory(symbol: string, range: Range): Promise<Candle[]> {
  const isCrypto = Boolean(toBinancePair(symbol));
  // stocks/ETFs: cache 30 min (daily candles barely move intraday) to stay inside the free-tier quota
  const ttl = isCrypto ? 90_000 : 30 * 60_000;
  return cached(`history:${symbol}:${range}`, ttl, async () => {
    if (isCrypto) {
      try {
        return await getBinanceHistory(symbol, range);
      } catch (e) {
        // Binance is blocked from some hosts (e.g. Vercel) — fall back to Twelve Data
        if (hasTwelveData()) return await getTdHistory(toTdCrypto(symbol), range);
        throw e;
      }
    }
    if (hasTwelveData()) {
      try {
        return await getTdHistory(symbol, range);
      } catch (e) {
        try {
          return await yahooHistory(symbol, range);
        } catch {
          throw e; // surface the Twelve Data error (e.g. rate limit), not Yahoo's 429
        }
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
