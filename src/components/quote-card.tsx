"use client";

import type { Quote } from "@/lib/yahoo";

interface Props {
  quote: Quote;
  label?: string;
  selected: boolean;
  onSelect: () => void;
  onRemove?: () => void;
}

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export default function QuoteCard({ quote, label, selected, onSelect, onRemove }: Props) {
  const up = quote.change >= 0;
  return (
    <button
      onClick={onSelect}
      className={`group relative rounded-lg border p-4 text-left transition-colors ${
        selected ? "border-emerald-500/60 bg-emerald-500/5" : "border-[#30363d] bg-[#0d1117] hover:border-[#8b949e]"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-xs text-[#8b949e]">{label ?? quote.symbol}</span>
        {onRemove && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                onRemove();
              }
            }}
            className="hidden text-xs text-[#8b949e] hover:text-[#f85149] group-hover:inline"
            aria-label={`Remove ${quote.symbol}`}
          >
            ✕
          </span>
        )}
      </div>
      <div className="mt-1 font-mono text-xl text-[#e6edf3]">{fmt.format(quote.price)}</div>
      <div className={`mt-0.5 font-mono text-sm ${up ? "text-[#3fb950]" : "text-[#f85149]"}`}>
        {up ? "▲" : "▼"} {fmt.format(Math.abs(quote.change))} ({Math.abs(quote.changePct).toFixed(2)}%)
      </div>
    </button>
  );
}
