import { describe, it, expect } from "vitest";
import { cleanTicker } from "./openinsider";

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
