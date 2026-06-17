"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { InsiderBuy, InsiderReport } from "@/lib/openinsider";
import { useTableSort, SortTh } from "@/components/sortable";

function parsePrice(s: string): number | null {
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// "Am I too late?" — current price vs what the insider actually paid.
// Lower = you'd pay near their entry; high = the move already happened (you'd be chasing).
function VsNow({ buy, now }: { buy: number | null; now: number | undefined }) {
  if (buy == null) return <span className="font-mono text-xs text-[#484f58]">—</span>;
  if (now == null) return <span className="font-mono text-xs text-[#484f58]" title="needs TWELVEDATA_API_KEY for US stock prices">—</span>;
  const pct = ((now - buy) / buy) * 100;
  const color = pct <= 10 ? "text-[#3fb950]" : pct <= 40 ? "text-[#d29922]" : "text-[#f85149]";
  return (
    <span className={`font-mono text-xs ${color}`} title={`insider paid ~$${buy.toFixed(2)}, now $${now.toFixed(2)}`}>
      {pct >= 0 ? "+" : ""}
      {pct.toFixed(0)}%
    </span>
  );
}

function BuyTable({
  rows,
  whoLabel,
  prices,
  isCluster = false,
}: {
  rows: InsiderBuy[];
  whoLabel: string;
  prices: Record<string, number>;
  isCluster?: boolean;
}) {
  const num = (s: string) => {
    const n = parseFloat(s.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  const { sorted, sort, toggle } = useTableSort<InsiderBuy>(
    rows,
    {
      filingDate: (r) => r.filingDate,
      ticker: (r) => r.ticker,
      company: (r) => r.company,
      who: (r) => {
        const n = parseInt(r.insiders, 10);
        return Number.isFinite(n) ? n : r.insiders;
      },
      price: (r) => num(r.price),
      now: (r) => prices[r.ticker] ?? null,
      vsnow: (r) => {
        const buy = parsePrice(r.price);
        const now = prices[r.ticker];
        return buy != null && now != null ? ((now - buy) / buy) * 100 : null;
      },
      deltaOwn: (r) => num(r.deltaOwn),
      value: (r) => num(r.value),
    },
    { key: "value", dir: "desc" }
  );

  return (
    <table className="w-full text-left">
      <thead>
        <tr className="border-b border-[#21262d] font-mono text-[11px] uppercase text-[#484f58]">
          <SortTh label="Filed" sortKey="filingDate" sort={sort} onSort={toggle} className="py-2 pr-3" />
          <SortTh label="Ticker" sortKey="ticker" sort={sort} onSort={toggle} className="py-2 pr-3" />
          <SortTh label="Company" sortKey="company" sort={sort} onSort={toggle} className="py-2 pr-3" />
          <SortTh label={whoLabel} sortKey="who" sort={sort} onSort={toggle} className="py-2 pr-3" />
          <SortTh label="Paid" sortKey="price" sort={sort} onSort={toggle} className="py-2 pr-3 text-right" />
          <SortTh label="Now" sortKey="now" sort={sort} onSort={toggle} title="current price now" className="py-2 pr-3 text-right" />
          <SortTh
            label="vs now"
            sortKey="vsnow"
            sort={sort}
            onSort={toggle}
            title="current price vs what the insider paid"
            className="py-2 pr-3 text-right"
          />
          <SortTh
            label="ΔOwn"
            sortKey="deltaOwn"
            sort={sort}
            onSort={toggle}
            title="ΔOwn = how much this buy changed the insider's stake (e.g. +50% = grew their holding by half)"
            className="py-2 pr-3 text-right"
          />
          <SortTh label="Value" sortKey="value" sort={sort} onSort={toggle} className="py-2 text-right" />
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => (
          <tr key={i} className="border-b border-[#161b22]">
            <td className="py-2 pr-3 font-mono text-xs text-[#8b949e]">{r.filingDate}</td>
            <td className="py-2 pr-3 font-mono text-sm">
              {r.ticker ? (
                <span className="inline-flex items-center gap-1">
                  <Link
                    href={`/?symbol=${encodeURIComponent(r.ticker)}`}
                    className="text-[#58a6ff] hover:underline"
                    title={`chart ${r.ticker}`}
                  >
                    {r.ticker}
                  </Link>
                  <a
                    href={`http://openinsider.com/screener?s=${encodeURIComponent(r.ticker)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#58a6ff] hover:underline"
                    title="see the individual filers on openinsider"
                  >
                    ↗
                  </a>
                </span>
              ) : (
                <span className="text-[#58a6ff]">{r.ticker}</span>
              )}
            </td>
            <td className="max-w-[14rem] truncate py-2 pr-3 text-sm text-[#e6edf3]" title={r.company}>
              {r.company}
            </td>
            <td
              className="max-w-[11rem] py-2 pr-3 text-xs text-[#8b949e]"
              title={isCluster ? `${r.insiders} bought — open ↗ for their names · sector: ${r.title}` : `${r.insiders} ${r.title}`}
            >
              {isCluster ? (
                <div className="flex flex-col items-start gap-0.5">
                  <span>
                    {r.insiders}
                    {r.ticker && (
                      <a
                        href={`http://openinsider.com/screener?s=${encodeURIComponent(r.ticker)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1.5 text-[#58a6ff] hover:underline"
                        title="see who the insiders are on openinsider"
                      >
                        who? ↗
                      </a>
                    )}
                  </span>
                  {r.title && (
                    <span className="rounded border border-[#21262d] px-1 py-0.5 text-[10px] text-[#484f58]">
                      {r.title}
                    </span>
                  )}
                </div>
              ) : (
                <span className="truncate">
                  {r.insiders}
                  {r.title && <span className="text-[#484f58]"> · {r.title}</span>}
                </span>
              )}
            </td>
            <td className="py-2 pr-3 text-right font-mono text-xs text-[#e6edf3]">{r.price}</td>
            <td className="py-2 pr-3 text-right font-mono text-xs text-[#e6edf3]">
              {prices[r.ticker] != null ? `$${prices[r.ticker].toFixed(2)}` : "—"}
            </td>
            <td className="py-2 pr-3 text-right">
              <VsNow buy={parsePrice(r.price)} now={prices[r.ticker]} />
            </td>
            <td className="py-2 pr-3 text-right font-mono text-xs text-[#3fb950]">{r.deltaOwn}</td>
            <td className="py-2 text-right font-mono text-xs text-[#3fb950]">{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Insiders() {
  const [report, setReport] = useState<InsiderReport | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/insider-buys")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) setError(data.error ?? "failed to load");
        else setReport(data);
      })
      .catch(() => setError("failed to load"));
  }, []);

  // current prices for the listed tickers → "vs now" column (US equities need a Twelve Data key)
  useEffect(() => {
    if (!report) return;
    const tickers = [...new Set([...report.clusterBuys, ...report.bigBuys].map((r) => r.ticker))].filter(Boolean);
    if (tickers.length === 0) return;
    fetch(`/api/prices?symbols=${encodeURIComponent(tickers.join(","))}`)
      .then((res) => res.json())
      .then((data: { quotes?: { symbol: string; price: number }[] }) => {
        const map: Record<string, number> = {};
        for (const q of data.quotes ?? []) map[q.symbol.toUpperCase()] = q.price;
        setPrices(map);
      })
      .catch(() => {});
  }, [report]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-mono text-lg text-[#e6edf3]">
          <span className="text-[#3fb950]">$</span> insider-buys
        </h1>
        <nav className="flex gap-4 font-mono text-xs text-[#8b949e]">
          <Link href="/" className="hover:text-[#e6edf3]">
            ← markets
          </Link>
          <Link href="/smart-money" className="text-[#d29922] hover:text-[#e6edf3]">
            smart-money →
          </Link>
        </nav>
      </header>

      <p className="mb-3 font-mono text-xs leading-relaxed text-[#8b949e]">
        Open-market purchases by company insiders (CEOs, CFOs, directors) from SEC Form 4 filings — filed within{" "}
        <span className="text-[#e6edf3]">2 business days</span> of the trade, so this feed is near-real-time.{" "}
        Insiders sell for many reasons, but buy with their own money for only one. The{" "}
        <span className="text-[#e6edf3]">vs now</span> column shows the current price against what the insider paid —
        green means you&apos;d buy near their entry, red means the move already happened.{" "}
        <span className="text-[#d29922]">A signal to research, not a buy list. Not financial advice.</span>
      </p>

      <p className="mb-6 font-mono text-[11px] leading-relaxed text-[#484f58]">
        Column key — <span className="text-[#8b949e]">Paid</span>: price the insider paid ·{" "}
        <span className="text-[#8b949e]">vs now</span>: today&apos;s price vs that ·{" "}
        <span className="text-[#8b949e]">ΔOwn</span>: how much this trade changed their stake (e.g. +50% = grew their
        holding by half) · <span className="text-[#8b949e]">Value</span>: total dollars bought
      </p>

      {error && <p className="py-12 text-center font-mono text-sm text-[#f85149]">{error}</p>}
      {!report && !error && (
        <div className="py-16 text-center font-mono text-sm text-[#8b949e]">
          <p>reading Form 4 filings…</p>
          <div className="mx-auto mt-6 h-1 w-48 animate-pulse rounded bg-[#21262d]" />
        </div>
      )}

      {report && (
        <>
          <section className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
            <h2 className="mb-1 font-mono text-xs uppercase tracking-wider text-[#8b949e]">
              Cluster buys — multiple insiders buying the same stock
            </h2>
            <p className="mb-3 font-mono text-[11px] text-[#484f58]">
              the strongest insider signal: several people with inside knowledge independently reaching for their wallets
            </p>
            <BuyTable rows={report.clusterBuys} whoLabel="Insiders" prices={prices} isCluster />
          </section>

          <section className="mt-6 rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
            <h2 className="mb-1 font-mono text-xs uppercase tracking-wider text-[#8b949e]">
              Latest notable purchases (≥ $25k)
            </h2>
            <BuyTable rows={report.bigBuys} whoLabel="Who" prices={prices} />
          </section>
        </>
      )}

      <footer className="mt-8 text-center font-mono text-xs text-[#484f58]">
        source: SEC Form 4 via openinsider.com · refreshed every 30 min · not financial advice
      </footer>
    </main>
  );
}
