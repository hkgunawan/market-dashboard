import { describe, it, expect } from "vitest";
import { toBinancePair } from "./binance";

describe("toBinancePair", () => {
  it("maps a USD crypto symbol to the Binance USDT pair", () => {
    expect(toBinancePair("BTC-USD")).toBe("BTCUSDT");
    expect(toBinancePair("ETH-USD")).toBe("ETHUSDT");
    expect(toBinancePair("PAXG-USD")).toBe("PAXGUSDT"); // tokenized gold
  });

  it("is case-insensitive", () => {
    expect(toBinancePair("btc-usd")).toBe("BTCUSDT");
  });

  it("returns null for symbols that are not in X-USD form", () => {
    expect(toBinancePair("AAPL")).toBeNull();
    expect(toBinancePair("BTC")).toBeNull();
    expect(toBinancePair("BTC-EUR")).toBeNull();
  });

  it("returns null for an over-long base symbol", () => {
    expect(toBinancePair("ABCDEFGHIJK-USD")).toBeNull(); // 11 chars > 10
  });
});
