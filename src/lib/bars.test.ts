import { describe, it, expect } from "vitest";
import { isoWeekStartUtc, utcDate, dropInProgressDaily, dropInProgressWeekly } from "./bars";
import type { Candle } from "./yahoo";

const bar = (iso: string): Candle => {
  const time = Math.floor(Date.parse(`${iso}T00:00:00Z`) / 1000);
  return { time, open: 1, high: 1, low: 1, close: 1 };
};

describe("isoWeekStartUtc", () => {
  it("returns the Monday of the week", () => {
    expect(isoWeekStartUtc(new Date("2026-08-15T12:00:00Z"))).toBe("2026-08-10");
    expect(isoWeekStartUtc(new Date("2026-08-10T00:00:00Z"))).toBe("2026-08-10");
  });

  it("treats Sunday as the end of the week, not the start", () => {
    expect(isoWeekStartUtc(new Date("2026-08-16T23:59:00Z"))).toBe("2026-08-10");
    expect(isoWeekStartUtc(new Date("2026-08-17T00:00:00Z"))).toBe("2026-08-17");
  });
});

describe("utcDate", () => {
  it("formats as YYYY-MM-DD in UTC", () => {
    expect(utcDate(new Date("2026-08-15T23:30:00Z"))).toBe("2026-08-15");
  });
});

describe("dropInProgressDaily", () => {
  const bars = [bar("2026-08-13"), bar("2026-08-14"), bar("2026-08-15")];
  const now = new Date("2026-08-15T23:30:00Z");

  it("drops the current UTC day for crypto, which trades 24/7", () => {
    const out = dropInProgressDaily(bars, "crypto", now);
    expect(out.map((b) => utcDate(new Date(b.time * 1000)))).toEqual(["2026-08-13", "2026-08-14"]);
  });

  it("keeps the last bar for equities, whose session has closed by scan time", () => {
    expect(dropInProgressDaily(bars, "equity", now)).toHaveLength(3);
  });

  it("keeps the last bar for metals, which are US-listed ETFs", () => {
    expect(dropInProgressDaily(bars, "metal", now)).toHaveLength(3);
  });

  it("leaves crypto alone when its last bar is already a past day", () => {
    const past = [bar("2026-08-12"), bar("2026-08-13")];
    expect(dropInProgressDaily(past, "crypto", now)).toHaveLength(2);
  });

  // The scan starts at 23:30 UTC and runs ~35 minutes, so it crosses midnight
  // every night, and crypto is scanned last. By then Twelve Data has opened a
  // bar for the new UTC day that is minutes old. Against a `now` captured at
  // run start it looks like a future date, so an equality check keeps it and
  // the latest close becomes a near-empty stub.
  it("drops a crypto bar dated after now, which is still in progress", () => {
    const acrossMidnight = [bar("2026-08-14"), bar("2026-08-15"), bar("2026-08-16")];
    const out = dropInProgressDaily(acrossMidnight, "crypto", now);
    expect(out.map((b) => utcDate(new Date(b.time * 1000)))).toEqual(["2026-08-14", "2026-08-15"]);
  });

  it("returns an empty array unchanged", () => {
    expect(dropInProgressDaily([], "crypto", now)).toEqual([]);
  });
});

describe("dropInProgressWeekly", () => {
  it("drops a final bar that falls in the current week", () => {
    const bars = [bar("2026-07-27"), bar("2026-08-03"), bar("2026-08-10")];
    const out = dropInProgressWeekly(bars, new Date("2026-08-15T23:30:00Z"));
    expect(out).toHaveLength(2);
    expect(utcDate(new Date(out[1].time * 1000))).toBe("2026-08-03");
  });

  // Same midnight crossing, one day later: a Sunday run finishes on Monday,
  // by which point the newest weekly bar belongs to a week that has not
  // started as far as the run-start clock is concerned.
  it("drops a final bar from a week later than now's", () => {
    const bars = [bar("2026-08-03"), bar("2026-08-10"), bar("2026-08-17")];
    const out = dropInProgressWeekly(bars, new Date("2026-08-16T23:30:00Z"));
    expect(out.map((b) => utcDate(new Date(b.time * 1000)))).toEqual(["2026-08-03", "2026-08-10"]);
  });

  it("keeps a final bar from a completed week", () => {
    const bars = [bar("2026-07-27"), bar("2026-08-03")];
    expect(dropInProgressWeekly(bars, new Date("2026-08-15T23:30:00Z"))).toHaveLength(2);
  });

  it("returns an empty array unchanged", () => {
    expect(dropInProgressWeekly([], new Date("2026-08-15T23:30:00Z"))).toEqual([]);
  });
});
