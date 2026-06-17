// Finnhub — real-time US stock quotes. Free tier: 60 calls/min, no card, free forever.
// Used for the insider-buys / smart-money tables, which need many prices at once —
// far more headroom than Twelve Data's 8/min. Active only when FINNHUB_API_KEY is set.

import type { Quote } from "./yahoo";

const BASE = "https://finnhub.io/api/v1";

export function hasFinnhub(): boolean {
  return Boolean(process.env.FINNHUB_API_KEY);
}

// Finnhub uses a dot for share classes (BRK.B), but OpenFIGI/EDGAR hand us a
// slash (BRK/B). Normalise so class shares can be priced.
export function toFinnhubSymbol(symbol: string): string {
  return symbol.replace("/", ".").toUpperCase();
}

export async function getFinnhubQuote(symbol: string): Promise<Quote> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) throw new Error("FINNHUB_API_KEY not set");
  const sym = toFinnhubSymbol(symbol);
  const res = await fetch(`${BASE}/quote?symbol=${encodeURIComponent(sym)}&token=${token}`, {
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

// Resolve a company name → US ticker via Finnhub symbol search (free tier).
// Fallback for CUSIPs that OpenFIGI can't map. Prefers a plain US symbol (no
// foreign-exchange suffix like .AS/.TO) and a stock-like instrument type.
export async function searchSymbol(name: string): Promise<string | null> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) return null;
  try {
    const res = await fetch(`${BASE}/search?q=${encodeURIComponent(name)}&token=${token}`, {
      next: { revalidate: 86_400 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: { symbol: string; type?: string }[] };
    const results = data.result ?? [];
    // a US listing has a bare symbol (no "."); foreign listings carry a suffix
    const us = results.filter((r) => r.symbol && !r.symbol.includes("."));
    const stock = us.find((r) => /stock|shrs|share/i.test(r.type ?? ""));
    return (stock ?? us[0])?.symbol ?? null;
  } catch {
    return null;
  }
}
