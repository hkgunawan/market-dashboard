"use client";

import Link from "next/link";
import { useTableSort, SortTh } from "@/components/sortable";
import { linkSymbol, type SymbolSignal } from "@/lib/flips";

const trendLabel = (t: 1 | -1 | null) =>
  t === 1 ? <span className="text-[#3fb950]">up</span>
  : t === -1 ? <span className="text-[#f85149]">down</span>
  : <span className="text-[#7d8590]">—</span>;

const daysSince = (iso: string | null, now: number) =>
  iso == null ? null : Math.round((now - Date.parse(`${iso}T00:00:00Z`)) / 86400_000);

export default function FlipsTable({ rows, now }: { rows: SymbolSignal[]; now: number }) {
  const { sorted, sort, toggle } = useTableSort<SymbolSignal>(
    rows,
    {
      symbol: (r) => r.symbol,
      close: (r) => r.close,
      daily: (r) => r.daily.trend,
      weekly: (r) => r.weekly.trend,
      momentum: (r) => r.daily.macdHist,
      alignment: (r) => r.alignment,
      since: (r) => daysSince(r.daily.flippedAt, now),
    },
    { key: "since", dir: "asc" }
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse font-mono text-xs">
        <thead className="border-b border-[#30363d] text-[10px] uppercase tracking-wide text-[#7d8590]">
          <tr>
            <SortTh label="symbol" sortKey="symbol" sort={sort} onSort={toggle} className="py-2 text-left" />
            <SortTh label="close" sortKey="close" sort={sort} onSort={toggle} className="py-2 text-right" />
            <SortTh label="daily" sortKey="daily" sort={sort} onSort={toggle} className="py-2 text-right" />
            <SortTh label="weekly" sortKey="weekly" sort={sort} onSort={toggle} className="py-2 text-right" />
            <SortTh label="momentum" sortKey="momentum" sort={sort} onSort={toggle} className="py-2 text-right" title="MACD histogram" />
            <SortTh label="alignment" sortKey="alignment" sort={sort} onSort={toggle} className="py-2 text-right" />
            <SortTh label="days since flip" sortKey="since" sort={sort} onSort={toggle} className="py-2 text-right" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.symbol} className="border-b border-[#21262d] hover:bg-[#161b22]">
              <td className="py-1.5">
                <Link href={`/?symbol=${encodeURIComponent(linkSymbol(r.symbol))}`} className="text-[#58a6ff] hover:underline">
                  {r.symbol}
                </Link>
                <span className="ml-2 text-[#7d8590]">{r.name}</span>
              </td>
              <td className="py-1.5 text-right text-[#e6edf3]">{r.close.toFixed(2)}</td>
              <td className="py-1.5 text-right">{trendLabel(r.daily.trend)}</td>
              <td className="py-1.5 text-right">{trendLabel(r.weekly.trend)}</td>
              <td className="py-1.5 text-right text-[#8b949e]">
                {r.daily.macdHist == null ? "—" : r.daily.macdHist.toFixed(2)}
              </td>
              <td className="py-1.5 text-right text-[#8b949e]">{r.alignment}</td>
              <td className="py-1.5 text-right text-[#8b949e]">{daysSince(r.daily.flippedAt, now) ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
