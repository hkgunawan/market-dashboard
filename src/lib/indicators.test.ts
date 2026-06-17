import { describe, it, expect } from "vitest";
import { sma, rsi, atr, supertrend, type OHLC } from "./indicators";

// build OHLC bars from a close series (tight, ~1% range) for indicator tests
const barsFrom = (closes: number[]): OHLC[] =>
  closes.map((c, i) => {
    const prev = closes[i - 1] ?? c;
    return { high: Math.max(c, prev) * 1.01, low: Math.min(c, prev) * 0.99, close: c };
  });

describe("sma", () => {
  it("returns null during the warm-up, then the moving average", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it("averages only the trailing window", () => {
    expect(sma([10, 20, 30, 60], 2)).toEqual([null, 15, 25, 45]);
  });

  it("handles a period equal to the series length", () => {
    expect(sma([2, 4, 6], 3)).toEqual([null, null, 4]);
  });

  it("is all null when the period is longer than the series", () => {
    expect(sma([1, 2], 5)).toEqual([null, null]);
  });
});

describe("rsi (Wilder)", () => {
  it("is all null when there are not more than `period` points", () => {
    expect(rsi([1, 2, 3], 14).every((v) => v === null)).toBe(true);
    expect(rsi(Array.from({ length: 14 }, (_, i) => i), 14).every((v) => v === null)).toBe(true);
  });

  it("is 100 for a strictly rising series (no losses)", () => {
    const out = rsi(Array.from({ length: 16 }, (_, i) => i + 1), 14); // 1..16
    expect(out.slice(0, 14).every((v) => v === null)).toBe(true);
    expect(out[14]).toBe(100);
    expect(out[15]).toBe(100);
  });

  it("is 0 for a strictly falling series (no gains)", () => {
    const out = rsi(Array.from({ length: 16 }, (_, i) => 16 - i), 14); // 16..1
    expect(out[14]).toBe(0);
  });

  it("stays within [0, 100] for a mixed series", () => {
    const values = [44, 44.5, 44.1, 43.6, 44.3, 44.8, 45.1, 45.4, 45.4, 45.1, 46.0, 47.1, 46.5, 46.3, 46.0, 46.4, 46.2];
    const out = rsi(values, 14).filter((v): v is number => v !== null);
    expect(out.length).toBeGreaterThan(0);
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe("atr", () => {
  it("is null during warm-up and positive after", () => {
    const bars = barsFrom(Array.from({ length: 20 }, (_, i) => 100 + i));
    const out = atr(bars, 10);
    expect(out.slice(0, 10).every((v) => v === null)).toBe(true);
    expect(out[10]).toBeGreaterThan(0);
    expect(out.at(-1)).toBeGreaterThan(0);
  });

  it("is all null when the series is too short", () => {
    expect(atr(barsFrom([1, 2, 3]), 10).every((v) => v === null)).toBe(true);
  });
});

describe("supertrend", () => {
  it("reports an uptrend for a steadily rising market", () => {
    const bars = barsFrom(Array.from({ length: 40 }, (_, i) => 100 + i * 2));
    const { value, direction } = supertrend(bars, 10, 3);
    const dir = direction.at(-1);
    const line = value.at(-1)!;
    expect(dir).toBe(1);
    expect(line).toBeLessThan(bars.at(-1)!.close); // line sits below price in an uptrend
  });

  it("reports a downtrend for a steadily falling market", () => {
    const bars = barsFrom(Array.from({ length: 40 }, (_, i) => 200 - i * 2));
    const { value, direction } = supertrend(bars, 10, 3);
    expect(direction.at(-1)).toBe(-1);
    expect(value.at(-1)!).toBeGreaterThan(bars.at(-1)!.close); // line above price in a downtrend
  });

  it("flips direction when the trend reverses", () => {
    const up = Array.from({ length: 25 }, (_, i) => 100 + i * 2);
    const down = Array.from({ length: 25 }, (_, i) => up.at(-1)! - i * 3);
    const { direction } = supertrend(barsFrom([...up, ...down]), 10, 3);
    const seen = new Set(direction.filter((d) => d != null));
    expect(seen.has(1)).toBe(true);
    expect(seen.has(-1)).toBe(true);
  });

  it("warms up with nulls before ATR is available", () => {
    const { value } = supertrend(barsFrom(Array.from({ length: 20 }, (_, i) => 100 + i)), 10, 3);
    expect(value.slice(0, 10).every((v) => v === null)).toBe(true);
  });
});
