import type { Candle } from "./yahoo";
import type { AssetClass } from "./universe";

/** YYYY-MM-DD in UTC. */
export function utcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The Monday (UTC) of the ISO week containing `d`, as YYYY-MM-DD. */
export function isoWeekStartUtc(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = t.getUTCDay(); // 0 = Sunday
  const backToMonday = dow === 0 ? 6 : dow - 1;
  t.setUTCDate(t.getUTCDate() - backToMonday);
  return utcDate(t);
}

// Crypto trades 24/7, so at scan time the current UTC day is always partial.
// Equities and the metal ETFs are US-listed; the scan runs after the close, so
// their final bar is a completed session.
export function dropInProgressDaily(bars: Candle[], cls: AssetClass, now: Date): Candle[] {
  if (cls !== "crypto" || bars.length === 0) return bars;
  const last = bars[bars.length - 1];
  return utcDate(new Date(last.time * 1000)) === utcDate(now) ? bars.slice(0, -1) : bars;
}

// Twelve Data labels weekly bars by week start and includes the in-progress week.
export function dropInProgressWeekly(bars: Candle[], now: Date): Candle[] {
  if (bars.length === 0) return bars;
  const last = bars[bars.length - 1];
  const lastWeek = isoWeekStartUtc(new Date(last.time * 1000));
  return lastWeek === isoWeekStartUtc(now) ? bars.slice(0, -1) : bars;
}
