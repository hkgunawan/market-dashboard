"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Quote } from "@/lib/yahoo";
import type { Supertrend, MacdResult } from "@/lib/indicators";

// One-glance synthesis of everything the dashboard tracks, per watchlist ticker:
// trend (Supertrend) + momentum (MACD) + whether insiders / famous funds are
// buying it. Reuses the existing /api endpoints — no new backend.

interface WatchItem {
  symbol: string;
  label?: string;
}

const DEFAULT_WATCHLIST: WatchItem[] = [
  { symbol: "PAXG-USD", label: "Gold (PAXG)" },
  { symbol: "QQQ", label: "Nasdaq 100 (QQQ)" },
  { symbol: "BTC-USD", label: "Bitcoin" },
];
const STORAGE_KEY = "md.watchlist.v2";

interface Row {
  symbol: string;
  label: string;
  price?: number;
  changePct?: number;
  trend?: 1 | -1 | null;
  momentum?: number | null; // last MACD histogram
  insiders: boolean;
  funds: boolean;
  loading: boolean;
}

const last = <T,>(arr: (T | null)[]): T | null => {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i] as T;
  return null;
};

function readLabel(r: Row): { text: string; cls: string } {
  if (r.trend == null || r.momentum == null) return { text: "—", cls: "text-[#484f58]" };
  const up = r.trend === 1 && r.momentum >= 0;
  const down = r.trend === -1 && r.momentum < 0;
  if (up) return { text: "Bullish", cls: "text-[#3fb950]" };
  if (down) return { text: "Bearish", cls: "text-[#f85149]" };
  return { text: "Mixed", cls: "text-[#d29922]" };
}

export default function Signals() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // watchlist (same store the home page uses)
      let watch: WatchItem[] = DEFAULT_WATCHLIST;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) watch = JSON.parse(raw);
      } catch {
        /* defaults */
      }

      // seed rows so the table renders immediately
      const seed: Row[] = watch.map((w) => ({
        symbol: w.symbol,
        label: w.label ?? w.symbol,
        insiders: false,
        funds: false,
        loading: true,
      }));
      if (!cancelled) setRows(seed);

      // shared lookups: who's being bought by insiders / accumulated by funds
      const [insiderSet, fundSet, quoteMap] = await Promise.all([
        fetch("/api/insider-buys")
          .then((r) => r.json())
          .then((d: { clusterBuys?: { ticker: string }[]; bigBuys?: { ticker: string }[] }) => {
            const s = new Set<string>();
            for (const b of [...(d.clusterBuys ?? []), ...(d.bigBuys ?? [])]) if (b.ticker) s.add(b.ticker.toUpperCase());
            return s;
          })
          .catch(() => new Set<string>()),
        fetch("/api/smart-money")
          .then((r) => r.json())
          .then((d: { topAccumulated?: { ticker: string | null; estDollarsAdded: number }[] }) => {
            const s = new Set<string>();
            for (const i of d.topAccumulated ?? []) if (i.ticker && i.estDollarsAdded > 0) s.add(i.ticker.toUpperCase());
            return s;
          })
          .catch(() => new Set<string>()),
        fetch(`/api/quotes?symbols=${encodeURIComponent(watch.map((w) => w.symbol).join(","))}`)
          .then((r) => r.json())
          .then((d: { quotes?: Quote[] }) => {
            const m = new Map<string, Quote>();
            for (const q of d.quotes ?? []) m.set(q.symbol.toUpperCase(), q);
            return m;
          })
          .catch(() => new Map<string, Quote>()),
      ]);
      if (cancelled) return;

      // per-ticker trend + momentum from the history endpoint
      await Promise.all(
        watch.map(async (w) => {
          const base: Partial<Row> = {
            insiders: insiderSet.has(w.symbol.toUpperCase()),
            funds: fundSet.has(w.symbol.toUpperCase()),
            price: quoteMap.get(w.symbol.toUpperCase())?.price,
            changePct: quoteMap.get(w.symbol.toUpperCase())?.changePct,
          };
          try {
            const h = (await fetch(`/api/history?symbol=${encodeURIComponent(w.symbol)}&range=6mo`).then((r) =>
              r.json()
            )) as { supertrend?: Supertrend; macd?: MacdResult };
            base.trend = h.supertrend ? (last(h.supertrend.direction) as 1 | -1 | null) : null;
            base.momentum = h.macd ? last(h.macd.hist) : null;
          } catch {
            /* leave trend/momentum undefined */
          }
          if (cancelled) return;
          setRows((prev) =>
            prev.map((r) => (r.symbol === w.symbol ? { ...r, ...base, loading: false } : r))
          );
        })
      );
    };

    run().catch(() => !cancelled && setError("failed to load signals"));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-mono text-lg text-[#e6edf3]">
          <span className="text-[#3fb950]">$</span> signals
        </h1>
        <nav className="flex gap-4 font-mono text-xs text-[#8b949e]">
          <Link href="/" className="hover:text-[#e6edf3]">
            ← markets
          </Link>
          <Link href="/insiders" className="text-[#58a6ff] hover:text-[#e6edf3]">
            insider-buys →
          </Link>
          <Link href="/smart-money" className="text-[#d29922] hover:text-[#e6edf3]">
            smart-money →
          </Link>
        </nav>
      </header>

      <p className="mb-2 max-w-3xl font-mono text-xs leading-relaxed text-[#8b949e]">
        Your watchlist at a glance — trend (<span className="text-[#3fb950]">Supertrend</span>), momentum (
        <span className="text-[#a371f7]">MACD</span>), and whether company insiders or famous funds are buying it.
        Edit the watchlist on the <Link href="/" className="text-[#58a6ff] hover:underline">markets</Link> page.{" "}
        <span className="text-[#d29922]">A research overview, not a buy list. Not financial advice.</span>
      </p>
      <p className="mb-6 font-mono text-[11px] leading-relaxed text-[#484f58]">
        Column key — <span className="text-[#8b949e]">Trend</span>: Supertrend up/down ·{" "}
        <span className="text-[#8b949e]">Momentum</span>: MACD histogram (＋ bullish / − bearish) ·{" "}
        <span className="text-[#8b949e]">Insiders</span>: appears on the insider-buys feed ·{" "}
        <span className="text-[#8b949e]">Funds</span>: accumulated by a tracked 13F fund ·{" "}
        <span className="text-[#8b949e]">Read</span>: trend + momentum combined
      </p>

      {error && <p className="py-12 text-center font-mono text-sm text-[#f85149]">{error}</p>}

      <section className="overflow-x-auto rounded-lg border border-[#30363d] bg-[#0d1117]">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[#21262d] font-mono text-[11px] uppercase text-[#484f58]">
              <th className="py-2 pl-3 pr-3">Ticker</th>
              <th className="py-2 pr-3 text-right">Price</th>
              <th className="py-2 pr-3 text-right">Chg</th>
              <th className="py-2 pr-3">Trend</th>
              <th className="py-2 pr-3">Momentum</th>
              <th className="py-2 pr-3">Insiders</th>
              <th className="py-2 pr-3">Funds</th>
              <th className="py-2 pr-3">Read</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const read = readLabel(r);
              return (
                <tr key={r.symbol} className="border-b border-[#161b22]">
                  <td className="py-2.5 pl-3 pr-3">
                    <Link href={`/?symbol=${encodeURIComponent(r.symbol)}`} className="font-mono text-sm text-[#58a6ff] hover:underline">
                      {r.symbol}
                    </Link>
                    <div className="font-mono text-[10px] text-[#484f58]">{r.label}</div>
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono text-xs text-[#e6edf3]">
                    {r.price != null ? `$${r.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : r.loading ? "…" : "—"}
                  </td>
                  <td
                    className={`py-2.5 pr-3 text-right font-mono text-xs ${
                      r.changePct == null ? "text-[#484f58]" : r.changePct >= 0 ? "text-[#3fb950]" : "text-[#f85149]"
                    }`}
                  >
                    {r.changePct != null ? `${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(2)}%` : "—"}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs">
                    {r.trend == null ? (
                      <span className="text-[#484f58]">{r.loading ? "…" : "—"}</span>
                    ) : r.trend === 1 ? (
                      <span className="text-[#3fb950]">▲ up</span>
                    ) : (
                      <span className="text-[#f85149]">▼ down</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs">
                    {r.momentum == null ? (
                      <span className="text-[#484f58]">{r.loading ? "…" : "—"}</span>
                    ) : (
                      <span className={r.momentum >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}>
                        {r.momentum >= 0 ? "＋" : "−"}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs">
                    {r.insiders ? <span className="text-[#3fb950]">● buying</span> : <span className="text-[#484f58]">—</span>}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs">
                    {r.funds ? <span className="text-[#d29922]">● accum.</span> : <span className="text-[#484f58]">—</span>}
                  </td>
                  <td className={`py-2.5 pr-3 font-mono text-xs font-semibold ${read.cls}`}>{read.text}</td>
                </tr>
              );
            })}
            {rows.length === 0 && !error && (
              <tr>
                <td colSpan={8} className="py-16 text-center font-mono text-sm text-[#484f58]">
                  loading watchlist…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <footer className="mt-8 text-center font-mono text-xs text-[#484f58]">
        synthesizes the chart indicators · insider-buys · smart-money · not financial advice
      </footer>
    </main>
  );
}
