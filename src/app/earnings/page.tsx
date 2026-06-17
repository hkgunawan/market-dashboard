"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { EarningsInfo } from "@/lib/finnhub";

// Upcoming earnings dates for the watchlist's stocks, with each company's recent
// beat/miss track record. Crypto and ETFs (no earnings) are omitted. Reuses the
// same watchlist the rest of the app shares — no separate state.

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

const HOUR_LABEL: Record<string, string> = { bmo: "before open", amc: "after close", dmh: "during hours" };
const HOUR_SHORT: Record<string, string> = { bmo: "BMO", amc: "AMC", dmh: "DMH" };

function fmtRev(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n}`;
}

function daysUntil(date: string): number {
  return Math.round((new Date(date + "T00:00:00").getTime() - Date.now()) / 86_400_000);
}

function whenLabel(date: string): string {
  const d = daysUntil(date);
  if (d < 0) return "reported";
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d <= 14) return `in ${d}d`;
  return `in ${Math.round(d / 7)}w`;
}

const fmtDate = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function Earnings() {
  const [earnings, setEarnings] = useState<EarningsInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let watch: WatchItem[] = DEFAULT_WATCHLIST;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) watch = JSON.parse(raw);
    } catch {
      /* defaults */
    }
    const symbols = watch.map((w) => w.symbol).join(",");
    fetch(`/api/earnings?symbols=${encodeURIComponent(symbols)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) setError(data.error ?? "failed to load");
        else setEarnings(data.earnings ?? []);
      })
      .catch(() => setError("failed to load"));
  }, []);

  // soonest report first; companies with no scheduled date go last
  const sorted = [...(earnings ?? [])].sort((a, b) => {
    if (a.nextDate && b.nextDate) return a.nextDate.localeCompare(b.nextDate);
    if (a.nextDate) return -1;
    if (b.nextDate) return 1;
    return 0;
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-mono text-lg text-[#e6edf3]">
          <span className="text-[#3fb950]">$</span> earnings
        </h1>
        <nav className="flex gap-4 font-mono text-xs text-[#8b949e]">
          <Link href="/" className="hover:text-[#e6edf3]">
            ← markets
          </Link>
          <Link href="/signals" className="text-[#3fb950] hover:text-[#e6edf3]">
            signals →
          </Link>
          <Link href="/insiders" className="text-[#58a6ff] hover:text-[#e6edf3]">
            insider-buys →
          </Link>
          <Link href="/smart-money" className="text-[#d29922] hover:text-[#e6edf3]">
            smart-money →
          </Link>
        </nav>
      </header>

      <p className="mb-3 max-w-3xl font-mono text-xs leading-relaxed text-[#8b949e]">
        When the stocks on your watchlist next report earnings, with each company&apos;s recent beat/miss record. Edit
        the watchlist on the <Link href="/" className="text-[#58a6ff] hover:underline">markets</Link> page. Crypto and
        ETFs are omitted (no earnings). <span className="text-[#d29922]">Estimates can move; not financial advice.</span>
      </p>
      <p className="mb-6 font-mono text-[11px] leading-relaxed text-[#7d8590]">
        Column key — <span className="text-[#8b949e]">When</span>:{" "}
        <span className="text-[#8b949e]">BMO</span> before open / <span className="text-[#8b949e]">AMC</span> after
        close · <span className="text-[#8b949e]">EPS est</span> / <span className="text-[#8b949e]">Rev est</span>:
        consensus for the upcoming quarter · <span className="text-[#8b949e]">Last</span>: most recent EPS surprise vs
        estimate · <span className="text-[#8b949e]">Track record</span>: last 4 quarters (▲ beat / ▼ miss)
      </p>

      {error && <p className="py-12 text-center font-mono text-sm text-[#f85149]">{error}</p>}

      {!earnings && !error && (
        <div className="py-16 text-center font-mono text-sm text-[#8b949e]">
          <p>checking the earnings calendar…</p>
          <div className="mx-auto mt-6 h-1 w-48 animate-pulse rounded bg-[#21262d]" />
        </div>
      )}

      {earnings && sorted.length === 0 && !error && (
        <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-8 text-center font-mono text-sm text-[#8b949e]">
          <p>No stocks with earnings on your watchlist.</p>
          <p className="mt-2 text-xs text-[#7d8590]">
            Add a company like <span className="text-[#e6edf3]">AAPL</span> or{" "}
            <span className="text-[#e6edf3]">NVDA</span> on the{" "}
            <Link href="/" className="text-[#58a6ff] hover:underline">
              markets
            </Link>{" "}
            page — crypto and ETFs don&apos;t report earnings.
          </p>
        </div>
      )}

      {earnings && sorted.length > 0 && (
        <section className="overflow-x-auto rounded-lg border border-[#30363d] bg-[#0d1117]">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#21262d] font-mono text-[11px] uppercase text-[#7d8590]">
                <th className="py-2 pl-3 pr-3">Ticker</th>
                <th className="py-2 pr-3">When</th>
                <th className="py-2 pr-3 text-right">EPS est</th>
                <th className="py-2 pr-3 text-right">Rev est</th>
                <th className="py-2 pr-3 text-right">Last</th>
                <th className="py-2 pr-3">Track record</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => {
                const last = e.history[0];
                return (
                  <tr key={e.symbol} className="border-b border-[#161b22]">
                    <td className="py-2.5 pl-3 pr-3">
                      <Link
                        href={`/?symbol=${encodeURIComponent(e.symbol)}`}
                        className="font-mono text-sm text-[#58a6ff] hover:underline"
                      >
                        {e.symbol}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs">
                      {e.nextDate ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="text-[#e6edf3]">{fmtDate(e.nextDate)}</span>
                          <span
                            className={
                              daysUntil(e.nextDate) <= 7 ? "text-[#d29922]" : "text-[#8b949e]"
                            }
                          >
                            {whenLabel(e.nextDate)}
                          </span>
                          {e.nextHour && HOUR_SHORT[e.nextHour] && (
                            <span
                              className="rounded border border-[#21262d] px-1 py-0.5 text-[10px] text-[#7d8590]"
                              title={HOUR_LABEL[e.nextHour]}
                            >
                              {HOUR_SHORT[e.nextHour]}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-[#7d8590]">not scheduled</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-xs text-[#e6edf3]">
                      {e.epsEstimate != null ? `$${e.epsEstimate.toFixed(2)}` : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-xs text-[#8b949e]">{fmtRev(e.revenueEstimate)}</td>
                    <td className="py-2.5 pr-3 text-right font-mono text-xs">
                      {last?.surprisePercent != null ? (
                        <span className={last.surprisePercent >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}>
                          {last.surprisePercent >= 0 ? "+" : ""}
                          {last.surprisePercent.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-[#7d8590]">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="inline-flex gap-1 font-mono text-xs">
                        {e.history.length === 0 && <span className="text-[#7d8590]">—</span>}
                        {e.history
                          .slice()
                          .reverse()
                          .map((h, i) => (
                            <span
                              key={i}
                              className={
                                h.surprisePercent == null
                                  ? "text-[#7d8590]"
                                  : h.surprisePercent >= 0
                                    ? "text-[#3fb950]"
                                    : "text-[#f85149]"
                              }
                              title={`${h.period}: ${
                                h.surprisePercent == null ? "n/a" : `${h.surprisePercent >= 0 ? "beat" : "miss"} ${h.surprisePercent.toFixed(1)}%`
                              }`}
                            >
                              {h.surprisePercent == null ? "·" : h.surprisePercent >= 0 ? "▲" : "▼"}
                            </span>
                          ))}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <footer className="mt-8 text-center font-mono text-xs text-[#7d8590]">
        source: Finnhub earnings calendar · estimates are consensus · not financial advice
      </footer>
    </main>
  );
}
