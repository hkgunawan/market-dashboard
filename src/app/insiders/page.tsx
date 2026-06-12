"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { InsiderBuy, InsiderReport } from "@/lib/openinsider";

function BuyTable({ rows, whoLabel }: { rows: InsiderBuy[]; whoLabel: string }) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr className="border-b border-[#21262d] font-mono text-[11px] uppercase text-[#484f58]">
          <th className="py-2 pr-3">Filed</th>
          <th className="py-2 pr-3">Ticker</th>
          <th className="py-2 pr-3">Company</th>
          <th className="py-2 pr-3">{whoLabel}</th>
          <th className="py-2 pr-3 text-right">Price</th>
          <th className="py-2 pr-3 text-right">ΔOwn</th>
          <th className="py-2 text-right">Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-[#161b22]">
            <td className="py-2 pr-3 font-mono text-xs text-[#8b949e]">{r.filingDate}</td>
            <td className="py-2 pr-3 font-mono text-sm text-[#58a6ff]">{r.ticker}</td>
            <td className="max-w-[16rem] truncate py-2 pr-3 text-sm text-[#e6edf3]" title={r.company}>
              {r.company}
            </td>
            <td className="max-w-[12rem] truncate py-2 pr-3 text-xs text-[#8b949e]" title={`${r.insiders} ${r.title}`}>
              {r.insiders}
              {r.title && <span className="text-[#484f58]"> · {r.title}</span>}
            </td>
            <td className="py-2 pr-3 text-right font-mono text-xs text-[#e6edf3]">{r.price}</td>
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

      <p className="mb-6 font-mono text-xs leading-relaxed text-[#8b949e]">
        Open-market purchases by company insiders (CEOs, CFOs, directors) from SEC Form 4 filings — filed within{" "}
        <span className="text-[#e6edf3]">2 business days</span> of the trade, so this feed is near-real-time.{" "}
        Insiders sell for many reasons, but buy with their own money for only one.{" "}
        <span className="text-[#d29922]">A signal to research, not a buy list. Not financial advice.</span>
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
            <BuyTable rows={report.clusterBuys} whoLabel="Insiders" />
          </section>

          <section className="mt-6 rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
            <h2 className="mb-1 font-mono text-xs uppercase tracking-wider text-[#8b949e]">
              Latest notable purchases (≥ $25k)
            </h2>
            <BuyTable rows={report.bigBuys} whoLabel="Who" />
          </section>
        </>
      )}

      <footer className="mt-8 text-center font-mono text-xs text-[#484f58]">
        source: SEC Form 4 via openinsider.com · refreshed every 30 min · not financial advice
      </footer>
    </main>
  );
}
