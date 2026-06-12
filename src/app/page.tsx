"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Candle, Quote, Range } from "@/lib/yahoo";
import PriceChart from "@/components/price-chart";
import QuoteCard from "@/components/quote-card";

interface WatchItem {
  symbol: string;
  label?: string;
}

const DEFAULT_WATCHLIST: WatchItem[] = [
  { symbol: "PAXG-USD", label: "Gold (PAXG)" },
  { symbol: "BTC-USD", label: "Bitcoin" },
  { symbol: "QQQ", label: "Nasdaq 100 (QQQ)" },
];

const RANGES: { value: Range; label: string }[] = [
  { value: "1d", label: "1D" },
  { value: "5d", label: "1W" },
  { value: "1mo", label: "1M" },
  { value: "6mo", label: "6M" },
  { value: "1y", label: "1Y" },
  { value: "5y", label: "5Y" },
];

const STORAGE_KEY = "md.watchlist.v1";

interface HistoryPayload {
  candles: Candle[];
  sma50: (number | null)[];
  sma200: (number | null)[];
  rsi14: (number | null)[];
}

export default function Dashboard() {
  const [watchlist, setWatchlist] = useState<WatchItem[]>(DEFAULT_WATCHLIST);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [selected, setSelected] = useState("PAXG-USD");
  const [range, setRange] = useState<Range>("6mo");
  const [history, setHistory] = useState<HistoryPayload | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [newTicker, setNewTicker] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [brief, setBrief] = useState<{ available: boolean; brief?: string } | null>(null);

  // hydrate watchlist from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setWatchlist(JSON.parse(raw));
    } catch {
      /* keep defaults */
    }
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
    setHistory(null);
    setHistoryError(null);
    fetch(`/api/history?symbol=${encodeURIComponent(selected)}&range=${range}`)
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
  }, [selected, range]);

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
      setAddError(`"${symbol}" not found on Yahoo Finance`);
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
  const lastRsi = history?.rsi14.filter((v): v is number => v != null).at(-1);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="font-mono text-lg text-[#e6edf3]">
          <span className="text-[#3fb950]">$</span> market-dashboard
        </h1>
        <span className="font-mono text-xs text-[#8b949e]">data: Yahoo Finance · refresh 60s</span>
      </header>

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
            {lastRsi != null && (
              <span className="ml-3 text-[#8b949e]">
                RSI(14):{" "}
                <span className={lastRsi > 70 ? "text-[#f85149]" : lastRsi < 30 ? "text-[#3fb950]" : "text-[#e6edf3]"}>
                  {lastRsi.toFixed(1)}
                </span>
              </span>
            )}
            <span className="ml-3 text-xs">
              <span className="text-[#d29922]">— SMA50</span> <span className="ml-2 text-[#58a6ff]">— SMA200</span>
            </span>
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
        {historyError ? (
          <p className="py-24 text-center font-mono text-sm text-[#f85149]">{historyError}</p>
        ) : history ? (
          <PriceChart candles={history.candles} sma50={history.sma50} sma200={history.sma200} />
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
        unofficial Yahoo Finance data · for personal use · not financial advice
      </footer>
    </main>
  );
}
