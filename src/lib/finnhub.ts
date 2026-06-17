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

export interface CompanyProfile {
  name: string;
  industry: string | null;
  marketCap: number | null; // millions USD
  exchange: string | null;
  weburl: string | null;
  peTTM: number | null;
  high52: number | null;
  low52: number | null;
  divYield: number | null; // percent
  eps: number | null;
}

// Fundamentals snapshot for an equity (free tier: profile2 + basic metrics).
// Returns null for non-equities (crypto, unknown symbols) so the UI can hide it.
export async function getCompanyProfile(symbol: string): Promise<CompanyProfile | null> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) return null;
  const sym = toFinnhubSymbol(symbol);
  try {
    const [pRes, mRes] = await Promise.all([
      fetch(`${BASE}/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${token}`, { next: { revalidate: 86_400 } }),
      fetch(`${BASE}/stock/metric?symbol=${encodeURIComponent(sym)}&metric=all&token=${token}`, {
        next: { revalidate: 86_400 },
      }),
    ]);
    const p = pRes.ok ? await pRes.json() : {};
    if (!p || !p.name) return null; // no profile → not an equity we can describe
    const m = (mRes.ok ? (await mRes.json())?.metric : {}) ?? {};
    return {
      name: p.name,
      industry: p.finnhubIndustry || null,
      marketCap: p.marketCapitalization ?? null,
      exchange: p.exchange || null,
      weburl: p.weburl || null,
      peTTM: m.peTTM ?? null,
      high52: m["52WeekHigh"] ?? null,
      low52: m["52WeekLow"] ?? null,
      divYield: m.dividendYieldIndicatedAnnual ?? null,
      eps: m.epsTTM ?? null,
    };
  } catch {
    return null;
  }
}

// Strip corporate-form noise that breaks Finnhub's search ("ASML HLDG NV" → "ASML").
function cleanCompanyName(name: string): string {
  return name
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(
      /\b(HLDGS?|HOLDINGS?|INC|CORP|CORPORATION|COMPANY|CO|LTD|LP|LLC|PLC|NV|SA|AG|SE|GROUP|GRP|CL|CLASS|DEL|COM|THE|TR|TRUST)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

interface SearchHit {
  symbol: string;
  type?: string;
  description?: string;
}

async function searchCandidates(q: string): Promise<SearchHit[]> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token || !q) return [];
  try {
    const res = await fetch(`${BASE}/search?q=${encodeURIComponent(q)}&token=${token}`, {
      next: { revalidate: 86_400 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { result?: SearchHit[] };
    return data.result ?? [];
  } catch {
    return [];
  }
}

// Resolve a company name → US ticker via Finnhub symbol search (free tier).
// Fallback for CUSIPs that OpenFIGI can't map. Tries the cleaned name, then
// progressively shorter forms, since 13F names carry abbreviations. Accepts a
// hit only if its description shares a word with the company name — guards
// against a shortened query grabbing an unrelated ticker.
export async function searchSymbol(name: string): Promise<string | null> {
  if (!process.env.FINNHUB_API_KEY) return null;
  const cleaned = cleanCompanyName(name);
  const words = cleaned.split(" ").filter(Boolean);
  const wantTokens = words.filter((w) => w.length >= 3).map((w) => w.toLowerCase());
  const matches = (hit: SearchHit) => {
    if (!wantTokens.length) return true; // nothing meaningful to check against
    const desc = (hit.description ?? "").toLowerCase();
    return wantTokens.some((t) => desc.includes(t));
  };

  const queries = [...new Set([cleaned, words.slice(0, 2).join(" "), words[0]])].filter(Boolean);
  for (const q of queries) {
    const cands = await searchCandidates(q);
    // a US listing has a bare symbol (no "."); foreign listings carry a suffix
    const us = cands.filter((r) => r.symbol && !r.symbol.includes(".") && matches(r));
    const stock = us.find((r) => /stock|shrs|share/i.test(r.type ?? ""));
    const pick = (stock ?? us[0])?.symbol;
    if (pick) return pick;
  }
  return null;
}
