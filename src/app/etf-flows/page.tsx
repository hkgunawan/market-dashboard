"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { EtfFlowDay } from "@/lib/coinglass";

const fmtM = (n: number) => {
  const abs = Math.abs(n);
  const s = abs >= 1_000_000_000 ? `$${(abs / 1_000_000_000).toFixed(2)}B` : `$${Math.round(abs / 1_000_000)}M`;
  return n < 0 ? `-${s}` : `+${s}`;
};

export default function EtfFlows() {
  const [days, setDays] = useState<EtfFlowDay[] | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/etf-flows")
      .then(async (res) => {
        const data = await res.json();
        if (data.available === false) setNeedsKey(true);
        else if (!res.ok) setError(data.error ?? "failed to load");
        else setDays(data.days);
      })
      .catch(() => setError("failed to load"));
  }, []);

  const recent = useMemo(() => (days ? days.slice(-30).reverse() : []), [days]);
  const sum = (n: number) => (days ? days.slice(-n).reduce((a, d) => a + d.netFlowUsd, 0) : 0);
  const maxAbs = useMemo(() => Math.max(1, ...recent.map((d) => Math.abs(d.netFlowUsd))), [recent]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-mono text-lg text-[#e6edf3]">
          <span className="text-[#3fb950]">$</span> btc-etf-flows
        </h1>
        <nav className="flex gap-4 font-mono text-xs text-[#8b949e]">
          <Link href="/" className="hover:text-[#e6edf3]">
            ← markets
          </Link>
          <Link href="/insiders" className="text-[#58a6ff] hover:text-[#e6edf3]">
            insider-buys
          </Link>
          <Link href="/smart-money" className="text-[#d29922] hover:text-[#e6edf3]">
            smart-money
          </Link>
        </nav>
      </header>

      <p className="mb-6 font-mono text-xs leading-relaxed text-[#8b949e]">
        Daily net money flowing into (green) or out of (red) the US spot Bitcoin ETFs — the cleanest daily read on
        institutional BTC demand. <span className="text-[#d29922]">Descriptive, not predictive. Not financial advice.</span>
      </p>

      {needsKey && (
        <div className="rounded-lg border border-dashed border-[#d29922]/40 bg-[#0d1117] p-6 font-mono text-sm text-[#e6edf3]">
          <p className="text-[#d29922]">This page needs a free CoinGlass API key.</p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-[#8b949e]">
            <li>Sign up at coinglass.com → API (free Hobbyist plan)</li>
            <li>
              Add to <span className="text-[#e6edf3]">.env.local</span>:{" "}
              <span className="text-[#3fb950]">COINGLASS_API_KEY=your-key</span>
            </li>
            <li>Restart the app</li>
          </ol>
        </div>
      )}

      {error && (
        <p className="break-all py-12 text-center font-mono text-sm text-[#f85149]">
          {error}
          <span className="mt-2 block text-xs text-[#8b949e]">if this mentions your plan or row shape, paste it to Claude</span>
        </p>
      )}

      {!days && !needsKey && !error && (
        <div className="py-16 text-center font-mono text-sm text-[#8b949e]">
          <p>loading flow history…</p>
          <div className="mx-auto mt-6 h-1 w-48 animate-pulse rounded bg-[#21262d]" />
        </div>
      )}

      {days && (
        <>
          <section className="grid grid-cols-3 gap-3">
            {[
              { label: "yesterday", value: days[days.length - 1]?.netFlowUsd ?? 0 },
              { label: "last 7 days", value: sum(7) },
              { label: "last 30 days", value: sum(30) },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
                <div className="font-mono text-xs text-[#8b949e]">{s.label}</div>
                <div className={`mt-1 font-mono text-lg ${s.value >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                  {fmtM(s.value)}
                </div>
              </div>
            ))}
          </section>

          <section className="mt-6 rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
            <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-[#8b949e]">last 30 trading days</h2>
            <div className="space-y-1">
              {recent.map((d) => (
                <div key={d.date} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 font-mono text-[11px] text-[#8b949e]">{d.date}</span>
                  <div className="relative h-4 flex-1">
                    <div className="absolute inset-y-0 left-1/2 w-px bg-[#30363d]" />
                    <div
                      className={`absolute inset-y-0.5 rounded-sm ${
                        d.netFlowUsd >= 0 ? "left-1/2 bg-[#3fb950]/70" : "right-1/2 bg-[#f85149]/70"
                      }`}
                      style={{ width: `${(Math.abs(d.netFlowUsd) / maxAbs) * 50}%` }}
                    />
                  </div>
                  <span
                    className={`w-20 shrink-0 text-right font-mono text-[11px] ${
                      d.netFlowUsd >= 0 ? "text-[#3fb950]" : "text-[#f85149]"
                    }`}
                  >
                    {fmtM(d.netFlowUsd)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      <footer className="mt-8 text-center font-mono text-xs text-[#484f58]">
        source: CoinGlass API · refreshed hourly · not financial advice
      </footer>
    </main>
  );
}
