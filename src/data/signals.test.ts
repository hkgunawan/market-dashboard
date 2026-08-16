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

  // Crypto and the US listings keep different calendars, so they must be
  // checked apart. On a Sunday the newest complete crypto bar is Saturday's
  // while the listed market's is still Friday's; pooled together, a perfectly
  // good dataset looks 98% stale. Pooling also lets fresh crypto hide a
  // frozen equity feed, which is the failure these checks exist to catch.
  const calendars = {
    crypto: data.symbols.filter((s) => s.class === "crypto"),
    listed: data.symbols.filter((s) => s.class !== "crypto"), // equities + the metal ETFs
  };
  const newestIn = (rows: typeof data.symbols) => rows.map((s) => s.asOf).sort().at(-1)!;

  it("is fresh — each calendar's newest bar is close to the generation time", () => {
    const maxAgeDays = { crypto: 2, listed: 5 }; // listed: a long weekend plus a holiday
    for (const [label, rows] of Object.entries(calendars)) {
      if (rows.length === 0) continue;
      const ageDays =
        (Date.parse(data.generatedAt) - Date.parse(`${newestIn(rows)}T00:00:00Z`)) / 86400_000;
      // A bar dated after the run that produced it is a bar that had barely
      // opened — the in-progress guard should already have dropped it.
      expect(ageDays, `${label} bar is dated after generatedAt`).toBeGreaterThanOrEqual(0);
      expect(ageDays, label).toBeLessThan(maxAgeDays[label as keyof typeof maxAgeDays]);
    }
  });

  it("is not a frozen feed — within each calendar, most symbols share the newest bar date", () => {
    for (const [label, rows] of Object.entries(calendars)) {
      if (rows.length === 0) continue;
      const onNewest = rows.filter((s) => s.asOf === newestIn(rows)).length;
      expect(onNewest / rows.length, label).toBeGreaterThanOrEqual(0.9);
    }
  });
});
