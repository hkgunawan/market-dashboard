// Checks a generated brief against the data it was written from.
//
// Why this exists: the brief is an LLM writing about SEC filings. The failure
// that matters on a finance page is not bad prose. It's a confident sentence
// with a ticker that wasn't in the feed or a dollar figure that doesn't exist.
// looksComplete() catches truncation. This catches made-up content.
//
// Three checks, all deterministic and offline (no second LLM call):
//   1. tickers   — every ticker-looking token must be one of the rows sent
//   2. figures   — every dollar amount must match a row's value, within the
//                  precision the sentence itself uses ("$40.39 million" ≈ ±$10k)
//   3. advice    — no buy/sell recommendations or price forecasts
//
// Used in two places: write-brief.ts (a failed check keeps yesterday's brief)
// and the eval script (pass rate across saved real feeds).

import type { InsiderBuy } from "./openinsider";

export interface CheckResult {
  ok: boolean;
  problems: string[];
}

// Upper-case tokens that are ordinary words in this domain, not tickers.
// Keep this list short and specific. Anything not here and not in the feed
// counts as an invented ticker, which is the safe direction to fail in.
const NOT_TICKERS = new Set([
  "A", "I", "SEC", "CEO", "CFO", "COO", "CTO", "EVP", "SVP", "VP", "GC",
  "US", "USA", "U.S", "LLC", "LP", "INC", "PLC", "NV", "SA", "AG", "REIT",
  "ETF", "IPO", "EPS", "NYSE", "AI", "M", "B", "K", "Q1", "Q2", "Q3", "Q4",
]);

/**
 * Ticker-looking tokens in the text: 1–5 capitals, optionally a class suffix
 * (BRK.B). Mixed-case words like "REITs" don't match, which is intended.
 */
export function findTickers(text: string): string[] {
  const found = text.match(/\b[A-Z]{1,5}(?:\.[A-Z])?\b/g) ?? [];
  return [...new Set(found)].filter((t) => !NOT_TICKERS.has(t));
}

/** "+$4,941,950" → 4941950. Returns null when the cell isn't a dollar value. */
export function parseValue(cell: string): number | null {
  const n = Number(cell.replace(/[^0-9.]/g, ""));
  return cell.includes("$") && Number.isFinite(n) && n > 0 ? n : null;
}

export interface Figure {
  raw: string;
  amount: number;
  /** How far off the true value can be and still round to what was written. */
  tolerance: number;
}

const SCALE: Record<string, number> = {
  k: 1e3, thousand: 1e3,
  m: 1e6, mm: 1e6, million: 1e6,
  b: 1e9, bn: 1e9, billion: 1e9,
};

/**
 * Dollar figures in the text with their implied precision.
 * "$40.39 million" has two decimals of a million → ±$5,000.
 * "$1,074,337" is exact → ±$1.
 */
export function findFigures(text: string): Figure[] {
  const re = /\$\s?(\d[\d,]*(?:\.(\d+))?)\s*(thousand|million|billion|bn|mm|[kmb])?\b/gi;
  const out: Figure[] = [];
  for (const m of text.matchAll(re)) {
    const decimals = m[2]?.length ?? 0;
    const scale = m[3] ? SCALE[m[3].toLowerCase()] : 1;
    const amount = Number(m[1].replace(/,/g, "")) * scale;
    // One unit of the last written digit, so both rounding ($30.67M) and
    // truncation ($30.66M for $30,666,320 — seen on real output) pass.
    // Exact figures get $1 of slack.
    const tolerance = scale === 1 ? 1 : scale / 10 ** decimals;
    out.push({ raw: m[0].trim(), amount, tolerance });
  }
  return out;
}

// Phrases that turn a description into a recommendation or a forecast.
// Plain "buy"/"bought" is NOT here: the whole feed is insider buys.
const ADVICE = [
  /\b(you|investors|readers) (should|could|might want to) (buy|sell|consider)\b/i,
  /\b(we|i) (recommend|suggest)\b/i,
  /\b(strong buy|buy signal|sell signal|buy now|price target)\b/i,
  /\b(undervalued|overvalued|bullish|bearish)\b/i,
  /\bwill (rise|soar|rally|climb|jump|surge|fall|drop)\b/i,
  /\bguarantee[ds]?\b/i,
];

/**
 * Validate a brief against the exact rows the model was shown.
 * Pass the same sliced rows that went into the prompt, not the whole feed:
 * a ticker from row 40 can only appear if the model invented it.
 */
export function checkBrief(text: string, rows: InsiderBuy[]): CheckResult {
  const problems: string[] = [];

  const known = new Set(rows.map((r) => r.ticker.toUpperCase()));
  for (const t of findTickers(text)) {
    if (!known.has(t)) problems.push(`unknown ticker: ${t}`);
  }

  const values = rows.map((r) => parseValue(r.value)).filter((v): v is number => v !== null);
  for (const f of findFigures(text)) {
    const match = values.some((v) => Math.abs(v - f.amount) <= f.tolerance);
    if (!match) problems.push(`figure not in data: ${f.raw}`);
  }

  for (const re of ADVICE) {
    const hit = text.match(re);
    if (hit) problems.push(`advice language: "${hit[0]}"`);
  }

  return { ok: problems.length === 0, problems };
}
