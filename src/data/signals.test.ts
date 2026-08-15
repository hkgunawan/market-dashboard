import { describe, it, expect } from "vitest";
import signals from "./signals.json";
import { UNIVERSE } from "@/lib/universe";
import type { SignalsFile } from "@/lib/flips";

const data = signals as SignalsFile;

describe("signals.json", () => {
  it("has a generatedAt timestamp", () => {
    expect(Number.isNaN(Date.parse(data.generatedAt))).toBe(false);
  });

  it("covers at least 90% of the universe", () => {
    expect(data.symbols.length).toBeGreaterThanOrEqual(Math.floor(UNIVERSE.length * 0.9));
  });

  it("has a finite close and an asOf date for every symbol", () => {
    for (const s of data.symbols) {
      expect(Number.isFinite(s.close), s.symbol).toBe(true);
      expect(s.asOf, s.symbol).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("has a valid alignment and trend for every symbol", () => {
    for (const s of data.symbols) {
      expect(["up", "down", "mixed"], s.symbol).toContain(s.alignment);
      expect([1, -1, null], s.symbol).toContain(s.daily.trend);
      expect([1, -1, null], s.symbol).toContain(s.weekly.trend);
    }
  });

  it("has no duplicate symbols", () => {
    expect(new Set(data.symbols.map((s) => s.symbol)).size).toBe(data.symbols.length);
  });
});
