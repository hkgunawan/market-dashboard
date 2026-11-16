import { describe, expect, it } from "vitest";
import { cdnCache, isValidSymbol, parseSymbols, tradingViewUrl } from "./symbols";

describe("isValidSymbol", () => {
  it("accepts the ticker shapes the site uses", () => {
    for (const s of ["AAPL", "brk.b", "BRK/B", "BTC-USD", "XAU/USD", "^GSPC", "CL=F", "PAXG-USD"]) {
      expect(isValidSymbol(s), s).toBe(true);
    }
  });

  it("rejects batches, whitespace, URL-ish input and over-long strings", () => {
    for (const s of ["", "AAPL,MSFT", "AAPL MSFT", "AAPL&apikey=x", "../etc", "A?b", "ABCDEFGHIJKLMNOPQ", "-USD"]) {
      expect(isValidSymbol(s), s).toBe(false);
    }
  });
});

describe("parseSymbols", () => {
  it("trims, upper-cases, de-duplicates and drops invalid entries", () => {
    expect(parseSymbols(" aapl, MSFT ,aapl,,bad symbol,BTC-USD", 10)).toEqual(["AAPL", "MSFT", "BTC-USD"]);
  });

  it("caps the list", () => {
    expect(parseSymbols("A,B,C,D", 2)).toEqual(["A", "B"]);
  });

  it("handles a missing param", () => {
    expect(parseSymbols(null, 5)).toEqual([]);
  });
});

describe("cdnCache", () => {
  it("builds an s-maxage header with a 2x stale window", () => {
    expect(cdnCache(60)).toEqual({ "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" });
  });
});

describe("tradingViewUrl", () => {
  it("drops the pair separator for crypto, in either notation", () => {
    expect(tradingViewUrl("BTC/USD")).toBe("https://www.tradingview.com/symbols/BTCUSD/");
    expect(tradingViewUrl("ETH-USD")).toBe("https://www.tradingview.com/symbols/ETHUSD/");
    expect(tradingViewUrl("paxg-usd")).toBe("https://www.tradingview.com/symbols/PAXGUSD/");
  });

  it("passes equities and ETFs through, keeping share-class dots", () => {
    expect(tradingViewUrl("AAPL")).toBe("https://www.tradingview.com/symbols/AAPL/");
    expect(tradingViewUrl("BRK.B")).toBe("https://www.tradingview.com/symbols/BRK.B/");
  });

  it("turns a share-class slash into a dot", () => {
    expect(tradingViewUrl("BRK/B")).toBe("https://www.tradingview.com/symbols/BRK.B/");
  });
});
