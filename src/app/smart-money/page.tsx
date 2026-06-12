"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { FundMove, SmartMoneyReport } from "@/lib/edgar";

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

export default function SmartMoney() {
  const [report, setReport] = useState<SmartMoneyReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/smart-money")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) setError(data.error ?? "failed to load");
        else setReport(data);
      })
      .catch(() => setError("failed to load"));
  }, []);

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
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#21262d] font-mono text-[11px] uppercase text-[#484f58]">
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 pr-4">Company</th>
                  <th className="py-2 pr-4">Funds buying</th>
                  <th className="py-2 pr-4 text-right">Est. net added</th>
                  <th className="py-2">Moves</th>
                </tr>
              </thead>
              <tbody>
                {report.topAccumulated.map((s, i) => (
                  <tr key={s.cusip} className="border-b border-[#161b22] align-top">
                    <td className="py-2.5 pr-2 font-mono text-xs text-[#484f58]">{i + 1}</td>
                    <td className="py-2.5 pr-4 text-sm text-[#e6edf3]">{s.name}</td>
                    <td className="py-2.5 pr-4 font-mono text-sm text-[#3fb950]">
                      {s.buyers.length}
                      {s.sellers.length > 0 && (
                        <span className="text-[#f85149]"> / -{s.sellers.length}</span>
                      )}
                    </td>
                    <td
                      className={`py-2.5 pr-4 text-right font-mono text-sm ${
                        s.estDollarsAdded >= 0 ? "text-[#3fb950]" : "text-[#f85149]"
                      }`}
                    >
                      {fmtM(s.estDollarsAdded)}
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
