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
  // The remove control is a sibling button (not nested inside the card button) —
  // nesting interactive controls is invalid HTML and breaks screen readers.
  return (
    <div className="group relative">
      <button
        onClick={onSelect}
        className={`block w-full rounded-lg border p-4 text-left transition-colors ${
          selected ? "border-emerald-500/60 bg-emerald-500/5" : "border-[#30363d] bg-[#0d1117] hover:border-[#8b949e]"
        }`}
      >
        <span className="block font-mono text-xs text-[#8b949e]">{label ?? quote.symbol}</span>
        <span className="mt-1 block font-mono text-xl text-[#e6edf3]">{fmt.format(quote.price)}</span>
        <span className={`mt-0.5 block font-mono text-sm ${up ? "text-[#3fb950]" : "text-[#f85149]"}`}>
          {up ? "▲" : "▼"} {fmt.format(Math.abs(quote.change))} ({Math.abs(quote.changePct).toFixed(2)}%)
        </span>
      </button>
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={`Remove ${quote.symbol}`}
          className="absolute right-3 top-3 text-xs text-[#8b949e] opacity-100 transition-opacity hover:text-[#f85149] focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
        >
          ✕
        </button>
      )}
    </div>
  );
}
