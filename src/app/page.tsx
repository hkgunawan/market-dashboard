"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Candle, Quote, Range } from "@/lib/yahoo";
import type { Supertrend, MacdResult } from "@/lib/indicators";
import type { CompanyProfile } from "@/lib/finnhub";
import PriceChart from "@/components/price-chart";
import QuoteCard from "@/components/quote-card";

interface WatchItem {
  symbol: string;
  label?: string;
}

const DEFAULT_WATCHLIST: WatchItem[] = [
  { symbol: "PAXG-USD", label: "Gold (PAXG)" },
  { symbol: "QQQ", label: "Nasdaq 100 (QQQ)" },
  { symbol: "BTC-USD", label: "Bitcoin" },
];

const RANGES: { value: Range; label: string }[] = [
  { value: "1d", label: "1D" },
  { value: "5d", label: "1W" },
  { value: "1mo", label: "1M" },
  { value: "6mo", label: "6M" },
  { value: "1y", label: "1Y" },
  { value: "5y", label: "5Y" },
];

const STORAGE_KEY = "md.watchlist.v2";

interface HistoryPayload {
  candles: Candle[];
  supertrend: Supertrend;
  macd: MacdResult;
}

export default function Dashboard() {
  const [watchlist, setWatchlist] = useState<WatchItem[]>(DEFAULT_WATCHLIST);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [selected, setSelected] = useState("PAXG-USD");
  const [range, setRange] = useState<Range>("6mo");
  const [candleType, setCandleType] = useState<"candles" | "ha">("ha");
  const [showBuild, setShowBuild] = useState(false);
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [history, setHistory] = useState<HistoryPayload | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [newTicker, setNewTicker] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [brief, setBrief] = useState<{ available: boolean; brief?: string } | null>(null);

  // localStorage and the URL are client-only, so hydrate after mount (SSR renders the defaults first).
  // Honors a ?symbol= deep-link, e.g. a ticker clicked on the insider-buys page.
  useEffect(() => {
    let items: WatchItem[] = DEFAULT_WATCHLIST;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) items = JSON.parse(raw);
    } catch {
      /* keep defaults */
    }
    const param = new URLSearchParams(window.location.search).get("symbol")?.trim().toUpperCase();
    if (param && !items.some((w) => w.symbol === param)) items = [...items, { symbol: param }];

    /* eslint-disable react-hooks/set-state-in-effect */
    setWatchlist(items);
    if (param) setSelected(param);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const persist = useCallback((items: WatchItem[]) => {
    setWatchlist(items);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, []);

  const symbols = useMemo(() => watchlist.map((w) => w.symbol), [watchlist]);
  const symbolsKey = symbols.join(",");

  // quotes: load + refresh every 60s
  useEffect(() => {
    if (!symbolsKey) return;
    let cancelled = false;
    const load = async () => {
      const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbolsKey)}`);
      if (!res.ok || cancelled) return;
      const data: { quotes: Quote[]; failed: string[] } = await res.json();
      if (cancelled) return;
      setQuotes((prev) => {
        const next = { ...prev };
        for (const q of data.quotes) next[q.symbol] = q;
        return next;
      });
      setUnavailable(data.failed ?? []);
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbolsKey]);

  // history for selected symbol/range
  useEffect(() => {
    let cancelled = false;
    // clear the previous symbol/range view while the new one loads
    /* eslint-disable react-hooks/set-state-in-effect */
    setHistory(null);
    setHistoryError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    fetch(`/api/history?symbol=${encodeURIComponent(selected)}&range=${range}&type=${candleType}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) setHistoryError(data.error ?? "failed to load history");
        else setHistory(data);
      })
      .catch(() => !cancelled && setHistoryError("failed to load history"));
    return () => {
      cancelled = true;
    };
  }, [selected, range, candleType]);

  // fundamentals snapshot for the selected symbol (equities only; crypto → null)
  useEffect(() => {
    let cancelled = false;
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setProfile(null);
    fetch(`/api/profile?symbol=${encodeURIComponent(selected)}`)
      .then((res) => res.json())
      .then((data: { profile?: CompanyProfile | null }) => !cancelled && setProfile(data.profile ?? null))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selected]);

  // AI brief (section only renders if the server has an API key)
  useEffect(() => {
    if (!symbolsKey) return;
    fetch(`/api/brief?symbols=${encodeURIComponent(symbolsKey)}`)
      .then((res) => res.json())
      .then(setBrief)
      .catch(() => setBrief(null));
  }, [symbolsKey]);

  const addTicker = async () => {
    const symbol = newTicker.trim().toUpperCase();
    if (!symbol) return;
    setAddError(null);
    if (watchlist.some((w) => w.symbol === symbol)) {
      setAddError("already on the watchlist");
      return;
    }
    const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbol)}`);
    const data: { quotes: Quote[] } = await res.json();
    if (!res.ok || data.quotes.length === 0) {
      setAddError(`couldn't load "${symbol}" — US stocks/ETFs need a free Twelve Data key; crypto like ETH-USD works without one`);
      return;
    }
    persist([...watchlist, { symbol }]);
    setNewTicker("");
  };

  const removeTicker = (symbol: string) => {
    const next = watchlist.filter((w) => w.symbol !== symbol);
    persist(next);
    if (selected === symbol && next.length > 0) setSelected(next[0].symbol);
  };

  const selectedLabel = watchlist.find((w) => w.symbol === selected)?.label ?? selected;
  const lastTrend = history?.supertrend.direction.filter((v): v is 1 | -1 => v != null).at(-1);
  const lastHist = history?.macd.hist.filter((v): v is number => v != null).at(-1);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="font-mono text-lg text-[#e6edf3]">
          <span className="text-[#3fb950]">$</span> market-dashboard
        </h1>
        <nav className="flex items-center gap-4 font-mono text-xs text-[#8b949e]">
          <Link href="/signals" className="text-[#3fb950] hover:text-[#e6edf3]">
            signals →
          </Link>
          <Link href="/insiders" className="text-[#58a6ff] hover:text-[#e6edf3]">
            insider-buys →
          </Link>
          <Link href="/smart-money" className="text-[#d29922] hover:text-[#e6edf3]">
            smart-money →
          </Link>
          <span>refresh 60s</span>
        </nav>
      </header>

      <div className="-mt-3 mb-5">
        <button
          onClick={() => setShowBuild((s) => !s)}
          className="font-mono text-xs text-[#8b949e] hover:text-[#e6edf3]"
          aria-expanded={showBuild}
        >
          {showBuild ? "hide" : "how it's built"} ▾
        </button>
        {showBuild && (
          <section className="mt-3 rounded-lg border border-[#30363d] bg-[#0d1117] p-4 font-mono text-xs leading-relaxed text-[#8b949e]">
            <p className="mb-2 text-[#e6edf3]">How it&apos;s built</p>
            <ul className="space-y-1.5">
              <li>
                <span className="text-[#3fb950]">Live data, resilient by design.</span> Quotes come from Finnhub with a
                Twelve&nbsp;Data fallback; crypto falls back from Binance to Twelve&nbsp;Data (Binance blocks datacenter
                IPs). A small in-memory TTL cache is rate-limit-aware and serves stale data on upstream errors, and bulk
                price fetches use bounded concurrency with a retry so a dropped call never leaves a gap.
              </li>
              <li>
                <span className="text-[#58a6ff]">Indicators are faithful community ports.</span> Supertrend
                (Kıvanç&nbsp;Özbilgiç) and the Ultimate&nbsp;MACD (Chris&nbsp;Moody) are reimplemented from their
                TradingView Pine scripts as pure, unit-tested functions, plus a Heikin&nbsp;Ashi transform — all computed
                server-side and drawn with lightweight-charts v5 panes.
              </li>
              <li>
                <span className="text-[#d29922]">Real regulatory data.</span> Insider buys are parsed from SEC Form 4
                (via openinsider), and &ldquo;smart money&rdquo; from SEC&nbsp;EDGAR 13F filings — diffing consecutive
                quarters per fund. Company CUSIPs resolve to tickers via OpenFIGI, with a Finnhub name-search fallback
                for the ones it misses.
              </li>
              <li>
                <span className="text-[#a371f7]">Stack.</span> Next.js&nbsp;16 (App Router) · React&nbsp;19 ·
                TypeScript · Tailwind&nbsp;v4 · Vitest. Fully typed, tested, and deployed on Vercel with auto-deploy from
                GitHub. Free-tier only.
              </li>
            </ul>
            <p className="mt-3 text-[#484f58]">
              Source:{" "}
              <a
                href="https://github.com/hkgunawan/market-dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#58a6ff] hover:underline"
              >
                github.com/hkgunawan/market-dashboard
              </a>
            </p>
          </section>
        )}
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {watchlist.map((item) => {
          const q = quotes[item.symbol];
          return q ? (
            <QuoteCard
              key={item.symbol}
              quote={q}
              label={item.label ?? item.symbol}
              selected={selected === item.symbol}
              onSelect={() => setSelected(item.symbol)}
              onRemove={
                DEFAULT_WATCHLIST.some((d) => d.symbol === item.symbol) ? undefined : () => removeTicker(item.symbol)
              }
            />
          ) : unavailable.includes(item.symbol) ? (
            <div key={item.symbol} className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-xs text-[#8b949e]">{item.label ?? item.symbol}</span>
                <button
                  onClick={() => removeTicker(item.symbol)}
                  className="text-xs text-[#8b949e] hover:text-[#f85149]"
                  aria-label={`Remove ${item.symbol}`}
                >
                  ✕
                </button>
              </div>
              <p className="mt-2 font-mono text-xs text-[#d29922]">
                source unavailable — needs TWELVEDATA_API_KEY (free) for stocks/ETFs
              </p>
            </div>
          ) : (
            <div key={item.symbol} className="animate-pulse rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
              <div className="h-3 w-16 rounded bg-[#21262d]" />
              <div className="mt-2 h-6 w-24 rounded bg-[#21262d]" />
              <div className="mt-1 h-4 w-20 rounded bg-[#21262d]" />
            </div>
          );
        })}
        <div className="flex flex-col justify-center rounded-lg border border-dashed border-[#30363d] p-4">
          <div className="flex gap-2">
            <input
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTicker()}
              placeholder="AAPL, ETH-USD…"
              className="w-full min-w-0 rounded border border-[#30363d] bg-transparent px-2 py-1 font-mono text-sm text-[#e6edf3] placeholder-[#484f58] outline-none focus:border-emerald-500/60"
            />
            <button
              onClick={addTicker}
              className="rounded border border-[#30363d] px-2 font-mono text-sm text-[#8b949e] hover:border-emerald-500/60 hover:text-[#3fb950]"
            >
              +
            </button>
          </div>
          {addError && <p className="mt-1 font-mono text-xs text-[#f85149]">{addError}</p>}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="font-mono text-sm text-[#e6edf3]">
            {selectedLabel} <span className="text-[#8b949e]">({selected})</span>
            {lastTrend != null && (
              <span className="ml-3 text-[#8b949e]">
                Supertrend:{" "}
                <span className={lastTrend === 1 ? "text-[#3fb950]" : "text-[#f85149]"}>
                  {lastTrend === 1 ? "▲ up" : "▼ down"}
                </span>
              </span>
            )}
            {lastHist != null && (
              <span className="ml-3 text-[#8b949e]">
                MACD hist:{" "}
                <span className={lastHist >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}>
                  {lastHist >= 0 ? "+" : ""}
                  {lastHist.toFixed(2)}
                </span>
              </span>
            )}
            <span className="ml-3 text-xs text-[#484f58]">Supertrend(10,3) · Ultimate MACD(12,26,9)</span>
            {candleType === "ha" && (
              <span
                className="ml-3 text-xs text-[#d29922]"
                title="Heikin Ashi candles are smoothed averages — the plotted close differs from the live price in the card above"
              >
                · HA (smoothed prices)
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 rounded border border-[#30363d] p-0.5">
              {([
                ["ha", "Heikin Ashi"],
                ["candles", "Candles"],
              ] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setCandleType(val)}
                  title={val === "ha" ? "Heikin Ashi (smoothed) — indicators recompute on HA" : "Standard candles"}
                  className={`rounded px-2 py-1 font-mono text-xs ${
                    candleType === val ? "bg-[#21262d] text-[#e6edf3]" : "text-[#8b949e] hover:text-[#e6edf3]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRange(r.value)}
                  className={`rounded px-2 py-1 font-mono text-xs ${
                    range === r.value ? "bg-[#21262d] text-[#e6edf3]" : "text-[#8b949e] hover:text-[#e6edf3]"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {profile && <CompanySnapshot p={profile} />}
        {historyError ? (
          <p className="py-24 text-center font-mono text-sm text-[#f85149]">{historyError}</p>
        ) : history ? (
          <PriceChart candles={history.candles} supertrend={history.supertrend} macd={history.macd} />
        ) : (
          <div className="h-[420px] animate-pulse rounded bg-[#161b22]" />
        )}
      </section>

      {brief?.available && brief.brief && (
        <section className="mt-6 rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
          <h2 className="mb-2 font-mono text-xs uppercase tracking-wider text-[#8b949e]">AI daily brief</h2>
          <p className="text-sm leading-relaxed text-[#e6edf3]">{brief.brief}</p>
        </section>
      )}

      <footer className="mt-8 text-center font-mono text-xs text-[#484f58]">
        unofficial market data (Binance · Twelve Data) · for personal use · not financial advice
      </footer>
    </main>
  );
}

function fmtCap(millions: number): string {
  if (millions >= 1_000_000) return `$${(millions / 1_000_000).toFixed(2)}T`;
  if (millions >= 1_000) return `$${(millions / 1_000).toFixed(1)}B`;
  return `$${Math.round(millions)}M`;
}

function CompanySnapshot({ p }: { p: CompanyProfile }) {
  const stat = (label: string, value: string) => (
    <span className="whitespace-nowrap">
      <span className="text-[#484f58]">{label} </span>
      <span className="text-[#e6edf3]">{value}</span>
    </span>
  );
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[#21262d] pb-3 font-mono text-xs text-[#8b949e]">
      <span className="text-[#e6edf3]">{p.name}</span>
      {p.industry && <span className="rounded border border-[#21262d] px-1.5 py-0.5 text-[10px] text-[#8b949e]">{p.industry}</span>}
      {p.marketCap != null && stat("mkt cap", fmtCap(p.marketCap))}
      {p.peTTM != null && stat("P/E", p.peTTM.toFixed(1))}
      {p.eps != null && stat("EPS", `$${p.eps.toFixed(2)}`)}
      {p.low52 != null && p.high52 != null && stat("52w", `$${p.low52.toFixed(0)}–$${p.high52.toFixed(0)}`)}
      {p.divYield != null && p.divYield > 0 && stat("div", `${p.divYield.toFixed(2)}%`)}
      {p.weburl && (
        <a href={p.weburl} target="_blank" rel="noopener noreferrer" className="text-[#58a6ff] hover:underline">
          site ↗
        </a>
      )}
    </div>
  );
}
