# Signal Flips — design

**Date:** 2026-08-15
**Status:** v2 — rewritten after provider testing invalidated v1. Not implemented.
**Repo:** market-dashboard

## Problem

The Signals page answers "how do the three things on my watchlist look right
now?" It cannot answer the question worth asking: **"which of the big names just
changed state, and on what timeframe?"**

1. **No universe.** It reads a 3-item localStorage watchlist. Nothing scans
   a broad set of names.
2. **No second timeframe.** A daily signal the weekly disagrees with is a
   materially weaker read than one it confirms, and there is no way to see
   the difference.
3. **No memory.** Every render computes the present. "Just flipped" requires
   knowing *when* a state began, which a stateless page cannot know.

## Goal

A `/flips` page that opens with: *these names changed trend recently, here is
the timeframe, here is the date, here is whether the slower timeframe agrees.*

## Non-goals

- **Not recommendations.** Rule-based indicator states with the rule shown and
  a disclaimer. No copy on the page may imply advice to buy or sell.
- **Not intraday.** One scan per day. Nothing streams.
- **Not backtesting.** See "Future".

## Evidence — why this design and not the obvious one

v1 of this spec routed a GitHub Actions job straight at Yahoo. That was tested
before implementation and **does not work**. Recorded so nobody retries it:

| Path | Result | Date |
|---|---|---|
| Yahoo ← GitHub Actions runner | **0 ok / 17 symbols, HTTP 429**; 30/30 burst failures. Blanket block on Azure runner IPs, not throttling. | 2026-08-15 |
| Yahoo ← Vercel (this app's own host) | **Blocked.** `^GSPC`, `^VIX`, `CL=F` all fall through `market.ts`'s Yahoo fallback and surface the Twelve Data error instead. | 2026-08-15 |
| Yahoo ← home network | HTTP 429 on first request | 2026-08-15 |
| Stooq (keyless CSV) | JS bot-challenge page, not machine-readable | 2026-08-15 |
| **Twelve Data** | **Works from every host tested.** | 2026-08-15 |

**Consequence:** `src/lib/yahoo.ts` is effectively dead code in production — the
live site has been served by Twelve Data and Binance all along. Not this
feature's job to remove, but worth knowing.

Twelve Data free tier, verified against the live key:

```
plan_category: basic   plan_limit: 8/min   plan_daily_limit: 800/day
interval=1day  outputsize=520 → 520 bars (2024-07-19 → 2026-08-14)  ok
interval=1week outputsize=300 → 300 bars (2020-11-16 → 2026-08-10)  ok
1week verified for: AAPL (equity), SLV (ETF), BTC/USD, ETH/USD
```

**`XAG/USD` (spot silver) is paid-plan only** — "available starting with the
Grow or Venture plan". Since the budget for this project is zero, spot silver
is out, and silver ships as **`SLV`** (iShares Silver Trust) instead.

## Universe

~105 symbols in `src/data/universe.json`, hand-maintained. Schema per entry:
`{ symbol, name, class }`.

| Class | Members | Notes |
|---|---|---|
| `equity` | 101 S&P 100 constituents | 101, not 100 — the index carries dual share classes (`GOOG`/`GOOGL`) |
| `metal` | `GLD` (gold), `SLV` (silver) | ETFs, not spot — spot silver is paywalled. Matched pair: both US-listed, both free tier. |
| `crypto` | `BTC/USD`, `ETH/USD` | Twelve Data notation, not the site's `BTC-USD` |

**Two things to be honest about on the page:**

1. `GLD`/`SLV` are ETFs. They track spot but trade only during US market hours,
   so they gap over weekends where spot does not. For trend signals on a daily
   and weekly timeframe this is immaterial, but it should be labelled as
   "gold (GLD)" rather than "gold".
2. The markets page shows gold as **PAXG**. This page shows **GLD**. Different
   instruments, different prices, same underlying. Label both clearly or the
   inconsistency looks like a bug.

Rationale for S&P 100 over S&P 500: every name is recognisable, the scan fits
comfortably inside the free daily quota, and there are enough names that most
days produce a flip. S&P 500 would need 1000 calls/day against an 800 limit —
it does not fit at any speed.

## Architecture

```
GitHub Actions (23:30 UTC, daily)
  └─ scripts/scan-signals.ts
       ├─ per symbol, 2 calls to Twelve Data:
       │     interval=1day  outputsize=520  → ~2y daily bars
       │     interval=1week outputsize=300  → ~5y weekly bars
       ├─ reverse to chronological order (TD returns newest-first)
       ├─ drop in-progress bars
       ├─ supertrend(10,3) + macdCM(12,26,9) on each series
       │     └─ from src/lib/indicators.ts — already unit-tested
       ├─ derive flippedAt from direction[] history
       └─ write src/data/signals.json
  └─ commit if changed ──> Vercel auto-deploy
       └─ /flips reads the JSON at build time. No runtime API calls.
```

**Why prebuilt, not on-demand:** a live scan is 210 upstream calls against a
Vercel Hobby function limit of ~10s. The on-demand version cannot exist on this
plan. Prebuilding also removes all runtime rate-limit exposure.

**Why Twelve Data provides both timeframes natively:** `interval=1week` is
supported on the free tier, so there is **no daily→weekly resampling**. v1
specified a `resample.ts` module with ISO-week grouping and partial-week
handling; all of it is deleted. This is the single biggest simplification in v2.

### Budget

| | |
|---|---|
| Calls per run | 105 symbols × 2 intervals = **210** |
| Daily quota | 800 — leaves 590 for retries and the live site |
| Rate limit | 8/min → 7.5s spacing → **~27 minutes per run** |
| Actions minutes | Public repo, so unlimited and free. Well inside the 360-min job cap. |

**Use a second, separate free Twelve Data key for the scan**, stored as the
repo secret `TWELVEDATA_SCAN_KEY`. Sharing the site's key risks a heavy scan
day starving the live site's quota. A second key is free.

## Data flow details

### Ordering — the easy bug to ship

Twelve Data returns `values` **newest-first**. Every indicator in
`indicators.ts` assumes chronological order. The series must be reversed before
it touches `supertrend()` or `macdCM()`, or every signal on the page is
computed backwards and will look plausible while being wrong.

A unit test asserts the fetch adapter returns oldest-first.

### In-progress bars

A partial bar makes a signal flicker, so the newest bar is only trusted once its
period has closed:

- **Weekly** — Twelve Data labels weekly bars by week start, and the current
  in-progress week is included (verified: latest weekly bar `2026-08-10` while
  the run date is `2026-08-15`). **Drop the final weekly bar** when its date
  falls in the current ISO week.
- **Daily, `equity`/`metal`** — the scan runs at 23:30 UTC, after the US close.
  The last daily bar is a completed session. Keep it.
- **Daily, `crypto`** — trades 24/7, so the current UTC day is always partial.
  **Drop the final daily bar.** Costs up to a day of lag; buys correctness.

The schedule is **daily, not Mon–Fri**: crypto trades weekends, and a weekday
cron would sit on a Saturday flip until Monday. Equity bars simply do not change
over a weekend, so those rows are unaffected.

### Deriving `flippedAt`

`supertrend()` returns `direction[]` across every bar. `flippedAt` is the date
of the most recent index where the direction changed — **subject to two
corrections that v1 got wrong:**

1. **Only count transitions where both `direction[i]` and `direction[i-1]` are
   non-null.** `supertrend()` leaves `direction` as `null` through the ATR
   warmup (`indicators.ts:83`, `if (a[i] == null) continue`). A naive `!==`
   check treats the first `null → 1` as a flip, which would report a false
   recent flip on essentially every symbol and would break the never-flipped
   case that is supposed to return `null`.
2. **Ignore flips in the first 20 non-null bars.** `supertrend()` seeds
   `trend = 1` before seeing data, so a symbol genuinely in a downtrend at the
   window's start produces an artificial flip from that seed. This matters most
   on the weekly series. If the only flip found lies in that zone, return
   `null` — "no flip in the window" is the honest answer.

`flippedAt` is computed **from price history on every run**, not by diffing the
previous `signals.json`. GitHub's scheduled runs get delayed and occasionally
dropped; a diff-based design would silently lose a flip whenever a run was
skipped. History-derived state is idempotent — a missed run costs freshness,
never correctness, and the next run repairs itself.

Dates are formatted `YYYY-MM-DD` in **UTC**, which may read one day off from a
US-exchange chart. Stated on the page.

### Output — `src/data/signals.json`

```jsonc
{
  "generatedAt": "2026-08-15T23:31:04Z",
  "symbols": [
    {
      "symbol": "NVDA",
      "name": "NVIDIA Corp",
      "class": "equity",
      "close": 225.16,          // close of the bar the signal was computed on
      "asOf": "2026-08-14",     // that bar's date — NOT a live price
      "daily":  { "trend": 1, "macdHist": 0.83, "flippedAt": "2026-08-12" },
      "weekly": { "trend": 1, "macdHist": 1.94, "flippedAt": "2026-06-15" },
      "alignment": "up"
    }
  ]
}
```

`close`/`asOf` rather than `price`, deliberately. Crypto drops its final bar, so
a "price" field here would be up to 24h behind the markets page's live number —
two different bitcoin prices on the same site with no explanation. Naming it
`close` with an `asOf` date makes the page state what it actually is.

`alignment` is `"up"` when both timeframes read `1`, `"down"` when both read
`-1`, else `"mixed"`.

~35KB per run. Committed daily, so git history accumulates a dated snapshot
series at no cost.

## The page — `/flips`

**Fresh signals** — symbols whose `daily.flippedAt` is within the last **7
calendar days** (calendar days, so the rule means the same for a stock and for
bitcoin), **capped at 10**, sorted newest first and, within a day, weekly-aligned
ones first.

The cap matters: Supertrend(10,3) across 101 correlated large caps means one
sharp market-wide move flips dozens at once, and an uncapped list becomes 40
rows of noise on exactly the days it matters most. Ranking weekly-confirmed
flips above unconfirmed ones is also the better signal. When the cap truncates,
say so ("showing 10 of 34").

Empty state states the fact plainly — "nothing flipped in the last 7 days" — not
a blank panel.

**Full board** — all ~105 symbols, sortable via the existing
`src/components/sortable.tsx`. Columns: symbol, close (+`asOf`), daily trend,
weekly trend, momentum (`daily.macdHist`), alignment, days since daily flip.

`alignment` derives from Supertrend only — one indicator, one stated rule,
trivially explainable. MACD gets its own momentum column rather than being
folded into the verdict, so a reader can see when the two disagree.

Each ticker links to its chart on the markets page. Footer states the exact
rules (`Supertrend(10, 3)`, `MACD(12, 26, 9)`, daily and weekly), that metals
are ETF proxies, the `generatedAt` timestamp, and the disclaimer: indicator
output, not investment advice. Styling follows the existing dark terminal
treatment used by `/signals`.

## Failure handling

Mirrors the alerting shipped to game-ranker on 2026-08-15:

- **Preflight** — one probe plus an `api_usage` check before the 27-minute loop.
  Fails in seconds with a named cause (auth / quota / outage), and refuses to
  start if remaining daily quota is under 210.
- **Per-symbol tolerance** — an individual symbol failing is logged and skipped.
  Only breaching the floor aborts the run.
- **90% floor, plus a `knownDead` allowlist** in `universe.json`. v1 used 95%,
  which is too tight: a permanently delisted ticker would burn one of only five
  slots forever, slowly starving the error budget until a normal bad-network day
  fails the run. Known-dead symbols do not count against the floor.
- **Sanity gate** — `npm test` must pass before the commit step.
- **Alert issue** — `if: failure()` opens or comments on a single GitHub issue;
  self-closes on the next success.
- **Stale-safe** — a failed run writes nothing; the site keeps its last good data.

**Note:** pushes made with `GITHUB_TOKEN` do not trigger `on: push` workflows, so
the daily data commit skips CI. Vercel still deploys (separate integration).
This is why the scan workflow runs `npm test` itself.

## Testing

Vitest, extending the existing suite:

1. **Chronological ordering** — a newest-first Twelve Data fixture → adapter
   returns oldest-first.
2. **`flippedAt` derivation** — four cases: a normal flip on a known bar;
   a series whose only direction change is the `null → value` warmup transition
   (must return `null`); a flip inside the 20-bar seed zone (must return
   `null`); a genuinely never-flipping series (must return `null`).
3. **In-progress bar rule** — final weekly bar dropped when it falls in the
   current ISO week; final daily bar dropped for `crypto`, kept for `equity`.
4. **Universe schema** — every entry has `symbol`/`name`/`class`, no duplicates,
   class is one of the three valid values.
5. **Dataset sanity** — committed `signals.json` parses, has ≥95 symbols, no
   `NaN`/null closes. This is the gate protecting the commit.

Indicator math is not retested — `indicators.test.ts` covers it, and this
feature adds a caller, not new math.

## Files

**New**
- `src/data/universe.json`
- `src/data/signals.json` (generated; **committed in the same PR** so the first
  Vercel build has a file to read — the page also renders an honest empty state
  if it is missing)
- `scripts/scan-signals.ts`
- `src/lib/flips.ts` — `flippedAt` + alignment derivation
- `src/lib/flips.test.ts` — tests 2 and 3
- `src/lib/twelvedata.test.ts` — test 1 (chronological ordering); no test file
  exists for this module today
- `src/data/universe.test.ts` — tests 4 and 5 (schema + dataset sanity)
- `src/app/flips/page.tsx`, `src/app/flips/layout.tsx`
- `.github/workflows/scan.yml`

**Modified**
- `src/lib/twelvedata.ts` — a fetch helper taking explicit `interval` and
  `outputsize` (the existing `RANGE_SERIES` map does not cover 520-bar daily or
  300-bar weekly pulls), reading `TWELVEDATA_SCAN_KEY` when present
- `package.json` — `scan` script; add `tsx` so the script can import the
  existing TypeScript indicator module rather than duplicating the math
- `src/components/site-footer.tsx` — nav link to `/flips`

No `resample.ts` — Twelve Data serves weekly natively. No sitemap change: this
repo has `robots.ts` but no `sitemap.ts`.

## Risks

| Risk | Mitigation |
|---|---|
| Twelve Data is now a single point of failure — Yahoo is confirmed unreachable from every host we control | Preflight + quota check + 90% floor + stale-safe writes + alert issue. Accepted knowingly: there is no free second source that serves datacenter IPs. |
| Scan exhausts the shared daily quota and degrades the live site | Separate `TWELVEDATA_SCAN_KEY`; preflight refuses to start under 210 remaining |
| 27-minute job | Public repo, unlimited free minutes, 360-min cap |
| GitHub cron delayed or dropped | `flippedAt` derives from history, so a missed run self-repairs |
| S&P 100 membership drifts | Failed symbol is skipped and logged; `knownDead` keeps it off the floor |
| Metals are ETF proxies, not spot | Labelled on the page as "gold (GLD)" / "silver (SLV)" |
| Daily commits inflate repo size | ~35KB/day ≈ 9MB/year. Acceptable. |
| Page reads as financial advice | Rules and disclaimer on-page; no buy/sell wording anywhere |

## Future (out of scope)

The committed history of `signals.json` is a dated record of every signal this
system produced. Once a few months accumulate it supports an honest hit-rate
analysis — *did the flips actually lead anywhere?* — which is a rarer portfolio
artifact than the screener itself.
