// Symbol hygiene for the public API routes.
//
// Every route that takes a ticker forwards it to a metered upstream (Twelve Data:
// 8/min, 800/day). Unvalidated input lets one request spend many credits — Twelve
// Data treats "A,B,C,D" as a batch and bills each symbol — and lets random strings
// fill the cache with junk keys. So: one strict shape, checked at the door.
//
// Allowed: letters, digits, and the separators real tickers use —
//   BRK.B  BRK/B  BTC-USD  XAU/USD  ^GSPC  CL=F
// Never a comma, space, or anything URL-ish.
const SYMBOL_RE = /^[A-Z0-9^][A-Z0-9.\-/=^]{0,14}$/;

export function isValidSymbol(symbol: string): boolean {
  return SYMBOL_RE.test(symbol.toUpperCase());
}

// Parse a comma-separated `symbols` query param: trimmed, upper-cased, validated,
// de-duplicated, capped. Invalid entries are dropped rather than failing the batch.
export function parseSymbols(param: string | null, max: number): string[] {
  const out: string[] = [];
  for (const raw of (param ?? "").split(",")) {
    const s = raw.trim().toUpperCase();
    if (s && isValidSymbol(s) && !out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

// Cache-Control for a successful API response. `s-maxage` lets Vercel's CDN answer
// repeat requests without invoking the function at all — the in-memory TTL cache is
// per serverless instance, so on its own it does not stop cold instances from each
// spending upstream quota on the same symbol.
export function cdnCache(seconds: number): { "Cache-Control": string } {
  return { "Cache-Control": `public, s-maxage=${seconds}, stale-while-revalidate=${seconds * 2}` };
}

// A secondary, outbound chart link. The ticker itself still points at this site's
// own chart — that page is the engineering on show — but TradingView is the better
// tool for actually reading a chart, and following it costs no API quota at all.
// TradingView slugs drop the pair separator (BTC/USD, BTC-USD -> BTCUSD) and use a
// dot for share classes (BRK/B -> BRK.B).
export function tradingViewUrl(symbol: string): string {
  const s = symbol.toUpperCase();
  const pair = s.match(/^([A-Z0-9]+)[-/](USD|USDT)$/);
  const slug = pair ? `${pair[1]}${pair[2]}` : s.replace("/", ".");
  return `https://www.tradingview.com/symbols/${encodeURIComponent(slug)}/`;
}
