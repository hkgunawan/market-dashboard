import { supertrend, macdCM, type Trend, type OHLC } from "./indicators";
import type { Candle } from "./yahoo";
import type { AssetClass } from "./universe";
import { utcDate } from "./bars";

/** supertrend() seeds trend = 1 before it has seen any data, so an early
 *  "flip" can be an artifact of that seed rather than a real signal. Flips
 *  within this many bars of the first non-null direction are not trusted. */
export const SEED_ZONE_BARS = 20;

const FRESH_DAYS = 7;
const FRESH_CAP = 10;

export interface TimeframeSignal {
  trend: Trend | null;
  macdHist: number | null;
  flippedAt: string | null;
}

export type Alignment = "up" | "down" | "mixed";

export interface SymbolSignal {
  symbol: string;
  name: string;
  class: AssetClass;
  /** Close of the bar the signal was computed on — NOT a live price. */
  close: number;
  /** That bar's date, YYYY-MM-DD UTC. */
  asOf: string;
  daily: TimeframeSignal;
  weekly: TimeframeSignal;
  alignment: Alignment;
}

export interface SignalsFile {
  generatedAt: string;
  symbols: SymbolSignal[];
}

// The most recent genuine direction change, or null.
//
// Two rules beyond a plain `!==`, both load-bearing:
//   1. Both sides must be non-null. supertrend() leaves direction null through
//      the ATR warmup, and counting that null -> value transition would report
//      a false recent flip on nearly every symbol.
//   2. Flips within SEED_ZONE_BARS of the first real bar are discarded as
//      artifacts of supertrend()'s trend = 1 seed.
export function findFlippedAt(
  direction: (Trend | null)[],
  times: number[],
  seedZone: number = SEED_ZONE_BARS
): string | null {
  const firstReal = direction.findIndex((d) => d != null);
  if (firstReal === -1) return null;
  const earliestTrusted = firstReal + seedZone;

  for (let i = direction.length - 1; i > 0; i--) {
    const cur = direction[i];
    const prev = direction[i - 1];
    if (cur == null || prev == null) continue;
    if (cur === prev) continue;
    if (i < earliestTrusted) return null; // only artifacts remain below here
    return utcDate(new Date(times[i] * 1000));
  }
  return null;
}

export function timeframeSignal(bars: Candle[]): TimeframeSignal {
  if (bars.length === 0) return { trend: null, macdHist: null, flippedAt: null };

  const ohlc: OHLC[] = bars.map((b) => ({ high: b.high, low: b.low, close: b.close }));
  const st = supertrend(ohlc, 10, 3);
  const { hist } = macdCM(bars.map((b) => b.close), 12, 26, 9);

  const lastNonNull = <T,>(arr: (T | null)[]): T | null => {
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i] as T;
    return null;
  };

  return {
    trend: lastNonNull(st.direction),
    macdHist: lastNonNull(hist),
    flippedAt: findFlippedAt(st.direction, bars.map((b) => b.time)),
  };
}

export function alignmentOf(daily: TimeframeSignal, weekly: TimeframeSignal): Alignment {
  if (daily.trend === 1 && weekly.trend === 1) return "up";
  if (daily.trend === -1 && weekly.trend === -1) return "down";
  return "mixed";
}

// Recent daily flips, newest first, weekly-confirmed ones ahead of unconfirmed
// ones on the same day. Capped because one sharp market-wide move flips dozens
// of correlated large caps at once, and an uncapped list is noise on exactly
// the days it matters most. `total` reports the true count before the cap.
export function freshFlips(
  symbols: SymbolSignal[],
  now: Date,
  days: number = FRESH_DAYS,
  cap: number = FRESH_CAP
): { rows: SymbolSignal[]; total: number } {
  const cutoff = utcDate(new Date(now.getTime() - (days - 1) * 86400_000));
  const matches = symbols.filter((s) => s.daily.flippedAt != null && s.daily.flippedAt >= cutoff);

  const confirmed = (s: SymbolSignal) => (s.daily.trend != null && s.weekly.trend === s.daily.trend ? 0 : 1);
  matches.sort((a, b) => {
    if (a.daily.flippedAt! !== b.daily.flippedAt!) return a.daily.flippedAt! < b.daily.flippedAt! ? 1 : -1;
    return confirmed(a) - confirmed(b);
  });

  return { rows: matches.slice(0, cap), total: matches.length };
}

// The universe uses Twelve Data notation (BTC/USD), but this site's chart
// deep-links use its own notation (BTC-USD) — see toBinancePair() in market.ts.
// Without this, both crypto rows would link to a chart that cannot resolve.
export function linkSymbol(symbol: string): string {
  return symbol.replace(/\/USD$/, "-USD");
}
