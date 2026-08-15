import { describe, it, expect, vi, afterEach } from "vitest";
import { getTdSeries } from "./twelvedata";

// Twelve Data returns newest-first. Every indicator in indicators.ts assumes
// chronological order, so a missed reverse computes every signal backwards —
// and it would look plausible on the page while being wrong everywhere.
const NEWEST_FIRST = {
  values: [
    { datetime: "2026-08-14", open: "3", high: "3", low: "3", close: "30" },
    { datetime: "2026-08-13", open: "2", high: "2", low: "2", close: "20" },
    { datetime: "2026-08-12", open: "1", high: "1", low: "1", close: "10" },
  ],
};

afterEach(() => vi.unstubAllGlobals());

const stubFetch = (body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));

describe("getTdSeries", () => {
  it("returns bars oldest-first", async () => {
    stubFetch(NEWEST_FIRST);
    const bars = await getTdSeries("AAPL", "1day", 3, "k");
    expect(bars.map((b) => b.close)).toEqual([10, 20, 30]);
  });

  it("parses dates as UTC midnight", async () => {
    stubFetch(NEWEST_FIRST);
    const bars = await getTdSeries("AAPL", "1day", 3, "k");
    expect(new Date(bars[0].time * 1000).toISOString()).toBe("2026-08-12T00:00:00.000Z");
  });

  it("sends the interval, outputsize and key it was given", async () => {
    stubFetch(NEWEST_FIRST);
    await getTdSeries("BTC/USD", "1week", 300, "scan-key");
    const url = String((globalThis.fetch as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]);
    expect(url).toContain("interval=1week");
    expect(url).toContain("outputsize=300");
    expect(url).toContain("apikey=scan-key");
    expect(url).toContain("symbol=BTC%2FUSD");
  });

  it("returns an empty array when the payload has no values", async () => {
    stubFetch({});
    expect(await getTdSeries("AAPL", "1day", 3, "k")).toEqual([]);
  });

  it("throws with the upstream message on an error payload", async () => {
    stubFetch({ status: "error", message: "symbol not found" });
    await expect(getTdSeries("NOPE", "1day", 3, "k")).rejects.toThrow(/symbol not found/);
  });
});
