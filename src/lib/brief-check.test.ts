import { describe, it, expect } from "vitest";
import { checkBrief, findTickers, findFigures, parseValue } from "./brief-check";
import type { InsiderBuy } from "./openinsider";

const row = (ticker: string, value: string, over: Partial<InsiderBuy> = {}): InsiderBuy => ({
  filingDate: "2026-11-18",
  tradeDate: "2026-11-17",
  ticker,
  company: `${ticker} Corp`,
  insiders: "3 insiders",
  title: "Real Estate",
  price: "$10.00",
  qty: "1,000",
  deltaOwn: "+5%",
  value,
  ...over,
});

// Rows reconstructed to match the real brief published on 19 Nov 2026
// (values rounded the way the brief quotes them).
const rows = [
  row("BPRE", "+$40,391,212"),
  row("RMIX", "+$1,074,337"),
  row("FUN", "+$30,660,480"),
  row("STWD", "+$18,729,950"),
  row("BPRE", "+$3,221,875", { insiders: "Kamfar Ramin", title: "Dir" }),
];

const REAL_BRIEF =
  "Bluerock Private Real Estate Fund (BPRE) generated the largest total transaction value at $40.39 million across three insiders, including a $3.22 million individual purchase by director Ramin Kamfar. Suncrete, Inc. (RMIX) stood out for overall participation, attracting a table-topping four insiders who acquired a combined $1,074,337. Real estate investment trusts and closed-end funds accounted for the largest commitments overall, with BPRE, Six Flags Entertainment Corporation (FUN) at $30.66 million, and Starwood Property Trust (STWD) at $18.73 million driving the three highest cluster totals.";

describe("checkBrief", () => {
  it("passes a real published brief whose facts all match the data", () => {
    expect(checkBrief(REAL_BRIEF, rows)).toEqual({ ok: true, problems: [] });
  });

  it("flags a ticker the model was never shown", () => {
    const r = checkBrief("Heavy buying at NVDA led the day at $40.39 million.", rows);
    expect(r.ok).toBe(false);
    expect(r.problems).toContain("unknown ticker: NVDA");
  });

  it("flags a dollar figure that matches no row", () => {
    const r = checkBrief("BPRE led with $52.1 million across three insiders.", rows);
    expect(r.problems).toContain("figure not in data: $52.1 million");
  });

  it("accepts a figure rounded the way the sentence rounds it", () => {
    // $40,391,212 → "$40.4 million" and "$40 million" are both honest.
    expect(checkBrief("BPRE led at $40.4 million.", rows).ok).toBe(true);
    expect(checkBrief("BPRE led at $40 million.", rows).ok).toBe(true);
  });

  it("accepts a truncated figure, which the model really produces", () => {
    // Found on real data, 19 Nov 2026: $30,666,320 was written as "$30.66 million"
    // (truncated, not rounded to 30.67). Imprecise, but not invented.
    const fun = [row("FUN", "+$30,666,320")];
    expect(checkBrief("FUN drew $30.66 million.", fun).ok).toBe(true);
  });

  it("rejects a figure that is close but outside its own rounding", () => {
    // $40.30 million claims ±$5k; the true value is $91k away.
    expect(checkBrief("BPRE led at $40.30 million.", rows).ok).toBe(false);
  });

  it("flags investment advice and forecasts", () => {
    expect(checkBrief("BPRE looks undervalued.", rows).problems[0]).toMatch(/advice/);
    expect(checkBrief("Investors should buy RMIX.", rows).ok).toBe(false);
    expect(checkBrief("FUN will rally after this.", rows).ok).toBe(false);
  });

  it("does not treat describing insider buying as advice", () => {
    expect(checkBrief("Four insiders bought RMIX, the most buyers of any name.", rows).ok).toBe(true);
  });

  it("reports every problem, not just the first", () => {
    const r = checkBrief("NVDA is bullish at $99 million.", rows);
    expect(r.problems).toHaveLength(3);
  });
});

describe("findTickers", () => {
  it("ignores common upper-case words that are not tickers", () => {
    expect(findTickers("The CEO and CFO filed with the SEC; a REIT and an ETF.")).toEqual([]);
  });

  it("ignores mixed-case plurals like REITs", () => {
    expect(findTickers("REITs dominated.")).toEqual([]);
  });

  it("keeps class-suffixed tickers whole", () => {
    expect(findTickers("Buying at BRK.B continued.")).toEqual(["BRK.B"]);
  });
});

describe("findFigures", () => {
  it("reads scaled figures with their precision", () => {
    expect(findFigures("$40.39 million")[0]).toMatchObject({ amount: 40_390_000, tolerance: 10_000 });
    expect(findFigures("$1.2 billion")[0]).toMatchObject({ amount: 1_200_000_000 });
    expect(findFigures("$500K")[0]).toMatchObject({ amount: 500_000 });
  });

  it("treats a plain figure as exact", () => {
    expect(findFigures("$1,074,337")[0]).toMatchObject({ amount: 1_074_337, tolerance: 1 });
  });

  it("does not swallow a sentence-ending period as a decimal", () => {
    expect(findFigures("a combined $1,074,337.")[0].amount).toBe(1_074_337);
  });
});

describe("parseValue", () => {
  it("parses feed cells and rejects non-dollar ones", () => {
    expect(parseValue("+$4,941,950")).toBe(4_941_950);
    expect(parseValue("+5%")).toBeNull();
    expect(parseValue("")).toBeNull();
  });
});
