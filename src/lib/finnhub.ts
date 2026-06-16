// Finnhub — real-time US stock quotes. Free tier: 60 calls/min, no card, free forever.
// Used for the insider-buys / smart-money tables, which need many prices at once —
// far more headroom than Twelve Data's 8/min. Active only when FINNHUB_API_KEY is set.

import type { Quote } from "./yahoo";

const BASE = "https://finnhub.io/api/v1";

export function hasFinnhub(): boolean {
  return Boolean(process.env.FINNHUB_API_KEY);
}

export async function getFinnhubQuote(symbol: string): Promise<Quote> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) throw new Error("FINNHUB_API_KEY not set");
  const res = await fetch(`${BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`, {
    next: { revalidate: 600 },
  });
  if (!res.ok) throw new Error(`Finnhub responded ${res.status} for ${symbol}`);
  const d = (await res.json()) as { c: number; d: number | null; dp: number | null; pc: number; t: number };
  // c = current price; an unknown symbol comes back all-zero
  if (!d || !d.c) throw new Error(`Finnhub: no data for ${symbol}`);
  return {
    symbol: symbol.toUpperCase(),
    name: symbol.toUpperCase(),
    price: d.c,
    prevClose: d.pc,
    change: d.d ?? d.c - d.pc,
    changePct: d.dp ?? 0,
    currency: "USD",
    marketTime: d.t ?? 0,
  };
}
