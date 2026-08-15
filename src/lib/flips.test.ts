import { describe, it, expect } from "vitest";
import {
  findFlippedAt,
  timeframeSignal,
  alignmentOf,
  freshFlips,
  linkSymbol,
  SEED_ZONE_BARS,
  type SymbolSignal,
  type TimeframeSignal,
} from "./flips";
import type { Trend } from "./indicators";
import type { Candle } from "./yahoo";

// day N as a unix timestamp, counting from 2026-01-01
const t = (n: number) => Math.floor(Date.parse("2026-01-01T00:00:00Z") / 1000) + n * 86400;
const times = (len: number) => Array.from({ length: len }, (_, i) => t(i));

// a direction array: `warmup` nulls, then the given trends
const dir = (warmup: number, trends: Trend[]): (Trend | null)[] => [
  ...Array<null>(warmup).fill(null),
  ...trends,
];

describe("findFlippedAt", () => {
  it("returns the date of the most recent genuine direction change", () => {
    // 25 bars of 1, then 5 of -1 -> flip at index 25
    const d = dir(0, [...Array<Trend>(25).fill(1), ...Array<Trend>(5).fill(-1)]);
    expect(findFlippedAt(d, times(30))).toBe("2026-01-26");
  });

  it("ignores the null -> value warmup transition", () => {
    // the ONLY change is null -> 1 at index 10; that is not a flip
    const d = dir(10, Array<Trend>(30).fill(1));
    expect(findFlippedAt(d, times(40))).toBeNull();
  });

  it("ignores the warmup transition even with no seed zone", () => {
    expect(findFlippedAt(dir(10, Array<Trend>(30).fill(1)), times(40), 0)).toBeNull();
  });

  it("ignores a flip inside the seed zone, where supertrend's trend=1 seed dominates", () => {
    const trends: Trend[] = [...Array<Trend>(5).fill(1), ...Array<Trend>(35).fill(-1)];
    const d = dir(0, trends); // flip at index 5, inside the 20-bar seed zone
    expect(findFlippedAt(d, times(40))).toBeNull();
  });

  it("returns null for a series that never flips", () => {
    expect(findFlippedAt(dir(10, Array<Trend>(30).fill(-1)), times(40))).toBeNull();
  });

  it("returns the latest flip when there are several", () => {
    const trends: Trend[] = [
      ...Array<Trend>(25).fill(1),
      ...Array<Trend>(5).fill(-1),
      ...Array<Trend>(5).fill(1),
    ];
    expect(findFlippedAt(dir(0, trends), times(35))).toBe("2026-01-31");
  });

  it("returns null for an empty or all-null series", () => {
    expect(findFlippedAt([], [])).toBeNull();
    expect(findFlippedAt(dir(5, []), times(5))).toBeNull();
  });

  it("counts the seed zone from the first non-null bar, not from index 0", () => {
    // 30 nulls, then 5 bars of 1 and a flip -> that flip is inside the seed zone
    const d = dir(30, [...Array<Trend>(5).fill(1), ...Array<Trend>(3).fill(-1)]);
    expect(findFlippedAt(d, times(38))).toBeNull();
    expect(SEED_ZONE_BARS).toBe(20);
  });
});

describe("timeframeSignal", () => {
  const rising: Candle[] = Array.from({ length: 60 }, (_, i) => ({
    time: t(i),
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i,
  }));

  it("reports an uptrend for a steadily rising series", () => {
    const s = timeframeSignal(rising);
    expect(s.trend).toBe(1);
    expect(typeof s.macdHist).toBe("number");
  });

  it("returns nulls for a series too short to warm up", () => {
    const s = timeframeSignal(rising.slice(0, 3));
    expect(s.trend).toBeNull();
    expect(s.flippedAt).toBeNull();
  });

  it("returns an all-null signal for no bars", () => {
    expect(timeframeSignal([])).toEqual({ trend: null, macdHist: null, flippedAt: null });
  });
});

describe("alignmentOf", () => {
  const sig = (trend: Trend | null): TimeframeSignal => ({ trend, macdHist: 0, flippedAt: null });

  it("is up only when both timeframes agree up", () => {
    expect(alignmentOf(sig(1), sig(1))).toBe("up");
  });

  it("is down only when both timeframes agree down", () => {
    expect(alignmentOf(sig(-1), sig(-1))).toBe("down");
  });

  it("is mixed when they disagree or either is unknown", () => {
    expect(alignmentOf(sig(1), sig(-1))).toBe("mixed");
    expect(alignmentOf(sig(1), sig(null))).toBe("mixed");
    expect(alignmentOf(sig(null), sig(null))).toBe("mixed");
  });
});

describe("freshFlips", () => {
  const mk = (symbol: string, flippedAt: string | null, weekly: Trend | null): SymbolSignal => ({
    symbol,
    name: symbol,
    class: "equity",
    close: 1,
    asOf: "2026-01-30",
    daily: { trend: 1, macdHist: 0, flippedAt },
    weekly: { trend: weekly, macdHist: 0, flippedAt: null },
    alignment: weekly === 1 ? "up" : "mixed",
  });
  const now = new Date("2026-01-30T23:30:00Z");

  it("keeps only flips inside the window", () => {
    const rows = [mk("A", "2026-01-29", 1), mk("B", "2026-01-01", 1), mk("C", null, 1)];
    expect(freshFlips(rows, now).rows.map((r) => r.symbol)).toEqual(["A"]);
  });

  it("sorts newest first", () => {
    const rows = [mk("OLD", "2026-01-25", 1), mk("NEW", "2026-01-29", 1)];
    expect(freshFlips(rows, now).rows.map((r) => r.symbol)).toEqual(["NEW", "OLD"]);
  });

  it("puts weekly-confirmed flips first within the same day", () => {
    const rows = [mk("UNCONFIRMED", "2026-01-29", -1), mk("CONFIRMED", "2026-01-29", 1)];
    expect(freshFlips(rows, now).rows.map((r) => r.symbol)).toEqual(["CONFIRMED", "UNCONFIRMED"]);
  });

  it("caps the list but reports the true total", () => {
    const rows = Array.from({ length: 34 }, (_, i) => mk(`S${i}`, "2026-01-29", 1));
    const out = freshFlips(rows, now);
    expect(out.rows).toHaveLength(10);
    expect(out.total).toBe(34);
  });

  it("treats the window as inclusive at its edge", () => {
    expect(freshFlips([mk("EDGE", "2026-01-24", 1)], now, 7).rows).toHaveLength(1);
    expect(freshFlips([mk("PAST", "2026-01-23", 1)], now, 7).rows).toHaveLength(0);
  });
});

describe("linkSymbol", () => {
  it("converts Twelve Data crypto notation to the site's chart notation", () => {
    expect(linkSymbol("BTC/USD")).toBe("BTC-USD");
    expect(linkSymbol("ETH/USD")).toBe("ETH-USD");
  });

  it("leaves equities and ETFs untouched", () => {
    expect(linkSymbol("AAPL")).toBe("AAPL");
    expect(linkSymbol("GLD")).toBe("GLD");
    expect(linkSymbol("BRK.B")).toBe("BRK.B");
  });
});
