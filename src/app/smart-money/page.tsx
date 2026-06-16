"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { FundMove, IssuerSignal, SmartMoneyReport } from "@/lib/edgar";
import { useTableSort, SortTh } from "@/components/sortable";

const fmtM = (n: number) =>
  Math.abs(n) >= 1_000_000_000 ? `$${(n / 1_000_000_000).toFixed(1)}B` : `$${Math.round(n / 1_000_000)}M`;

function MoveChip({ m }: { m: FundMove }) {
  const label =
    m.type === "NEW"
      ? "NEW"
      : m.type === "EXIT"
        ? "EXIT"
        : `${m.pctChange! > 0 ? "+" : ""}${Math.round(m.pctChange!)}%`;
  const color =
    m.type === "NEW"
      ? "border-emerald-500/50 text-[#3fb950]"
      : m.type === "ADD"
        ? "border-emerald-500/30 text-[#3fb950]"
        : "border-red-500/30 text-[#f85149]";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] ${color}`}
      title={`${m.manager} — ${fmtM(m.estDollarsMoved)} moved`}
    >
      {m.fund} {label}
    </span>
  );
}

// Current price vs the quarter-end price level — "did it already run up since they filed?"
function VsLevel({ held, now }: { held: number | null; now: number | undefined }) {
  if (held == null || now == null) return <span className="font-mono text-xs text-[#484f58]">—</span>;
  const pct = ((now - held) / held) * 100;
  const color = pct <= 10 ? "text-[#3fb950]" : pct <= 40 ? "text-[#d29922]" : "text-[#f85149]";
  return (
    <span className={`font-mono text-xs ${color}`} title={`held ~$${held.toFixed(2)}, now $${now.toFixed(2)}`}>
      {pct >= 0 ? "+" : ""}
      {pct.toFixed(0)}%
    </span>
  );
}

export default function SmartMoney() {
  const [report, setReport] = useState<SmartMoneyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch("/api/smart-money")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) setError(data.error ?? "failed to load");
        else setReport(data);
      })
      .catch(() => setError("failed to load"));
  }, []);

  // current prices for the resolved tickers → "Now" / "vs" columns (bulk, fast — fills every row)
  useEffect(() => {
    if (!report) return;
    const tickers = [...new Set(report.topAccumulated.map((s) => s.ticker))].filter((t): t is string => !!t);
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

  const priceNow = (s: IssuerSignal) => (s.ticker ? prices[s.ticker.toUpperCase()] : undefined);
  const { sorted, sort, toggle } = useTableSort<IssuerSignal>(
    report?.topAccumulated ?? [],
    {
      name: (s) => s.name,
      buyers: (s) => s.buyers.length,
      dollars: (s) => s.estDollarsAdded,
      held: (s) => s.priceAtPeriod,
      now: (s) => priceNow(s) ?? null,
      vs: (s) => {
        const p = priceNow(s);
        return s.priceAtPeriod && p != null ? ((p - s.priceAtPeriod) / s.priceAtPeriod) * 100 : null;
      },
    },
    { key: "buyers", dir: "desc" }
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-mono text-lg text-[#e6edf3]">
          <span className="text-[#3fb950]">$</span> smart-money
        </h1>
        <nav className="flex gap-4 font-mono text-xs text-[#8b949e]">
          <Link href="/" className="hover:text-[#e6edf3]">
            ← markets
          </Link>
          <Link href="/insiders" className="text-[#58a6ff] hover:text-[#e6edf3]">
            insider-buys
          </Link>
        </nav>
      </header>

      {report && (
        <p className="mb-6 font-mono text-xs leading-relaxed text-[#8b949e]">
          What {report.funds.filter((f) => f.ok).length} famous funds accumulated in the quarter ending{" "}
          <span className="text-[#e6edf3]">{report.asOfPeriod}</span> (vs {report.comparedTo}), from their SEC 13F
          filings. <span className="text-[#d29922]">This data is lagged by law (filed up to 45 days after
          quarter-end) — it shows conviction, not a buy signal. Not financial advice.</span>
        </p>
      )}

      {report && (
        <p className="mb-6 font-mono text-[11px] leading-relaxed text-[#484f58]">
          Column key — <span className="text-[#8b949e]">Held @</span>: the share price implied by their 13F at
          quarter-end (a reference level, not actual cost) · <span className="text-[#8b949e]">Now</span>: current price ·{" "}
          <span className="text-[#8b949e]">vs</span>: how far it&apos;s moved since — green means you&apos;d still buy
          near where they held, red means it already ran up.
        </p>
      )}

      {error && <p className="py-12 text-center font-mono text-sm text-[#f85149]">{error}</p>}

      {!report && !error && (
        <div className="py-16 text-center font-mono text-sm text-[#8b949e]">
          <p>reading 13F filings from SEC EDGAR…</p>
          <p className="mt-2 text-xs">first load walks ~40 filings, takes up to a minute — cached for 12h after</p>
          <div className="mx-auto mt-6 h-1 w-48 animate-pulse rounded bg-[#21262d]" />
        </div>
      )}

      {report && (
        <>
          <section className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
            <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-[#8b949e]">
              Most accumulated — ranked by number of funds buying
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#21262d] font-mono text-[11px] uppercase text-[#484f58]">
                    <th className="py-2 pr-2">#</th>
                    <SortTh label="Company" sortKey="name" sort={sort} onSort={toggle} className="py-2 pr-4" />
                    <SortTh label="Funds buying" sortKey="buyers" sort={sort} onSort={toggle} className="py-2 pr-4" />
                    <SortTh
                      label="Est. net added"
                      sortKey="dollars"
                      sort={sort}
                      onSort={toggle}
                      className="py-2 pr-4 text-right"
                    />
                    <SortTh
                      label="Held @"
                      sortKey="held"
                      sort={sort}
                      onSort={toggle}
                      title="avg share price implied by the 13F (market value ÷ shares) at quarter-end — a reference level, not their actual cost"
                      className="py-2 pr-4 text-right"
                    />
                    <SortTh
                      label="Now"
                      sortKey="now"
                      sort={sort}
                      onSort={toggle}
                      title="current price (US stocks need a free Twelve Data key)"
                      className="py-2 pr-4 text-right"
                    />
                    <SortTh
                      label="vs"
                      sortKey="vs"
                      sort={sort}
                      onSort={toggle}
                      title="current price vs the quarter-end level — green = near/below where they held, red = it already ran up"
                      className="py-2 pr-4 text-right"
                    />
                    <th className="py-2">Moves</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s, i) => (
                    <tr key={s.cusip} className="border-b border-[#161b22] align-top">
                      <td className="py-2.5 pr-2 font-mono text-xs text-[#484f58]">{i + 1}</td>
                      <td className="py-2.5 pr-4 text-sm text-[#e6edf3]">
                        {s.name}
                        {s.ticker && (
                          <Link
                            href={`/?symbol=${encodeURIComponent(s.ticker)}`}
                            className="ml-1.5 font-mono text-xs text-[#58a6ff] hover:underline"
                            title={`chart ${s.ticker}`}
                          >
                            {s.ticker}
                          </Link>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-sm text-[#3fb950]">
                        {s.buyers.length}
                        {s.sellers.length > 0 && <span className="text-[#f85149]"> / -{s.sellers.length}</span>}
                      </td>
                      <td
                        className={`py-2.5 pr-4 text-right font-mono text-sm ${
                          s.estDollarsAdded >= 0 ? "text-[#3fb950]" : "text-[#f85149]"
                        }`}
                      >
                        {fmtM(s.estDollarsAdded)}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono text-xs text-[#8b949e]">
                        {s.priceAtPeriod != null ? `$${s.priceAtPeriod.toFixed(2)}` : "—"}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono text-xs text-[#e6edf3]">
                        {priceNow(s) != null ? `$${priceNow(s)?.toFixed(2)}` : "—"}
                      </td>
                      <td className="py-2.5 pr-4 text-right">
                        <VsLevel held={s.priceAtPeriod} now={priceNow(s)} />
                      </td>
                      <td className="py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {[...s.buyers, ...s.sellers].map((m, j) => (
                            <MoveChip key={j} m={m} />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-6 rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
            <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-[#8b949e]">
              Biggest brand-new positions this quarter
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {report.topNewPositions.map((s) => {
                const newBuys = s.buyers.filter((b) => b.type === "NEW");
                return (
                  <div key={s.cusip} className="rounded border border-[#21262d] p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm text-[#e6edf3]">{s.name}</span>
                      <span className="font-mono text-sm text-[#3fb950]">
                        {fmtM(newBuys.reduce((a, b) => a + b.estDollarsMoved, 0))}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {newBuys.map((m, j) => (
                        <MoveChip key={j} m={m} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="mt-6 rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
            <h2 className="mb-2 font-mono text-xs uppercase tracking-wider text-[#8b949e]">Funds tracked</h2>
            <div className="flex flex-wrap gap-2">
              {report.funds.map((f) => (
                <span
                  key={f.name}
                  className={`rounded border px-2 py-1 font-mono text-[11px] ${
                    f.ok ? "border-[#30363d] text-[#8b949e]" : "border-red-500/30 text-[#f85149] line-through"
                  }`}
                  title={f.manager}
                >
                  {f.name}
                </span>
              ))}
            </div>
          </section>
        </>
      )}

      <footer className="mt-8 text-center font-mono text-xs text-[#484f58]">
        source: SEC EDGAR 13F-HR filings · quarterly, lagged data · not financial advice
      </footer>
    </main>
  );
}
