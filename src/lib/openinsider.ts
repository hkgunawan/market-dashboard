// OpenInsider screens — free aggregation of SEC Form 4 insider filings.
// Form 4 must be filed within 2 business days of the trade, so this feed is
// near-real-time (vs the quarterly 13F page). We only read purchase screens:
// insiders SELL for a hundred reasons, but BUY for only one.

import { cached } from "./cache";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

export interface InsiderBuy {
  filingDate: string;
  tradeDate: string;
  ticker: string;
  company: string;
  // cluster screen: how many insiders bought; purchases screen: who bought
  insiders: string;
  title: string;
  price: string;
  qty: string;
  deltaOwn: string;
  value: string;
}

function decode(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .trim();
}

// The ticker cell contains tooltip JS before the anchor text — keep what follows the last '>'.
export function cleanTicker(raw: string): string {
  const stripped = raw.replace(/<[^>]+>/g, "").trim();
  const parts = stripped.split(">");
  return parts[parts.length - 1].trim();
}

async function fetchRows(path: string): Promise<string[][]> {
  const res = await fetch(`http://openinsider.com/${path}`, {
    headers: { "User-Agent": UA },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`openinsider ${res.status}`);
  const html = await res.text();
  const table = html.match(/<table[^>]*tinytable[\s\S]*?<\/table>/)?.[0];
  if (!table) throw new Error("openinsider table not found");
  return [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .slice(1) // header
    .map((r) => [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => c[1]));
}

export interface InsiderReport {
  clusterBuys: InsiderBuy[];
  bigBuys: InsiderBuy[];
  generatedAt: string;
}

async function buildReport(): Promise<InsiderReport> {
  const [cluster, buys] = await Promise.all([
    fetchRows("latest-cluster-buys"),
    fetchRows("insider-purchases-25k"),
  ]);

  // cluster: [X, filing, trade, ticker, company, industry, insCount, type, price, qty, owned, dOwn, value, ...]
  const clusterBuys: InsiderBuy[] = cluster
    .filter((c) => c.length >= 13)
    .slice(0, 25)
    .map((c) => ({
      filingDate: decode(c[1]).slice(0, 10),
      tradeDate: decode(c[2]),
      ticker: cleanTicker(c[3]),
      company: decode(c[4]),
      insiders: `${decode(c[6])} insiders`,
      title: decode(c[5]), // industry on this screen
      price: decode(c[8]),
      qty: decode(c[9]),
      deltaOwn: decode(c[11]),
      value: decode(c[12]),
    }));

  // purchases: [X, filing, trade, ticker, company, insiderName, title, type, price, qty, owned, dOwn, value, ...]
  const bigBuys: InsiderBuy[] = buys
    .filter((c) => c.length >= 13)
    .slice(0, 25)
    .map((c) => ({
      filingDate: decode(c[1]).slice(0, 10),
      tradeDate: decode(c[2]),
      ticker: cleanTicker(c[3]),
      company: decode(c[4]),
      insiders: decode(c[5]),
      title: decode(c[6]),
      price: decode(c[8]),
      qty: decode(c[9]),
      deltaOwn: decode(c[11]),
      value: decode(c[12]),
    }));

  return { clusterBuys, bigBuys, generatedAt: new Date().toISOString() };
}

export async function getInsiderReport(): Promise<InsiderReport> {
  return cached("openinsider:report", 30 * 60_000, buildReport);
}
