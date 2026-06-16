import { describe, it, expect } from "vitest";
import { sma, rsi } from "./indicators";

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
