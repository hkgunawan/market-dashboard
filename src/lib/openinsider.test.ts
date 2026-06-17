import { describe, it, expect } from "vitest";
import { cleanTicker, filingLagOk } from "./openinsider";

describe("filingLagOk", () => {
  it("keeps timely filings (within the 2-day rule + buffer)", () => {
    expect(filingLagOk("2026-06-16", "2026-06-15")).toBe(true);
    expect(filingLagOk("2026-06-16", "2026-06-02")).toBe(true); // 14 days, at the edge
  });

  it("drops stale/anomalous filings (the TSM case: traded Mar, filed Jun)", () => {
    expect(filingLagOk("2026-06-16", "2026-03-30")).toBe(false);
  });

  it("keeps a row when a date can't be parsed (don't over-filter)", () => {
    expect(filingLagOk("", "2026-06-15")).toBe(true);
  });
});

describe("cleanTicker", () => {
  it("extracts the symbol from an anchor cell", () => {
    expect(cleanTicker('<a href="/AAPL">AAPL</a>')).toBe("AAPL");
  });

  it("strips tooltip markup and keeps the text after the last '>'", () => {
    expect(cleanTicker('<font color="red">tooltip junk>NVDA')).toBe("NVDA");
  });

  it("trims surrounding whitespace", () => {
    expect(cleanTicker("  MSFT  ")).toBe("MSFT");
  });
});
