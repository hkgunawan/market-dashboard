// SEC EDGAR 13F accumulation tracker.
// Diffs the two most recent 13F-HR filings per fund to find what each fund
// accumulated last quarter, then aggregates across funds.
// EDGAR asks for a descriptive User-Agent and ≤10 req/s; we fetch sequentially
// and cache for 12h (13F data only changes quarterly).

import { cached } from "./cache";

const UA = "market-dashboard personal project hendrakg94@gmail.com";

// Concentrated, conviction-driven managers — deliberately excludes quant giants
// (Renaissance, Bridgewater, Citadel) whose thousands of positions carry no
// per-stock conviction signal and would dwarf the aggregate.
export const FUNDS = [
  { cik: 1067983, name: "Berkshire Hathaway", manager: "Warren Buffett" },
  { cik: 1336528, name: "Pershing Square", manager: "Bill Ackman" },
  { cik: 1536411, name: "Duquesne Family Office", manager: "Stanley Druckenmiller" },
  { cik: 1649339, name: "Scion Asset Management", manager: "Michael Burry" },
  { cik: 1656456, name: "Appaloosa", manager: "David Tepper" },
  { cik: 1040273, name: "Third Point", manager: "Dan Loeb" },
  { cik: 1061768, name: "Baupost Group", manager: "Seth Klarman" },
  { cik: 1029160, name: "Soros Fund Management", manager: "Soros family office" },
  { cik: 1135730, name: "Coatue Management", manager: "Philippe Laffont" },
  { cik: 1167483, name: "Tiger Global", manager: "Chase Coleman" },
] as const;

interface Holding {
  name: string;
  cusip: string;
  shares: number;
  value: number; // USD (13F values are reported in dollars since 2023)
}

export interface FundMove {
  fund: string;
  manager: string;
  type: "NEW" | "ADD" | "TRIM" | "EXIT";
  pctChange: number | null; // null for NEW
  sharesNow: number;
  sharesPrev: number;
  estDollarsMoved: number; // |delta shares| * current avg price
}

export interface IssuerSignal {
  name: string;
  cusip: string;
  buyers: FundMove[];
  sellers: FundMove[];
  score: number;
  estDollarsAdded: number;
}

export interface SmartMoneyReport {
  asOfPeriod: string; // e.g. "2026-03-31"
  comparedTo: string;
  generatedAt: string;
  funds: { name: string; manager: string; period: string; ok: boolean }[];
  topAccumulated: IssuerSignal[];
  topNewPositions: IssuerSignal[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function edgarFetch(url: string): Promise<Response> {
  await sleep(120); // stay politely under EDGAR's rate limit
  return fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
}

async function latestTwo13F(cik: number): Promise<{ acc: string; period: string }[]> {
  const padded = String(cik).padStart(10, "0");
  const res = await edgarFetch(`https://data.sec.gov/submissions/CIK${padded}.json`);
  if (!res.ok) throw new Error(`EDGAR submissions ${res.status} for CIK ${cik}`);
  const data = await res.json();
  const r = data.filings.recent;
  const out: { acc: string; period: string }[] = [];
  for (let i = 0; i < r.form.length && out.length < 2; i++) {
    if (r.form[i] === "13F-HR") out.push({ acc: r.accessionNumber[i], period: r.reportDate[i] });
  }
  return out;
}

async function getHoldings(cik: number, acc: string): Promise<Map<string, Holding>> {
  const accNoDash = acc.replace(/-/g, "");
  const base = `https://www.sec.gov/Archives/edgar/data/${cik}/${accNoDash}`;
  const idxRes = await edgarFetch(`${base}/index.json`);
  if (!idxRes.ok) throw new Error(`EDGAR index ${idxRes.status} for ${acc}`);
  const idx = await idxRes.json();
  const xmlFile = (idx.directory.item as { name: string }[])
    .map((i) => i.name)
    .find((n) => n.endsWith(".xml") && !/primary_doc/i.test(n));
  if (!xmlFile) throw new Error(`no infotable xml in ${acc}`);
  const xmlRes = await edgarFetch(`${base}/${xmlFile}`);
  if (!xmlRes.ok) throw new Error(`EDGAR xml ${xmlRes.status} for ${acc}`);
  const xml = await xmlRes.text();

  // Funds may repeat an issuer across rows (managers, share classes) — aggregate by CUSIP.
  // Skip puts/calls: those are bets, not share accumulation.
  const holdings = new Map<string, Holding>();
  const tableRe = /<(?:\w+:)?infoTable>([\s\S]*?)<\/(?:\w+:)?infoTable>/g;
  const field = (block: string, tag: string) => {
    const m = block.match(new RegExp(`<(?:\\w+:)?${tag}>\\s*([^<]*?)\\s*<`, "i"));
    return m ? m[1] : "";
  };
  for (const [, block] of xml.matchAll(tableRe)) {
    if (field(block, "putCall")) continue;
    if (field(block, "sshPrnamtType").toUpperCase() !== "SH") continue;
    const cusip = field(block, "cusip").toUpperCase();
    if (!cusip) continue;
    const shares = parseInt(field(block, "sshPrnamt"), 10) || 0;
    const value = parseInt(field(block, "value"), 10) || 0;
    const prev = holdings.get(cusip);
    if (prev) {
      prev.shares += shares;
      prev.value += value;
    } else {
      holdings.set(cusip, { name: field(block, "nameOfIssuer"), cusip, shares, value });
    }
  }
  return holdings;
}

function diffFund(
  fund: (typeof FUNDS)[number],
  now: Map<string, Holding>,
  prev: Map<string, Holding>
): { cusip: string; name: string; move: FundMove }[] {
  const moves: { cusip: string; name: string; move: FundMove }[] = [];
  const price = (h: Holding) => (h.shares > 0 ? h.value / h.shares : 0);

  for (const [cusip, h] of now) {
    const old = prev.get(cusip);
    const sharesPrev = old?.shares ?? 0;
    if (h.shares === sharesPrev) continue;
    const delta = h.shares - sharesPrev;
    const type: FundMove["type"] = sharesPrev === 0 ? "NEW" : delta > 0 ? "ADD" : "TRIM";
    moves.push({
      cusip,
      name: h.name,
      move: {
        fund: fund.name,
        manager: fund.manager,
        type,
        pctChange: sharesPrev === 0 ? null : (delta / sharesPrev) * 100,
        sharesNow: h.shares,
        sharesPrev,
        estDollarsMoved: Math.abs(delta) * price(h),
      },
    });
  }
  for (const [cusip, old] of prev) {
    if (now.has(cusip)) continue;
    moves.push({
      cusip,
      name: old.name,
      move: {
        fund: fund.name,
        manager: fund.manager,
        type: "EXIT",
        pctChange: -100,
        sharesNow: 0,
        sharesPrev: old.shares,
        estDollarsMoved: old.value,
      },
    });
  }
  return moves;
}

const MIN_DOLLARS = 20_000_000; // ignore moves below $20M — noise for funds this size

function scoreMove(m: FundMove): number {
  if (m.type === "NEW") return 2;
  if (m.type === "ADD") return m.pctChange !== null && m.pctChange >= 25 ? 1.5 : 1;
  if (m.type === "TRIM") return m.pctChange !== null && m.pctChange <= -50 ? -1 : -0.5;
  return -1.5; // EXIT
}

async function buildReport(): Promise<SmartMoneyReport> {
  const issuers = new Map<string, IssuerSignal>();
  const fundMeta: SmartMoneyReport["funds"] = [];
  let asOfPeriod = "";
  let comparedTo = "";

  for (const fund of FUNDS) {
    try {
      const filings = await latestTwo13F(fund.cik);
      if (filings.length < 2) throw new Error("fewer than two 13F filings");
      const [latest, previous] = filings;
      const [now, prev] = [await getHoldings(fund.cik, latest.acc), await getHoldings(fund.cik, previous.acc)];
      if (latest.period > asOfPeriod) {
        asOfPeriod = latest.period;
        comparedTo = previous.period;
      }
      fundMeta.push({ name: fund.name, manager: fund.manager, period: latest.period, ok: true });

      for (const { cusip, name, move } of diffFund(fund, now, prev)) {
        if (move.estDollarsMoved < MIN_DOLLARS) continue;
        let sig = issuers.get(cusip);
        if (!sig) {
          sig = { name, cusip, buyers: [], sellers: [], score: 0, estDollarsAdded: 0 };
          issuers.set(cusip, sig);
        }
        (move.type === "NEW" || move.type === "ADD" ? sig.buyers : sig.sellers).push(move);
        sig.score += scoreMove(move);
        sig.estDollarsAdded += (move.type === "NEW" || move.type === "ADD" ? 1 : -1) * move.estDollarsMoved;
      }
    } catch {
      fundMeta.push({ name: fund.name, manager: fund.manager, period: "", ok: false });
    }
  }

  const all = [...issuers.values()];
  const topAccumulated = all
    .filter((s) => s.buyers.length > 0)
    .sort((a, b) => b.buyers.length - a.buyers.length || b.score - a.score || b.estDollarsAdded - a.estDollarsAdded)
    .slice(0, 25);
  const topNewPositions = all
    .filter((s) => s.buyers.some((b) => b.type === "NEW"))
    .sort((a, b) => b.estDollarsAdded - a.estDollarsAdded)
    .slice(0, 15);

  return {
    asOfPeriod,
    comparedTo,
    generatedAt: new Date().toISOString(),
    funds: fundMeta,
    topAccumulated,
    topNewPositions,
  };
}

export async function getSmartMoneyReport(): Promise<SmartMoneyReport> {
  return cached("edgar:smart-money", 12 * 60 * 60_000, buildReport);
}
