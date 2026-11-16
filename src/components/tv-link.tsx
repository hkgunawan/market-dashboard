import { tradingViewUrl } from "@/lib/symbols";

// Small outbound "open on TradingView" link, shown next to every ticker. Reading a
// chart there costs this site zero API quota.
export default function TvLink({ symbol, label = "tv↗", className = "" }: { symbol: string; label?: string; className?: string }) {
  return (
    <a
      href={tradingViewUrl(symbol)}
      target="_blank"
      rel="noopener noreferrer"
      title={`${symbol} on TradingView`}
      className={`font-mono text-xs text-[#7d8590] hover:text-[#e6edf3] ${className}`}
    >
      {label}
    </a>
  );
}
