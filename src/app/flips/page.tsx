import Link from "next/link";
import signalsJson from "@/data/signals.json";
import { freshFlips, linkSymbol, tradingViewUrl, type SignalsFile } from "@/lib/flips";
import SiteFooter from "@/components/site-footer";
import FlipsTable from "./flips-table";

const data = signalsJson as SignalsFile;

export default function Flips() {
  const now = new Date(data.generatedAt);
  const { rows: fresh, total } = freshFlips(data.symbols, now);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-mono text-lg text-[#e6edf3]">flips</h1>
        <nav className="flex gap-4 font-mono text-xs text-[#8b949e]">
          <Link href="/" className="hover:text-[#e6edf3]">← markets</Link>
          <Link href="/signals" className="text-[#3fb950] hover:text-[#e6edf3]">signals →</Link>
          <Link href="/insiders" className="text-[#58a6ff] hover:text-[#e6edf3]">insider-buys →</Link>
          <Link href="/smart-money" className="text-[#d29922] hover:text-[#e6edf3]">smart-money →</Link>
          <Link href="/earnings" className="text-[#a371f7] hover:text-[#e6edf3]">earnings →</Link>
        </nav>
      </header>

      <p className="mb-6 max-w-3xl font-mono text-xs leading-relaxed text-[#8b949e]">
        Which large caps, gold (GLD), silver (SLV) and crypto recently changed{" "}
        <span className="text-[#3fb950]">Supertrend</span> direction, and whether the weekly
        timeframe agrees. Scanned once a day after the US close.{" "}
        <span className="text-[#d29922]">Indicator output, not financial advice.</span>
      </p>

      <h2 className="mb-2 font-mono text-sm text-[#e6edf3]">
        changed direction in the last 7 days
        {total > fresh.length && (
          <span className="ml-2 text-xs text-[#7d8590]">showing {fresh.length} of {total}</span>
        )}
      </h2>

      {fresh.length === 0 ? (
        <p className="mb-8 font-mono text-xs text-[#7d8590]">Nothing flipped in the last 7 days.</p>
      ) : (
        <ul className="mb-8 space-y-1 font-mono text-xs">
          {fresh.map((r) => (
            <li key={r.symbol} className="flex flex-wrap items-baseline gap-x-3 border-b border-[#21262d] py-1.5">
              <Link href={`/?symbol=${encodeURIComponent(linkSymbol(r.symbol))}`} className="text-[#58a6ff] hover:underline">
                {r.symbol}
              </Link>
              <a
                href={tradingViewUrl(r.symbol)}
                target="_blank"
                rel="noopener noreferrer"
                title={`${r.symbol} on TradingView`}
                className="ml-1 text-[#7d8590] hover:text-[#e6edf3]"
              >
                tv&#8599;
              </a>
              <span className="text-[#7d8590]">{r.name}</span>
              <span className={r.daily.trend === 1 ? "text-[#3fb950]" : "text-[#f85149]"}>
                daily turned {r.daily.trend === 1 ? "up" : "down"}
              </span>
              <span className="text-[#7d8590]">on {r.daily.flippedAt}</span>
              <span className="text-[#8b949e]">
                weekly {r.weekly.trend === r.daily.trend ? "agrees" : "does not agree"}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-2 font-mono text-sm text-[#e6edf3]">full board</h2>
      <FlipsTable rows={data.symbols} now={now.getTime()} />

      <SiteFooter>
        Supertrend(10, 3) and MACD(12, 26, 9) on daily and weekly bars · gold and silver are the
        GLD and SLV ETFs, not spot · dates in UTC · generated {data.generatedAt.slice(0, 16)}Z ·
        indicator output, not investment advice
      </SiteFooter>
    </main>
  );
}
