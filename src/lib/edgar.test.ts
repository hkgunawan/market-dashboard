import { describe, it, expect } from "vitest";
import { scoreMove, diffFund, type Holding, type FundMove } from "./edgar";

const fund = { name: "Test Fund", manager: "Tester" };
const h = (name: string, cusip: string, shares: number, value: number): Holding => ({ name, cusip, shares, value });

describe("scoreMove — conviction scoring", () => {
  const mk = (type: FundMove["type"], pctChange: number | null): FundMove => ({
    fund: "F",
    manager: "M",
    type,
    pctChange,
    sharesNow: 0,
    sharesPrev: 0,
    estDollarsMoved: 0,
  });

  it("weights a brand-new position highest", () => {
    expect(scoreMove(mk("NEW", null))).toBe(2);
  });

  it("rewards a large add more than a small one", () => {
    expect(scoreMove(mk("ADD", 30))).toBe(1.5);
    expect(scoreMove(mk("ADD", 10))).toBe(1);
  });

  it("penalizes trims, and a big trim more", () => {
    expect(scoreMove(mk("TRIM", -60))).toBe(-1);
    expect(scoreMove(mk("TRIM", -20))).toBe(-0.5);
  });

  it("penalizes a full exit hardest", () => {
    expect(scoreMove(mk("EXIT", -100))).toBe(-1.5);
  });
});

describe("diffFund — quarter-over-quarter position diff", () => {
  it("classifies NEW / ADD / EXIT and estimates dollars moved", () => {
    const prev = new Map<string, Holding>([
      ["A", h("APPLE INC", "A", 100, 15000)], // ~$150/sh
      ["M", h("MICROSOFT", "M", 50, 20000)], // dropped next quarter -> EXIT
    ]);
    const now = new Map<string, Holding>([
      ["A", h("APPLE INC", "A", 150, 24000)], // ~$160/sh, +50 shares -> ADD +50%
      ["N", h("NVIDIA", "N", 10, 5000)], // ~$500/sh, brand new -> NEW
    ]);

    const byCusip = Object.fromEntries(diffFund(fund, now, prev).map((m) => [m.cusip, m.move]));

    expect(byCusip.A.type).toBe("ADD");
    expect(byCusip.A.pctChange).toBe(50);
    expect(byCusip.A.estDollarsMoved).toBe(50 * 160); // |delta shares| * current avg price

    expect(byCusip.N.type).toBe("NEW");
    expect(byCusip.N.pctChange).toBeNull();
    expect(byCusip.N.estDollarsMoved).toBe(10 * 500);

    expect(byCusip.M.type).toBe("EXIT");
    expect(byCusip.M.pctChange).toBe(-100);
    expect(byCusip.M.estDollarsMoved).toBe(20000);
  });

  it("ignores positions whose share count did not change", () => {
    const holdings = new Map<string, Holding>([["A", h("APPLE INC", "A", 100, 15000)]]);
    expect(diffFund(fund, holdings, new Map(holdings))).toHaveLength(0);
  });
});
