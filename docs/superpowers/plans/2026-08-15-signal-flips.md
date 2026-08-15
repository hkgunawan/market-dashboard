# Signal Flips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/flips` page that shows which of ~105 big-cap symbols recently changed Supertrend direction, on the daily and weekly timeframes.

**Architecture:** A nightly GitHub Actions job calls Twelve Data twice per symbol (daily + weekly bars), computes Supertrend and MACD using the repo's existing tested indicator math, derives when each trend last flipped, and commits `src/data/signals.json`. Vercel auto-deploys and the page renders that JSON statically — no runtime API calls.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Vitest · Twelve Data API · GitHub Actions

**Spec:** `docs/superpowers/specs/2026-08-15-signal-flips-design.md`

## Global Constraints

- **Zero budget.** No paid API tiers, no paid services, no new hosted infrastructure. Twelve Data free tier only.
- **Twelve Data is the only data source.** Yahoo is confirmed unreachable from GitHub Actions AND from Vercel (see the spec's Evidence table). Do not add a Yahoo call path.
- **API budget:** 105 symbols × 2 intervals = **210 calls per run**, against limits of **8 req/min** and **800 req/day**. Pace requests at **7.5s** minimum.
- **Scan key:** read `TWELVEDATA_SCAN_KEY`, falling back to `TWELVEDATA_API_KEY`. Never hardcode a key; never commit `.env.local`.
- **Copy rule:** no "buy", "sell", "recommend", or "signal to enter" wording anywhere in user-visible text. This is indicator output, not advice. Every page view states the rule and a disclaimer.
- **Metals are ETF proxies.** Label them "gold (GLD)" and "silver (SLV)", never bare "gold"/"silver". Spot `XAG/USD` is paid-tier only.
- **Node 22** for all local commands. The default shell here is Node 18 (Herd nvm) and Vitest 4 will fail on it. Prefix commands with `export PATH="/opt/homebrew/opt/node@22/bin:$PATH"`.
- **Dates** are `YYYY-MM-DD` in **UTC** throughout.
- **Indicator math is not to be reimplemented.** Import from `src/lib/indicators.ts`.

## File Structure

| File | Responsibility |
|---|---|
| `src/data/universe.json` | The ~105 symbols to scan. Data only. |
| `src/lib/universe.ts` | Universe types + typed loader. |
| `src/lib/bars.ts` | Dropping in-progress (partial) bars. ISO-week helpers. |
| `src/lib/flips.ts` | Signal types; `flippedAt` derivation; alignment; fresh-list selection. |
| `src/lib/twelvedata.ts` | *(modify)* add an explicit interval/outputsize fetch + usage check. |
| `scripts/scan-signals.ts` | Orchestration only — fetch, trim, compute, write. No math. |
| `src/data/signals.json` | Generated output, committed. |
| `src/app/flips/page.tsx` | Server component; reads the JSON, renders header + fresh list. |
| `src/app/flips/flips-table.tsx` | Client component; the sortable full board. |
| `src/app/flips/layout.tsx` | Page metadata. |
| `.github/workflows/scan.yml` | Nightly run + failure alerting. |

---

### Task 1: Universe data and schema validation

**Files:**
- Create: `src/data/universe.json`
- Create: `src/lib/universe.ts`
- Test: `src/lib/universe.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `type AssetClass = "equity" | "metal" | "crypto"`; `interface UniverseEntry { symbol: string; name: string; class: AssetClass; knownDead?: boolean }`; `const UNIVERSE: UniverseEntry[]`; `function liveUniverse(): UniverseEntry[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/universe.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && npx vitest run src/lib/universe.test.ts`
Expected: FAIL — cannot resolve `./universe`.

- [ ] **Step 3: Teach Vitest the `@/` path alias**

`tsconfig.json` maps `@/*` to `./src/*`, but `vitest.config.ts` does not, and every
existing test imports relatively (`./indicators`) so the gap has never shown up.
This plan's tests import `@/lib/universe` and `@/data/signals.json`, which will
fail to resolve until the alias is mirrored.

Replace `vitest.config.ts` with:

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    // mirrors the "@/*" -> "./src/*" mapping in tsconfig.json
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
```

Run `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && npm test` and confirm the
existing suite still passes before continuing.

- [ ] **Step 4: Create the universe data**

Create `src/data/universe.json` with exactly this content — 101 equities plus 4:

```json
[
{ "symbol": "AAPL", "name": "Apple", "class": "equity" },
{ "symbol": "ABBV", "name": "AbbVie", "class": "equity" },
{ "symbol": "ABT", "name": "Abbott Laboratories", "class": "equity" },
{ "symbol": "ACN", "name": "Accenture", "class": "equity" },
{ "symbol": "ADBE", "name": "Adobe", "class": "equity" },
{ "symbol": "AIG", "name": "American International Group", "class": "equity" },
{ "symbol": "AMD", "name": "Advanced Micro Devices", "class": "equity" },
{ "symbol": "AMGN", "name": "Amgen", "class": "equity" },
{ "symbol": "AMT", "name": "American Tower", "class": "equity" },
{ "symbol": "AMZN", "name": "Amazon", "class": "equity" },
{ "symbol": "AVGO", "name": "Broadcom", "class": "equity" },
{ "symbol": "AXP", "name": "American Express", "class": "equity" },
{ "symbol": "BA", "name": "Boeing", "class": "equity" },
{ "symbol": "BAC", "name": "Bank of America", "class": "equity" },
{ "symbol": "BK", "name": "BNY Mellon", "class": "equity" },
{ "symbol": "BKNG", "name": "Booking Holdings", "class": "equity" },
{ "symbol": "BLK", "name": "BlackRock", "class": "equity" },
{ "symbol": "BMY", "name": "Bristol-Myers Squibb", "class": "equity" },
{ "symbol": "BRK.B", "name": "Berkshire Hathaway B", "class": "equity" },
{ "symbol": "C", "name": "Citigroup", "class": "equity" },
{ "symbol": "CAT", "name": "Caterpillar", "class": "equity" },
{ "symbol": "CHTR", "name": "Charter Communications", "class": "equity" },
{ "symbol": "CL", "name": "Colgate-Palmolive", "class": "equity" },
{ "symbol": "CMCSA", "name": "Comcast", "class": "equity" },
{ "symbol": "COF", "name": "Capital One", "class": "equity" },
{ "symbol": "COP", "name": "ConocoPhillips", "class": "equity" },
{ "symbol": "COST", "name": "Costco", "class": "equity" },
{ "symbol": "CRM", "name": "Salesforce", "class": "equity" },
{ "symbol": "CSCO", "name": "Cisco", "class": "equity" },
{ "symbol": "CVS", "name": "CVS Health", "class": "equity" },
{ "symbol": "CVX", "name": "Chevron", "class": "equity" },
{ "symbol": "DE", "name": "Deere", "class": "equity" },
{ "symbol": "DHR", "name": "Danaher", "class": "equity" },
{ "symbol": "DIS", "name": "Walt Disney", "class": "equity" },
{ "symbol": "DUK", "name": "Duke Energy", "class": "equity" },
{ "symbol": "EMR", "name": "Emerson Electric", "class": "equity" },
{ "symbol": "F", "name": "Ford", "class": "equity" },
{ "symbol": "FDX", "name": "FedEx", "class": "equity" },
{ "symbol": "GD", "name": "General Dynamics", "class": "equity" },
{ "symbol": "GE", "name": "GE Aerospace", "class": "equity" },
{ "symbol": "GILD", "name": "Gilead Sciences", "class": "equity" },
{ "symbol": "GM", "name": "General Motors", "class": "equity" },
{ "symbol": "GOOG", "name": "Alphabet C", "class": "equity" },
{ "symbol": "GOOGL", "name": "Alphabet A", "class": "equity" },
{ "symbol": "GS", "name": "Goldman Sachs", "class": "equity" },
{ "symbol": "HD", "name": "Home Depot", "class": "equity" },
{ "symbol": "HON", "name": "Honeywell", "class": "equity" },
{ "symbol": "IBM", "name": "IBM", "class": "equity" },
{ "symbol": "INTC", "name": "Intel", "class": "equity" },
{ "symbol": "INTU", "name": "Intuit", "class": "equity" },
{ "symbol": "JNJ", "name": "Johnson & Johnson", "class": "equity" },
{ "symbol": "JPM", "name": "JPMorgan Chase", "class": "equity" },
{ "symbol": "KHC", "name": "Kraft Heinz", "class": "equity" },
{ "symbol": "KO", "name": "Coca-Cola", "class": "equity" },
{ "symbol": "LIN", "name": "Linde", "class": "equity" },
{ "symbol": "LLY", "name": "Eli Lilly", "class": "equity" },
{ "symbol": "LMT", "name": "Lockheed Martin", "class": "equity" },
{ "symbol": "LOW", "name": "Lowe's", "class": "equity" },
{ "symbol": "MA", "name": "Mastercard", "class": "equity" },
{ "symbol": "MCD", "name": "McDonald's", "class": "equity" },
{ "symbol": "MDLZ", "name": "Mondelez", "class": "equity" },
{ "symbol": "MDT", "name": "Medtronic", "class": "equity" },
{ "symbol": "MET", "name": "MetLife", "class": "equity" },
{ "symbol": "META", "name": "Meta Platforms", "class": "equity" },
{ "symbol": "MMM", "name": "3M", "class": "equity" },
{ "symbol": "MO", "name": "Altria", "class": "equity" },
{ "symbol": "MRK", "name": "Merck", "class": "equity" },
{ "symbol": "MS", "name": "Morgan Stanley", "class": "equity" },
{ "symbol": "MSFT", "name": "Microsoft", "class": "equity" },
{ "symbol": "NEE", "name": "NextEra Energy", "class": "equity" },
{ "symbol": "NFLX", "name": "Netflix", "class": "equity" },
{ "symbol": "NKE", "name": "Nike", "class": "equity" },
{ "symbol": "NVDA", "name": "NVIDIA", "class": "equity" },
{ "symbol": "ORCL", "name": "Oracle", "class": "equity" },
{ "symbol": "PEP", "name": "PepsiCo", "class": "equity" },
{ "symbol": "PFE", "name": "Pfizer", "class": "equity" },
{ "symbol": "PG", "name": "Procter & Gamble", "class": "equity" },
{ "symbol": "PLTR", "name": "Palantir", "class": "equity" },
{ "symbol": "PM", "name": "Philip Morris International", "class": "equity" },
{ "symbol": "PYPL", "name": "PayPal", "class": "equity" },
{ "symbol": "QCOM", "name": "Qualcomm", "class": "equity" },
{ "symbol": "RTX", "name": "RTX", "class": "equity" },
{ "symbol": "SBUX", "name": "Starbucks", "class": "equity" },
{ "symbol": "SCHW", "name": "Charles Schwab", "class": "equity" },
{ "symbol": "SO", "name": "Southern Company", "class": "equity" },
{ "symbol": "SPG", "name": "Simon Property Group", "class": "equity" },
{ "symbol": "T", "name": "AT&T", "class": "equity" },
{ "symbol": "TGT", "name": "Target", "class": "equity" },
{ "symbol": "TMO", "name": "Thermo Fisher Scientific", "class": "equity" },
{ "symbol": "TMUS", "name": "T-Mobile US", "class": "equity" },
{ "symbol": "TSLA", "name": "Tesla", "class": "equity" },
{ "symbol": "TXN", "name": "Texas Instruments", "class": "equity" },
{ "symbol": "UNH", "name": "UnitedHealth", "class": "equity" },
{ "symbol": "UNP", "name": "Union Pacific", "class": "equity" },
{ "symbol": "UPS", "name": "United Parcel Service", "class": "equity" },
{ "symbol": "USB", "name": "U.S. Bancorp", "class": "equity" },
{ "symbol": "V", "name": "Visa", "class": "equity" },
{ "symbol": "VZ", "name": "Verizon", "class": "equity" },
{ "symbol": "WFC", "name": "Wells Fargo", "class": "equity" },
{ "symbol": "WMT", "name": "Walmart", "class": "equity" },
{ "symbol": "XOM", "name": "Exxon Mobil", "class": "equity" },
{ "symbol": "GLD", "name": "Gold (SPDR Gold Shares)", "class": "metal" },
{ "symbol": "SLV", "name": "Silver (iShares Silver Trust)", "class": "metal" },
{ "symbol": "BTC/USD", "name": "Bitcoin", "class": "crypto" },
{ "symbol": "ETH/USD", "name": "Ethereum", "class": "crypto" }
]
```

Note `BRK.B` — Twelve Data uses a dot for share classes, not the dash Yahoo uses.

**Index membership drifts.** This list reflects the S&P 100 as of early 2026; a few names may have been replaced. Any symbol Twelve Data rejects will simply fail its fetch, be logged, and be skipped by the 90% floor in Task 5 — mark those `"knownDead": true` when they show up in a run log.

- [ ] **Step 5: Write the loader**

Create `src/lib/universe.ts`:

```ts
import raw from "@/data/universe.json";

export type AssetClass = "equity" | "metal" | "crypto";

export interface UniverseEntry {
  symbol: string;
  name: string;
  class: AssetClass;
  /** Delisted or permanently unavailable. Kept for the record, skipped by the
   *  scanner, and excluded from the success-rate floor so index churn cannot
   *  slowly starve the error budget. */
  knownDead?: boolean;
}

export const UNIVERSE: UniverseEntry[] = raw as UniverseEntry[];

export function liveUniverse(): UniverseEntry[] {
  return UNIVERSE.filter((e) => !e.knownDead);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && npx vitest run src/lib/universe.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts src/data/universe.json src/lib/universe.ts src/lib/universe.test.ts
git commit -m "Add the signal-scan universe: S&P 100 plus GLD, SLV, BTC and ETH"
```

---

### Task 2: Twelve Data series fetch with explicit interval

**Files:**
- Modify: `src/lib/twelvedata.ts`
- Test: `src/lib/twelvedata.test.ts`

**Why:** the existing `getTdHistory` is driven by the `RANGE_SERIES` map, which has no entry for a 520-bar daily or 300-bar weekly pull, and no way to pass a different API key.

**Interfaces:**
- Consumes: `Candle` from `./yahoo`
- Produces: `type TdInterval = "1day" | "1week"`; `async function getTdSeries(symbol: string, interval: TdInterval, outputsize: number, apiKey?: string): Promise<Candle[]>`; `async function getTdUsage(apiKey?: string): Promise<TdUsage>` where `interface TdUsage { currentUsage: number; dailyUsage: number; planDailyLimit: number }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/twelvedata.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && npx vitest run src/lib/twelvedata.test.ts`
Expected: FAIL — `getTdSeries` is not exported.

- [ ] **Step 3: Add the key parameter to the private helper**

In `src/lib/twelvedata.ts`, change the `td` helper signature and key resolution:

```ts
async function td<T>(path: string, params: Record<string, string>, apiKey?: string): Promise<T> {
  const key = apiKey ?? process.env.TWELVEDATA_API_KEY;
  if (!key) throw new Error("TWELVEDATA_API_KEY not set");
  const qs = new URLSearchParams({ ...params, apikey: key, timezone: "UTC" });
  const res = await fetch(`${BASE}${path}?${qs}`, { next: { revalidate: 45 } });
  const data = (await res.json()) as T & TdError;
  if (!res.ok || data.status === "error") {
    throw new Error(`Twelve Data: ${data.message ?? res.status}`);
  }
  return data;
}
```

Existing callers pass two arguments and are unaffected.

- [ ] **Step 4: Add the series fetch and usage check**

Append to `src/lib/twelvedata.ts`:

```ts
export type TdInterval = "1day" | "1week";

interface TdSeriesRow {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
}

// Like getTdHistory, but the caller picks the interval, the depth and the key.
// The scanner needs 520 daily / 300 weekly bars, which RANGE_SERIES cannot express.
export async function getTdSeries(
  symbol: string,
  interval: TdInterval,
  outputsize: number,
  apiKey?: string
): Promise<Candle[]> {
  const data = await td<{ values?: TdSeriesRow[] }>(
    "/time_series",
    { symbol, interval, outputsize: String(outputsize) },
    apiKey
  );
  return (data.values ?? [])
    .map((v) => ({
      time: Math.floor(
        Date.parse(v.datetime.includes(":") ? `${v.datetime}Z` : `${v.datetime}T00:00:00Z`) / 1000
      ),
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
    }))
    .reverse(); // Twelve Data returns newest-first
}

export interface TdUsage {
  currentUsage: number;
  dailyUsage: number;
  planDailyLimit: number;
}

export async function getTdUsage(apiKey?: string): Promise<TdUsage> {
  const u = await td<{
    current_usage: number;
    daily_usage: number;
    plan_daily_limit: number;
  }>("/api_usage", {}, apiKey);
  return {
    currentUsage: u.current_usage,
    dailyUsage: u.daily_usage,
    planDailyLimit: u.plan_daily_limit,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && npx vitest run src/lib/twelvedata.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Run the whole suite to confirm nothing regressed**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && npm test`
Expected: PASS, including the pre-existing indicator/edgar/openinsider/binance tests.

- [ ] **Step 7: Commit**

```bash
git add src/lib/twelvedata.ts src/lib/twelvedata.test.ts
git commit -m "twelvedata: add explicit-interval series fetch and usage check"
```

---

### Task 3: Drop in-progress bars

**Files:**
- Create: `src/lib/bars.ts`
- Test: `src/lib/bars.test.ts`

**Why:** a partial bar makes a signal flicker. Twelve Data includes the current in-progress week in weekly output (verified: latest weekly bar `2026-08-10` on a run dated `2026-08-15`), and crypto's current UTC day is always partial.

**Interfaces:**
- Consumes: `Candle` from `./yahoo`; `AssetClass` from `./universe`
- Produces: `function isoWeekStartUtc(d: Date): string`; `function utcDate(d: Date): string`; `function dropInProgressDaily(bars: Candle[], cls: AssetClass, now: Date): Candle[]`; `function dropInProgressWeekly(bars: Candle[], now: Date): Candle[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/bars.test.ts`:

```ts
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

  it("keeps a final bar from a completed week", () => {
    const bars = [bar("2026-07-27"), bar("2026-08-03")];
    expect(dropInProgressWeekly(bars, new Date("2026-08-15T23:30:00Z"))).toHaveLength(2);
  });

  it("returns an empty array unchanged", () => {
    expect(dropInProgressWeekly([], new Date("2026-08-15T23:30:00Z"))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && npx vitest run src/lib/bars.test.ts`
Expected: FAIL — cannot resolve `./bars`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/bars.ts`:

```ts
import type { Candle } from "./yahoo";
import type { AssetClass } from "./universe";

/** YYYY-MM-DD in UTC. */
export function utcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The Monday (UTC) of the ISO week containing `d`, as YYYY-MM-DD. */
export function isoWeekStartUtc(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = t.getUTCDay(); // 0 = Sunday
  const backToMonday = dow === 0 ? 6 : dow - 1;
  t.setUTCDate(t.getUTCDate() - backToMonday);
  return utcDate(t);
}

// Crypto trades 24/7, so at scan time the current UTC day is always partial.
// Equities and the metal ETFs are US-listed; the scan runs after the close, so
// their final bar is a completed session.
export function dropInProgressDaily(bars: Candle[], cls: AssetClass, now: Date): Candle[] {
  if (cls !== "crypto" || bars.length === 0) return bars;
  const last = bars[bars.length - 1];
  return utcDate(new Date(last.time * 1000)) === utcDate(now) ? bars.slice(0, -1) : bars;
}

// Twelve Data labels weekly bars by week start and includes the in-progress week.
export function dropInProgressWeekly(bars: Candle[], now: Date): Candle[] {
  if (bars.length === 0) return bars;
  const last = bars[bars.length - 1];
  const lastWeek = isoWeekStartUtc(new Date(last.time * 1000));
  return lastWeek === isoWeekStartUtc(now) ? bars.slice(0, -1) : bars;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && npx vitest run src/lib/bars.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/bars.ts src/lib/bars.test.ts
git commit -m "Add in-progress bar trimming for daily and weekly series"
```

---

### Task 4: Flip derivation, alignment and fresh-list selection

**Files:**
- Create: `src/lib/flips.ts`
- Test: `src/lib/flips.test.ts`

**Why this task is the risky one:** the naive `direction[i] !== direction[i-1]` rule reports a **false recent flip on nearly every symbol**, because `supertrend()` leaves `direction` as `null` through the ATR warmup (`indicators.ts:83`) and the first `null → 1` transition satisfies `!==`. It also seeds `trend = 1` before seeing data, so a symbol that was in a downtrend at the window's start produces an artificial flip. Both must be handled.

**Interfaces:**
- Consumes: `supertrend`, `macdCM`, `type Trend` from `./indicators`; `Candle` from `./yahoo`; `AssetClass` from `./universe`; `utcDate` from `./bars`
- Produces:
  - `const SEED_ZONE_BARS = 20`
  - `interface TimeframeSignal { trend: Trend | null; macdHist: number | null; flippedAt: string | null }`
  - `type Alignment = "up" | "down" | "mixed"`
  - `interface SymbolSignal { symbol, name, class: AssetClass, close, asOf, daily: TimeframeSignal, weekly: TimeframeSignal, alignment: Alignment }`
  - `interface SignalsFile { generatedAt: string; symbols: SymbolSignal[] }`
  - `function findFlippedAt(direction: (Trend | null)[], times: number[], seedZone?: number): string | null`
  - `function timeframeSignal(bars: Candle[]): TimeframeSignal`
  - `function alignmentOf(daily: TimeframeSignal, weekly: TimeframeSignal): Alignment`
  - `function freshFlips(symbols: SymbolSignal[], now: Date, days?: number, cap?: number): { rows: SymbolSignal[]; total: number }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/flips.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  findFlippedAt,
  timeframeSignal,
  alignmentOf,
  freshFlips,
  SEED_ZONE_BARS,
  type SymbolSignal,
  type TimeframeSignal,
} from "./flips";
import type { Trend } from "./indicators";
import type { Candle } from "./yahoo";

// day N as a unix timestamp, counting from 2026-01-01
const t = (n: number) => Math.floor(Date.parse("2026-01-01T00:00:00Z") / 1000) + n * 86400;
const times = (len: number) => Array.from({ length: len }, (_, i) => t(i));

// a direction array: `warmup` nulls, then the given trends
const dir = (warmup: number, trends: Trend[]): (Trend | null)[] => [
  ...Array<null>(warmup).fill(null),
  ...trends,
];

describe("findFlippedAt", () => {
  it("returns the date of the most recent genuine direction change", () => {
    // 25 bars of 1, then 5 of -1 -> flip at index 25
    const d = dir(0, [...Array<Trend>(25).fill(1), ...Array<Trend>(5).fill(-1)]);
    expect(findFlippedAt(d, times(30))).toBe("2026-01-26");
  });

  it("ignores the null -> value warmup transition", () => {
    // the ONLY change is null -> 1 at index 10; that is not a flip
    const d = dir(10, Array<Trend>(30).fill(1));
    expect(findFlippedAt(d, times(40))).toBeNull();
  });

  it("ignores a flip inside the seed zone, where supertrend's trend=1 seed dominates", () => {
    const trends: Trend[] = [...Array<Trend>(5).fill(1), ...Array<Trend>(35).fill(-1)];
    const d = dir(0, trends); // flip at index 5, inside the 20-bar seed zone
    expect(findFlippedAt(d, times(40))).toBeNull();
  });

  it("returns null for a series that never flips", () => {
    expect(findFlippedAt(dir(10, Array<Trend>(30).fill(-1)), times(40))).toBeNull();
  });

  it("returns the latest flip when there are several", () => {
    const trends: Trend[] = [
      ...Array<Trend>(25).fill(1),
      ...Array<Trend>(5).fill(-1),
      ...Array<Trend>(5).fill(1),
    ];
    expect(findFlippedAt(dir(0, trends), times(35))).toBe("2026-01-31");
  });

  it("returns null for an empty or all-null series", () => {
    expect(findFlippedAt([], [])).toBeNull();
    expect(findFlippedAt(dir(5, []), times(5))).toBeNull();
  });

  it("counts the seed zone from the first non-null bar, not from index 0", () => {
    // 30 nulls, then 5 bars of 1 and a flip -> that flip is inside the seed zone
    const d = dir(30, [...Array<Trend>(5).fill(1), ...Array<Trend>(3).fill(-1)]);
    expect(findFlippedAt(d, times(38))).toBeNull();
    expect(SEED_ZONE_BARS).toBe(20);
  });
});

describe("timeframeSignal", () => {
  const rising: Candle[] = Array.from({ length: 60 }, (_, i) => ({
    time: t(i),
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i,
  }));

  it("reports an uptrend for a steadily rising series", () => {
    const s = timeframeSignal(rising);
    expect(s.trend).toBe(1);
    expect(typeof s.macdHist).toBe("number");
  });

  it("returns nulls for a series too short to warm up", () => {
    const s = timeframeSignal(rising.slice(0, 3));
    expect(s.trend).toBeNull();
    expect(s.flippedAt).toBeNull();
  });

  it("returns an all-null signal for no bars", () => {
    expect(timeframeSignal([])).toEqual({ trend: null, macdHist: null, flippedAt: null });
  });
});

describe("alignmentOf", () => {
  const sig = (trend: Trend | null): TimeframeSignal => ({ trend, macdHist: 0, flippedAt: null });

  it("is up only when both timeframes agree up", () => {
    expect(alignmentOf(sig(1), sig(1))).toBe("up");
  });

  it("is down only when both timeframes agree down", () => {
    expect(alignmentOf(sig(-1), sig(-1))).toBe("down");
  });

  it("is mixed when they disagree or either is unknown", () => {
    expect(alignmentOf(sig(1), sig(-1))).toBe("mixed");
    expect(alignmentOf(sig(1), sig(null))).toBe("mixed");
    expect(alignmentOf(sig(null), sig(null))).toBe("mixed");
  });
});

describe("freshFlips", () => {
  const mk = (symbol: string, flippedAt: string | null, weekly: Trend | null): SymbolSignal => ({
    symbol,
    name: symbol,
    class: "equity",
    close: 1,
    asOf: "2026-01-30",
    daily: { trend: 1, macdHist: 0, flippedAt },
    weekly: { trend: weekly, macdHist: 0, flippedAt: null },
    alignment: weekly === 1 ? "up" : "mixed",
  });
  const now = new Date("2026-01-30T23:30:00Z");

  it("keeps only flips inside the window", () => {
    const rows = [mk("A", "2026-01-29", 1), mk("B", "2026-01-01", 1), mk("C", null, 1)];
    expect(freshFlips(rows, now).rows.map((r) => r.symbol)).toEqual(["A"]);
  });

  it("sorts newest first", () => {
    const rows = [mk("OLD", "2026-01-25", 1), mk("NEW", "2026-01-29", 1)];
    expect(freshFlips(rows, now).rows.map((r) => r.symbol)).toEqual(["NEW", "OLD"]);
  });

  it("puts weekly-confirmed flips first within the same day", () => {
    const rows = [mk("UNCONFIRMED", "2026-01-29", -1), mk("CONFIRMED", "2026-01-29", 1)];
    expect(freshFlips(rows, now).rows.map((r) => r.symbol)).toEqual(["CONFIRMED", "UNCONFIRMED"]);
  });

  it("caps the list but reports the true total", () => {
    const rows = Array.from({ length: 34 }, (_, i) => mk(`S${i}`, "2026-01-29", 1));
    const out = freshFlips(rows, now);
    expect(out.rows).toHaveLength(10);
    expect(out.total).toBe(34);
  });

  it("treats the window as inclusive at its edge", () => {
    expect(freshFlips([mk("EDGE", "2026-01-24", 1)], now, 7).rows).toHaveLength(1);
    expect(freshFlips([mk("PAST", "2026-01-22", 1)], now, 7).rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && npx vitest run src/lib/flips.test.ts`
Expected: FAIL — cannot resolve `./flips`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/flips.ts`:

```ts
import { supertrend, macdCM, type Trend, type OHLC } from "./indicators";
import type { Candle } from "./yahoo";
import type { AssetClass } from "./universe";
import { utcDate } from "./bars";

/** supertrend() seeds trend = 1 before it has seen any data, so an early
 *  "flip" can be an artifact of that seed rather than a real signal. Flips
 *  within this many bars of the first non-null direction are not trusted. */
export const SEED_ZONE_BARS = 20;

const FRESH_DAYS = 7;
const FRESH_CAP = 10;

export interface TimeframeSignal {
  trend: Trend | null;
  macdHist: number | null;
  flippedAt: string | null;
}

export type Alignment = "up" | "down" | "mixed";

export interface SymbolSignal {
  symbol: string;
  name: string;
  class: AssetClass;
  /** Close of the bar the signal was computed on — NOT a live price. */
  close: number;
  /** That bar's date, YYYY-MM-DD UTC. */
  asOf: string;
  daily: TimeframeSignal;
  weekly: TimeframeSignal;
  alignment: Alignment;
}

export interface SignalsFile {
  generatedAt: string;
  symbols: SymbolSignal[];
}

// The most recent genuine direction change, or null.
//
// Two rules beyond a plain `!==`, both load-bearing:
//   1. Both sides must be non-null. supertrend() leaves direction null through
//      the ATR warmup, and counting that null -> value transition would report
//      a false recent flip on nearly every symbol.
//   2. Flips within SEED_ZONE_BARS of the first real bar are discarded as
//      artifacts of supertrend()'s trend = 1 seed.
export function findFlippedAt(
  direction: (Trend | null)[],
  times: number[],
  seedZone: number = SEED_ZONE_BARS
): string | null {
  const firstReal = direction.findIndex((d) => d != null);
  if (firstReal === -1) return null;
  const earliestTrusted = firstReal + seedZone;

  for (let i = direction.length - 1; i > 0; i--) {
    const cur = direction[i];
    const prev = direction[i - 1];
    if (cur == null || prev == null) continue;
    if (cur === prev) continue;
    if (i < earliestTrusted) return null; // only artifacts remain below here
    return utcDate(new Date(times[i] * 1000));
  }
  return null;
}

export function timeframeSignal(bars: Candle[]): TimeframeSignal {
  if (bars.length === 0) return { trend: null, macdHist: null, flippedAt: null };

  const ohlc: OHLC[] = bars.map((b) => ({ high: b.high, low: b.low, close: b.close }));
  const st = supertrend(ohlc, 10, 3);
  const { hist } = macdCM(bars.map((b) => b.close), 12, 26, 9);

  const lastNonNull = <T,>(arr: (T | null)[]): T | null => {
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i] as T;
    return null;
  };

  return {
    trend: lastNonNull(st.direction),
    macdHist: lastNonNull(hist),
    flippedAt: findFlippedAt(st.direction, bars.map((b) => b.time)),
  };
}

export function alignmentOf(daily: TimeframeSignal, weekly: TimeframeSignal): Alignment {
  if (daily.trend === 1 && weekly.trend === 1) return "up";
  if (daily.trend === -1 && weekly.trend === -1) return "down";
  return "mixed";
}

// Recent daily flips, newest first, weekly-confirmed ones ahead of unconfirmed
// ones on the same day. Capped because one sharp market-wide move flips dozens
// of correlated large caps at once, and an uncapped list is noise on exactly
// the days it matters most. `total` reports the true count before the cap.
export function freshFlips(
  symbols: SymbolSignal[],
  now: Date,
  days: number = FRESH_DAYS,
  cap: number = FRESH_CAP
): { rows: SymbolSignal[]; total: number } {
  const cutoff = utcDate(new Date(now.getTime() - days * 86400_000));
  const matches = symbols.filter((s) => s.daily.flippedAt != null && s.daily.flippedAt >= cutoff);

  const confirmed = (s: SymbolSignal) => (s.daily.trend != null && s.weekly.trend === s.daily.trend ? 0 : 1);
  matches.sort((a, b) => {
    if (a.daily.flippedAt! !== b.daily.flippedAt!) return a.daily.flippedAt! < b.daily.flippedAt! ? 1 : -1;
    return confirmed(a) - confirmed(b);
  });

  return { rows: matches.slice(0, cap), total: matches.length };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && npx vitest run src/lib/flips.test.ts`
Expected: PASS (18 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/flips.ts src/lib/flips.test.ts
git commit -m "Add flip derivation, alignment and fresh-list selection"
```

---

### Task 5: The scan script

**Files:**
- Create: `scripts/scan-signals.ts`
- Create: `src/data/signals.json` (generated by running the script)
- Modify: `package.json`
- Test: `src/data/signals.test.ts`

**Interfaces:**
- Consumes: `liveUniverse` from `src/lib/universe`; `getTdSeries`, `getTdUsage` from `src/lib/twelvedata`; `dropInProgressDaily`, `dropInProgressWeekly`, `utcDate` from `src/lib/bars`; `timeframeSignal`, `alignmentOf`, types from `src/lib/flips`
- Produces: `src/data/signals.json` matching `SignalsFile`

- [ ] **Step 1: Add tsx and the npm script**

`tsx` lets the script import the repo's TypeScript modules instead of duplicating the indicator math in `.mjs`.

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
npm install --save-dev tsx
```

Then add to `package.json` `"scripts"`:

```json
"scan": "tsx scripts/scan-signals.ts"
```

- [ ] **Step 2: Write the dataset sanity test**

This is the gate that protects the daily commit. Create `src/data/signals.test.ts`:

```ts
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
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && npx vitest run src/data/signals.test.ts`
Expected: FAIL — cannot resolve `./signals.json`.

- [ ] **Step 4: Write the scan script**

Create `scripts/scan-signals.ts`:

```ts
// Builds src/data/signals.json: Supertrend + MACD on daily and weekly bars for
// every symbol in the universe, plus the date each trend last flipped.
//
// Twelve Data only. Yahoo is unreachable from both GitHub Actions and Vercel —
// see docs/superpowers/specs/2026-08-15-signal-flips-design.md.
//
//   TWELVEDATA_SCAN_KEY=xxxx npm run scan
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { liveUniverse } from "../src/lib/universe";
import { getTdSeries, getTdUsage } from "../src/lib/twelvedata";
import { dropInProgressDaily, dropInProgressWeekly, utcDate } from "../src/lib/bars";
import { timeframeSignal, alignmentOf, type SymbolSignal, type SignalsFile } from "../src/lib/flips";

const KEY = process.env.TWELVEDATA_SCAN_KEY ?? process.env.TWELVEDATA_API_KEY;
if (!KEY) {
  console.error("Missing TWELVEDATA_SCAN_KEY (or TWELVEDATA_API_KEY).");
  console.error("Get a free key at https://twelvedata.com/pricing");
  process.exit(1);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src/data/signals.json");

const DAILY_BARS = 520; // ~2y
const WEEKLY_BARS = 300; // ~5y
const SPACING_MS = 7_600; // free tier is 8 req/min; 7.6s keeps us just inside
const SUCCESS_FLOOR = 0.9;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One cheap probe before a ~27-minute loop, so an auth or quota problem is
// named in seconds instead of failing deep into the run.
async function preflight(needed: number) {
  let usage;
  try {
    usage = await getTdUsage(KEY);
  } catch (err) {
    console.error(`\nTwelve Data preflight failed: ${(err as Error).message}`);
    console.error("A 401/403 means the key is invalid or revoked — regenerate it and");
    console.error("update the TWELVEDATA_SCAN_KEY repo secret.");
    console.error("\nsrc/data/signals.json is untouched; the live site keeps its last good data.\n");
    process.exit(75); // EX_TEMPFAIL
  }
  const remaining = usage.planDailyLimit - usage.dailyUsage;
  console.log(`quota: ${usage.dailyUsage}/${usage.planDailyLimit} used, ${remaining} left; need ${needed}`);
  if (remaining < needed) {
    console.error(`\nNot enough daily quota left (${remaining} < ${needed}). Skipping this run.`);
    console.error("src/data/signals.json is untouched; the live site keeps its last good data.\n");
    process.exit(75);
  }
}

async function main() {
  const universe = liveUniverse();
  await preflight(universe.length * 2);

  const now = new Date();
  const out: SymbolSignal[] = [];
  const failed: string[] = [];
  let call = 0;

  for (const entry of universe) {
    try {
      if (call++ > 0) await sleep(SPACING_MS);
      const dailyRaw = await getTdSeries(entry.symbol, "1day", DAILY_BARS, KEY);
      await sleep(SPACING_MS);
      call++;
      const weeklyRaw = await getTdSeries(entry.symbol, "1week", WEEKLY_BARS, KEY);

      const daily = dropInProgressDaily(dailyRaw, entry.class, now);
      const weekly = dropInProgressWeekly(weeklyRaw, now);
      if (daily.length === 0) throw new Error("no daily bars after trimming");

      const d = timeframeSignal(daily);
      const w = timeframeSignal(weekly);
      const lastBar = daily[daily.length - 1];

      out.push({
        symbol: entry.symbol,
        name: entry.name,
        class: entry.class,
        close: lastBar.close,
        asOf: utcDate(new Date(lastBar.time * 1000)),
        daily: d,
        weekly: w,
        alignment: alignmentOf(d, w),
      });
      console.log(`  ${entry.symbol.padEnd(9)} d:${d.trend ?? "?"} w:${w.trend ?? "?"} flip:${d.flippedAt ?? "-"}`);
    } catch (err) {
      failed.push(entry.symbol);
      console.warn(`  ${entry.symbol.padEnd(9)} FAILED — ${(err as Error).message}`);
    }
  }

  const rate = out.length / universe.length;
  console.log(`\n${out.length}/${universe.length} ok (${(rate * 100).toFixed(1)}%), ${failed.length} failed`);
  if (failed.length) console.log(`failed: ${failed.join(", ")}`);

  // A partial scan must never overwrite a good dataset.
  if (rate < SUCCESS_FLOOR) {
    console.error(`\nBelow the ${SUCCESS_FLOOR * 100}% floor — refusing to write.`);
    console.error("src/data/signals.json is untouched; the live site keeps its last good data.\n");
    process.exit(75);
  }

  const file: SignalsFile = { generatedAt: now.toISOString(), symbols: out };
  writeFileSync(OUT, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`wrote ${OUT}`);
}

main();
```

- [ ] **Step 5: Generate the dataset**

The first run takes ~27 minutes. Use the key from `.env.local`:

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
export TWELVEDATA_SCAN_KEY=$(grep -E '^TWELVEDATA_API_KEY' .env.local | cut -d= -f2- | tr -d '"'"'"' ')
npm run scan
```

Expected: a per-symbol line for each, then `wrote .../signals.json` with ≥90% success.

- [ ] **Step 6: Run the sanity test to verify it passes**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && npx vitest run src/data/signals.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 7: Sanity-check the output by eye**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && node -e "const d=require('./src/data/signals.json');console.log('symbols',d.symbols.length);console.log('with recent flips',d.symbols.filter(s=>s.daily.flippedAt).length);console.log(d.symbols.slice(0,3))"`

Expected: a plausible symbol count, and **not** every symbol carrying the same `flippedAt` date — if they all match, the warmup-transition bug from Task 4 has resurfaced.

- [ ] **Step 8: Commit**

```bash
git add scripts/scan-signals.ts src/data/signals.json src/data/signals.test.ts package.json package-lock.json
git commit -m "Add the signal scan script and its first generated dataset"
```

---

### Task 6: The /flips page

**Files:**
- Create: `src/app/flips/page.tsx`
- Create: `src/app/flips/flips-table.tsx`
- Create: `src/app/flips/layout.tsx`
- Modify: `src/app/signals/page.tsx:145-158` (add a nav link)

**Note:** this repo pins Next.js 16, which differs from older App Router conventions. Read the relevant guide in `node_modules/next/dist/docs/` before writing the components, per `AGENTS.md`.

**Interfaces:**
- Consumes: `signals.json`; `freshFlips`, types from `@/lib/flips`
- Produces: a route at `/flips`

- [ ] **Step 1: Write the page metadata**

Create `src/app/flips/layout.tsx`:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Flips",
  description:
    "Which big-cap stocks, gold, silver and crypto recently changed Supertrend direction — on the daily and the weekly timeframe.",
};

export default function FlipsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
```

- [ ] **Step 2: Write the sortable table (client component)**

Create `src/app/flips/flips-table.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useTableSort, SortTh } from "@/components/sortable";
import type { SymbolSignal } from "@/lib/flips";

const trendLabel = (t: 1 | -1 | null) =>
  t === 1 ? <span className="text-[#3fb950]">up</span>
  : t === -1 ? <span className="text-[#f85149]">down</span>
  : <span className="text-[#7d8590]">—</span>;

const daysSince = (iso: string | null, now: number) =>
  iso == null ? null : Math.round((now - Date.parse(`${iso}T00:00:00Z`)) / 86400_000);

export default function FlipsTable({ rows, now }: { rows: SymbolSignal[]; now: number }) {
  const { sorted, sort, toggle } = useTableSort<SymbolSignal>(
    rows,
    {
      symbol: (r) => r.symbol,
      close: (r) => r.close,
      daily: (r) => r.daily.trend,
      weekly: (r) => r.weekly.trend,
      momentum: (r) => r.daily.macdHist,
      alignment: (r) => r.alignment,
      since: (r) => daysSince(r.daily.flippedAt, now),
    },
    { key: "since", dir: "asc" }
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse font-mono text-xs">
        <thead className="border-b border-[#30363d] text-[10px] uppercase tracking-wide text-[#7d8590]">
          <tr>
            <SortTh label="symbol" sortKey="symbol" sort={sort} onSort={toggle} className="py-2 text-left" />
            <SortTh label="close" sortKey="close" sort={sort} onSort={toggle} className="py-2 text-right" />
            <SortTh label="daily" sortKey="daily" sort={sort} onSort={toggle} className="py-2 text-right" />
            <SortTh label="weekly" sortKey="weekly" sort={sort} onSort={toggle} className="py-2 text-right" />
            <SortTh label="momentum" sortKey="momentum" sort={sort} onSort={toggle} className="py-2 text-right" title="MACD histogram" />
            <SortTh label="alignment" sortKey="alignment" sort={sort} onSort={toggle} className="py-2 text-right" />
            <SortTh label="days since flip" sortKey="since" sort={sort} onSort={toggle} className="py-2 text-right" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.symbol} className="border-b border-[#21262d] hover:bg-[#161b22]">
              <td className="py-1.5">
                <Link href={`/?symbol=${encodeURIComponent(r.symbol)}`} className="text-[#58a6ff] hover:underline">
                  {r.symbol}
                </Link>
                <span className="ml-2 text-[#7d8590]">{r.name}</span>
              </td>
              <td className="py-1.5 text-right text-[#e6edf3]">{r.close.toFixed(2)}</td>
              <td className="py-1.5 text-right">{trendLabel(r.daily.trend)}</td>
              <td className="py-1.5 text-right">{trendLabel(r.weekly.trend)}</td>
              <td className="py-1.5 text-right text-[#8b949e]">
                {r.daily.macdHist == null ? "—" : r.daily.macdHist.toFixed(2)}
              </td>
              <td className="py-1.5 text-right text-[#8b949e]">{r.alignment}</td>
              <td className="py-1.5 text-right text-[#8b949e]">{daysSince(r.daily.flippedAt, now) ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Write the page (server component)**

Create `src/app/flips/page.tsx`:

```tsx
import Link from "next/link";
import signalsJson from "@/data/signals.json";
import { freshFlips, type SignalsFile } from "@/lib/flips";
import SiteFooter from "@/components/site-footer";
import FlipsTable from "./flips-table";

const data = signalsJson as SignalsFile;

export default function Flips() {
  const now = new Date(data.generatedAt);
  const { rows: fresh, total } = freshFlips(data.symbols, now);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-mono text-lg text-[#e6edf3]">flips</h1>
        <nav className="flex gap-4 font-mono text-xs text-[#8b949e]">
          <Link href="/" className="hover:text-[#e6edf3]">← markets</Link>
          <Link href="/signals" className="text-[#3fb950] hover:text-[#e6edf3]">signals →</Link>
          <Link href="/insiders" className="text-[#58a6ff] hover:text-[#e6edf3]">insider-buys →</Link>
          <Link href="/smart-money" className="text-[#d29922] hover:text-[#e6edf3]">smart-money →</Link>
        </nav>
      </header>

      <p className="mb-6 max-w-3xl font-mono text-xs leading-relaxed text-[#8b949e]">
        Which large caps, gold (GLD), silver (SLV) and crypto recently changed{" "}
        <span className="text-[#3fb950]">Supertrend</span> direction, and whether the weekly
        timeframe agrees. Scanned once a day after the US close.{" "}
        <span className="text-[#d29922]">Indicator output, not financial advice.</span>
      </p>

      <h2 className="mb-2 font-mono text-sm text-[#e6edf3]">
        changed direction in the last 7 days
        {total > fresh.length && (
          <span className="ml-2 text-xs text-[#7d8590]">showing {fresh.length} of {total}</span>
        )}
      </h2>

      {fresh.length === 0 ? (
        <p className="mb-8 font-mono text-xs text-[#7d8590]">Nothing flipped in the last 7 days.</p>
      ) : (
        <ul className="mb-8 space-y-1 font-mono text-xs">
          {fresh.map((r) => (
            <li key={r.symbol} className="flex flex-wrap items-baseline gap-x-3 border-b border-[#21262d] py-1.5">
              <Link href={`/?symbol=${encodeURIComponent(r.symbol)}`} className="text-[#58a6ff] hover:underline">
                {r.symbol}
              </Link>
              <span className="text-[#7d8590]">{r.name}</span>
              <span className={r.daily.trend === 1 ? "text-[#3fb950]" : "text-[#f85149]"}>
                daily turned {r.daily.trend === 1 ? "up" : "down"}
              </span>
              <span className="text-[#7d8590]">on {r.daily.flippedAt}</span>
              <span className="text-[#8b949e]">
                weekly {r.weekly.trend === r.daily.trend ? "agrees" : "does not agree"}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-2 font-mono text-sm text-[#e6edf3]">full board</h2>
      <FlipsTable rows={data.symbols} now={now.getTime()} />

      <SiteFooter>
        Supertrend(10, 3) and MACD(12, 26, 9) on daily and weekly bars · gold and silver are the
        GLD and SLV ETFs, not spot · dates in UTC · generated {data.generatedAt.slice(0, 16)}Z ·
        indicator output, not investment advice
      </SiteFooter>
    </main>
  );
}
```

- [ ] **Step 4: Add the nav link from /signals**

In `src/app/signals/page.tsx`, inside the `<nav>` at lines 145-158, add after the `/` link:

```tsx
          <Link href="/flips" className="text-[#3fb950] hover:text-[#e6edf3]">
            flips →
          </Link>
```

- [ ] **Step 5: Verify the page builds and renders**

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
npm run build
```

Expected: build succeeds and `/flips` appears in the route list as a static route.

Then `npm run dev`, open `http://localhost:3000/flips`, and confirm: the fresh list renders (or shows the empty-state sentence), the full board sorts when headers are clicked, and every ticker links to its chart.

- [ ] **Step 6: Run lint and the full suite**

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
npm run lint && npm test
```

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/flips src/app/signals/page.tsx
git commit -m "Add the /flips page: recent trend changes plus the full board"
```

---

### Task 7: Nightly scan workflow with failure alerting

**Files:**
- Create: `.github/workflows/scan.yml`

**Mirrors** the alerting shipped to game-ranker on 2026-08-15, which is verified working.

- [ ] **Step 1: Add the repo secret**

In GitHub → Settings → Secrets and variables → Actions, add `TWELVEDATA_SCAN_KEY`. Use a **second free Twelve Data key**, not the one the live site uses, so a heavy scan cannot starve the site's daily quota.

- [ ] **Step 2: Write the workflow**

Create `.github/workflows/scan.yml`:

```yaml
name: Scan signals

# Recomputes Supertrend/MACD across the universe daily and commits the dataset,
# which triggers Vercel's auto-deploy. Runs at 23:30 UTC — after the US close
# (21:00 UTC winter / 20:00 UTC summer), so the last daily bar is complete.
# Daily rather than weekdays because crypto trades through the weekend.

on:
  schedule:
    - cron: "30 23 * * *"
  workflow_dispatch:

permissions:
  contents: write
  issues: write # so a failed run can raise (and later close) an alert issue

jobs:
  scan:
    runs-on: ubuntu-latest
    timeout-minutes: 60 # the scan paces at 7.6s/call and takes ~27 min
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci

      - name: Scan the universe
        env:
          TWELVEDATA_SCAN_KEY: ${{ secrets.TWELVEDATA_SCAN_KEY }}
        run: npm run scan

      - name: Sanity-check the dataset
        run: npm test

      - name: Commit if the dataset changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          if git diff --quiet -- src/data/signals.json; then
            echo "No changes — nothing to deploy."
          else
            git add src/data/signals.json
            git commit -m "chore: daily signal scan"
            git push
          fi

      - name: Raise an alert issue on failure
        if: failure()
        env:
          GH_TOKEN: ${{ github.token }}
          TITLE: "🔴 Daily signal scan is failing"
          RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
        run: |
          # Exact title match over the open list, not `--search`: GitHub's search
          # index lags by seconds-to-minutes and would let duplicates through.
          existing=$(gh issue list --state open --limit 100 --json number,title \
            --jq ".[] | select(.title == \"$TITLE\") | .number" | head -n1)
          body="The scheduled \`scan.yml\` run failed, so \`src/data/signals.json\` is now stale and the live site is serving the last good dataset.

          Failed run: $RUN_URL

          Check the log for the \`Twelve Data preflight failed:\` or \`Not enough daily quota\` line — it names the cause.

          This issue closes itself automatically once a run succeeds."
          if [ -n "$existing" ]; then
            gh issue comment "$existing" --body "Still failing — $RUN_URL"
          else
            gh issue create --title "$TITLE" --body "$body"
          fi

      - name: Close the alert issue once healthy again
        if: success()
        env:
          GH_TOKEN: ${{ github.token }}
          TITLE: "🔴 Daily signal scan is failing"
          RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
        run: |
          existing=$(gh issue list --state open --limit 100 --json number,title \
            --jq ".[] | select(.title == \"$TITLE\") | .number" | head -n1)
          if [ -n "$existing" ]; then
            gh issue close "$existing" --comment "Recovered — scan succeeded in $RUN_URL"
          fi
```

- [ ] **Step 3: Validate the YAML and shell before pushing**

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
node -e "
const y=require('js-yaml'),fs=require('fs');
const d=y.load(fs.readFileSync('.github/workflows/scan.yml','utf8'));
d.jobs.scan.steps.forEach((s,i)=>{ if(s.run) fs.writeFileSync('/tmp/scan'+i+'.sh', s.run); });
console.log('YAML OK, steps:', d.jobs.scan.steps.length);
"
for f in /tmp/scan*.sh; do bash -n "$f" || echo "FAIL $f"; done && echo "shell OK"
```

Expected: `YAML OK` and `shell OK`. (If `js-yaml` is not installed here, run `npm i -D js-yaml` temporarily or validate with any YAML linter.)

- [ ] **Step 4: Commit and push**

```bash
git add .github/workflows/scan.yml
git commit -m "Add the nightly signal scan workflow with failure alerting"
git push
```

- [ ] **Step 5: Verify the workflow end to end**

```bash
gh workflow run scan.yml
gh run list --workflow=scan.yml --limit 1
```

Wait for it to finish (~30 min), then confirm: the run succeeded, `src/data/signals.json` was either committed or reported unchanged, and no alert issue was opened.

To verify the *failure* path, temporarily set the `TWELVEDATA_SCAN_KEY` secret to an invalid value, dispatch again, confirm the alert issue appears, then restore the real key and dispatch once more to confirm the issue self-closes.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Universe (S&P 100 + GLD/SLV/BTC/ETH, `knownDead`) | 1 |
| Twelve Data 1day/1week fetch, separate scan key | 2 |
| Chronological ordering | 2 (test 1) |
| In-progress bar rules (weekly, crypto daily) | 3 |
| `flippedAt` — null transitions, seed zone | 4 |
| Alignment from Supertrend only | 4 |
| Fresh list: 7 days, cap 10, weekly-confirmed first | 4 |
| `close`/`asOf` rather than `price` | 4 (types), 5 (populated) |
| Preflight + quota check | 5 |
| 90% floor, stale-safe writes | 5 |
| Dataset sanity gate | 5 |
| First-run bootstrap (`signals.json` committed) | 5 |
| Page: fresh list, full board, momentum column, disclaimer, ETF labels | 6 |
| Daily 23:30 UTC cron, alert issue, self-close | 7 |
| `GITHUB_TOKEN` skips CI → workflow runs `npm test` itself | 7 (step 2) |

No gaps.

**Type consistency:** `AssetClass`, `UniverseEntry`, `TdInterval`, `TimeframeSignal`, `Alignment`, `SymbolSignal`, `SignalsFile`, `findFlippedAt`, `timeframeSignal`, `alignmentOf`, `freshFlips`, `dropInProgressDaily`, `dropInProgressWeekly`, `utcDate`, `isoWeekStartUtc`, `getTdSeries`, `getTdUsage`, `liveUniverse` — each defined once and referenced with the same name and signature throughout.

**Deliberately deferred:** removing the now-confirmed-dead `src/lib/yahoo.ts` fallback paths. Out of scope; noted in the spec.
