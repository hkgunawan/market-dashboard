import { describe, it, expect } from "vitest";
import { UNIVERSE, liveUniverse, type AssetClass } from "./universe";

const CLASSES: AssetClass[] = ["equity", "metal", "crypto"];

describe("universe", () => {
  it("has roughly the S&P 100 plus metals and crypto", () => {
    expect(UNIVERSE.length).toBeGreaterThanOrEqual(100);
    expect(UNIVERSE.length).toBeLessThanOrEqual(110);
  });

  it("gives every entry a symbol, a name and a valid class", () => {
    for (const e of UNIVERSE) {
      expect(e.symbol, JSON.stringify(e)).toBeTruthy();
      expect(e.name, JSON.stringify(e)).toBeTruthy();
      expect(CLASSES, JSON.stringify(e)).toContain(e.class);
    }
  });

  it("has no duplicate symbols", () => {
    const seen = new Set(UNIVERSE.map((e) => e.symbol));
    expect(seen.size).toBe(UNIVERSE.length);
  });

  it("includes both metals as ETF proxies and both crypto pairs", () => {
    const metals = UNIVERSE.filter((e) => e.class === "metal").map((e) => e.symbol);
    const crypto = UNIVERSE.filter((e) => e.class === "crypto").map((e) => e.symbol);
    expect(metals.sort()).toEqual(["GLD", "SLV"]);
    expect(crypto.sort()).toEqual(["BTC/USD", "ETH/USD"]);
  });

  it("uses Twelve Data crypto notation, not the site's dash form", () => {
    expect(UNIVERSE.some((e) => e.symbol.includes("-USD"))).toBe(false);
  });

  it("excludes knownDead entries from liveUniverse()", () => {
    expect(liveUniverse().every((e) => !e.knownDead)).toBe(true);
    expect(liveUniverse().length).toBeLessThanOrEqual(UNIVERSE.length);
  });
});
