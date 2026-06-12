// CoinGlass v4 API — Bitcoin spot ETF daily net flows. Key-gated (free Hobbyist
// plan at coinglass.com). The exact response shape varies between API versions,
// so normalization is deliberately tolerant and surfaces raw keys on failure.

import { cached } from "./cache";

export interface EtfFlowDay {
  date: string; // YYYY-MM-DD
  netFlowUsd: number;
  priceUsd: number | null;
}

export function hasCoinglass(): boolean {
  return Boolean(process.env.COINGLASS_API_KEY);
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

function toDate(n: number): string {
  const ms = n > 1e12 ? n : n * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

async function fetchFlows(): Promise<EtfFlowDay[]> {
  const key = process.env.COINGLASS_API_KEY;
  if (!key) throw new Error("COINGLASS_API_KEY not set");
  const res = await fetch("https://open-api-v4.coinglass.com/api/etf/bitcoin/flow-history", {
    headers: { accept: "application/json", "CG-API-KEY": key },
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error(`CoinGlass HTTP ${res.status}`);
  if (String(body.code) !== "0") throw new Error(`CoinGlass: ${body.msg ?? `code ${body.code}`}`);

  const rows: Record<string, unknown>[] = Array.isArray(body.data) ? body.data : [];
  if (rows.length === 0) throw new Error("CoinGlass: empty data");

  const days: EtfFlowDay[] = [];
  for (const row of rows) {
    const ts = pickNumber(row, ["timestamp", "ts", "date", "time"]);
    const flow = pickNumber(row, ["flow_usd", "flowUsd", "changeUsd", "change_usd", "netInflow", "total_flow_usd"]);
    if (ts === null || flow === null) {
      throw new Error(`CoinGlass: unrecognized row shape — keys: ${Object.keys(row).join(", ")}`);
    }
    days.push({
      date: toDate(ts),
      netFlowUsd: flow,
      priceUsd: pickNumber(row, ["price_usd", "priceUsd", "price"]),
    });
  }
  days.sort((a, b) => (a.date < b.date ? -1 : 1));
  return days;
}

export async function getEtfFlows(): Promise<EtfFlowDay[]> {
  return cached("coinglass:etf-flows", 60 * 60_000, fetchFlows);
}
