# Signal Flips — design

**Date:** 2026-08-15
**Status:** approved design, not yet implemented
**Repo:** market-dashboard

## Problem

The Signals page answers "how do the three things on my watchlist look right now?"
It cannot answer the question actually worth asking: **"which of the big names
just changed state, and on what timeframe?"**

Three gaps:

1. **No universe.** It reads the user's 3-item localStorage watchlist. Nothing
   scans a broad set of names.
2. **No second timeframe.** One set of indicators on one interval. A daily
   signal that the weekly disagrees with is a materially weaker read than one
   the weekly confirms, and today there is no way to see the difference.
3. **No memory.** Every render computes the present. "Just flipped" requires
   knowing *when* a state began, which a stateless page cannot know.

## Goal

A `/flips` page that opens with: *these names changed trend recently, here is
the timeframe, here is the date it happened, here is whether the slower
timeframe agrees.*

## Non-goals

- **Not recommendations.** This surfaces rule-based indicator states with the
  rule shown and a disclaimer. It does not tell anyone what to buy, and no
  copy on the page may imply that it does.
- **Not intraday.** One scan per day. Nothing streams.
- **Not backtesting.** Measuring whether these signals *worked* is a natural
  follow-on (see "Future"), explicitly out of scope here.

## Universe

~105 symbols in `src/data/universe.json`, hand-maintained (S&P 100 membership
changes a few times a year; a stale entry degrades one row, not the run). The
equity count is 101, not 100 — the index carries dual share classes such as
`GOOG`/`GOOGL`:

| Class | Members | Symbols |
|---|---|---|
| `equity` | S&P 100 constituents | `AAPL`, `NVDA`, `JPM`, … |
| `metal` | gold, silver | `GC=F`, `SI=F` |
| `crypto` | bitcoin, ether | `BTC-USD`, `ETH-USD` |

Schema per entry: `{ symbol, name, class }`.

Rationale for S&P 100 over S&P 500: every name is recognisable to a reader, the
scan finishes in ~4 minutes inside the free GitHub Actions allowance, and there
are enough names that most days produce at least one flip. S&P 500 would triple
runtime and fill the page with tickers nobody recognises.

## Architecture

Prebuilt nightly, committed to the repo, served statically — the same shape as
game-ranker's dataset pipeline, which is proven in production and free.

```
GitHub Actions (23:30 UTC, daily)
  └─ scripts/scan-signals.ts
       ├─ fetch 2y daily bars per symbol ── Yahoo chart API (keyless)
       ├─ resample daily → weekly (complete weeks only)
       ├─ supertrend(10,3) + macdCM(12,26,9) on BOTH series
       │     └─ imported from src/lib/indicators.ts — already unit-tested
       ├─ derive flippedAt from the direction[] history
       └─ write src/data/signals.json
  └─ commit if changed ──> Vercel auto-deploy
       └─ /flips reads the JSON at build time. No runtime API calls.
```

**Why prebuilt and not on-demand:** a live scan of ~105 symbols takes 60–90s
against a Vercel Hobby function limit of ~10s. It is not a preference; the
on-demand version cannot exist on this plan. Prebuilding also removes all
runtime rate-limit exposure and makes the page load instantly.

**Why Yahoo:** keyless, free, already wrapped in `src/lib/yahoo.ts` with the
retry/backoff behaviour this needs. Twelve Data's free tier (8 req/min) would
take 13 minutes and burn the daily quota.

**Why one fetch covers two timeframes:** the weekly series is derived from the
daily bars in code. No second request, no extra quota, and the two timeframes
are guaranteed to be consistent with each other.

## Data flow details

### Fetching

- `range=2y&interval=1d` per symbol. 2 years gives ~504 daily bars and ~104
  weekly bars — comfortably above the ~35-bar warmup that Supertrend(10) and
  MACD(26,9) need on the weekly series.
- Sequential, 600ms between symbols, mirroring `yahoo.ts`'s existing 429
  backoff. ~105 × 0.9s ≈ 100s including retries.
- **Partial-run guard:** if fewer than 95% of symbols return usable bars, abort
  without writing. A half-scan must never overwrite a good dataset.

### Bar completeness

A partial final bar makes a signal flicker, so the last bar is only trusted
when the session that produced it has closed:

- **`equity` / `metal`** — the scan runs at 23:30 UTC, after the US close
  (21:00 UTC in winter, 20:00 UTC in summer). The final daily bar is complete.
  Keep it.
- **`crypto`** — trades 24/7, so the current UTC day's bar is always in
  progress at scan time. **Drop the final bar** and signal off the last
  complete UTC day. Costs up to one day of lag; buys correctness.

The schedule is **daily, not Mon–Fri**, for the same reason: crypto trades
through the weekend, and a weekday-only cron would sit on a Saturday flip until
Monday. On weekends the equity bars simply do not change, so those rows are
unaffected.

### Weekly resampling

Group daily bars into ISO weeks (Monday–Sunday):

- `open` = first bar's open, `close` = last bar's close
- `high` = max high, `low` = min low
- `time` = the Monday of that week

**The current in-progress week is excluded.** Including it would let the weekly
trend flip and unflip mid-week, which would make the "weekly confirms" column
meaningless. Only complete weeks produce weekly signals.

### Deriving `flippedAt`

`supertrend()` already returns `direction[]` across every bar. `flippedAt` is
the timestamp of the last index where `direction[i] !== direction[i-1]`.

This is computed **from price history on every run**, not by diffing against the
previous `signals.json`. That matters: GitHub's scheduled runs are delayed and
occasionally dropped under load, and a diff-based design would silently lose a
flip whenever a run was skipped. History-derived state is idempotent — a missed
run costs freshness, never correctness, and the next run repairs itself.

### Output — `src/data/signals.json`

```jsonc
{
  "generatedAt": "2026-08-15T23:31:04Z",
  "symbols": [
    {
      "symbol": "NVDA",
      "name": "NVIDIA Corp",
      "class": "equity",
      "price": 178.42,
      "daily":  { "trend": 1,  "macdHist": 0.83, "flippedAt": "2026-08-12" },
      "weekly": { "trend": 1,  "macdHist": 1.94, "flippedAt": "2026-06-15" },
      "alignment": "up"
    }
  ]
}
```

`alignment` is `"up"` when both timeframes read `1`, `"down"` when both read
`-1`, otherwise `"mixed"`.

Size is roughly 35KB for ~105 symbols. Committed daily, so the file's git history
accumulates a dated snapshot series at no cost.

## The page — `/flips`

**Fresh signals** (the reason the page exists) — symbols whose `daily.flippedAt`
falls within the last **7 calendar days**, newest first. Calendar days, not
"sessions", so the rule means the same thing for a stock and for bitcoin. Each
row: ticker, name, the direction it flipped, how many days ago, whether the
weekly agrees, and price. Empty state names the fact plainly ("nothing flipped
in the last 7 days") rather than rendering a blank panel.

**Full board** — all ~105 symbols, sortable via the existing
`src/components/sortable.tsx`, columns: symbol, price, daily trend, weekly
trend, momentum (`daily.macdHist`), alignment, days since daily flip.

`alignment` is derived from Supertrend direction only — one indicator, one
stated rule, trivially explainable. MACD is shown as its own momentum column
rather than folded into the verdict, so a reader can see the two disagree.

Each ticker links to its existing chart on the markets page. Footer states the
exact rule (`Supertrend(10, 3)` and `MACD(12, 26, 9)`, daily and weekly), the
`generatedAt` timestamp, and the disclaimer: indicator output, not investment
advice.

Styling follows the existing dark terminal treatment used by `/signals`.

## Failure handling

Mirrors the alerting just added to game-ranker:

- **Preflight** — one probe against Yahoo before the long loop; a clear,
  named reason on failure rather than a stack trace 90 seconds in.
- **Per-symbol tolerance** — an individual symbol failing is logged and skipped;
  only breaching the 95% floor aborts the run.
- **Sanity gate** — `npm test` must pass before the commit step.
- **Alert issue** — `if: failure()` opens (or comments on) a single GitHub issue
  and self-closes on the next success.
- **Stale-safe** — a failed run writes nothing, so the site keeps serving the
  last good dataset.

## Testing

Unit tests (Vitest), extending the existing suite:

1. **Weekly resample** — a hand-built daily fixture spanning three weeks with a
   known Monday boundary → asserts OHLC aggregation, week-start timestamps, and
   that the trailing partial week is excluded.
2. **`flippedAt` derivation** — a synthetic price series engineered to flip
   Supertrend on a known bar → asserts the returned date, plus the
   never-flipped case returning `null`.
3. **Bar-completeness rule** — asserts the final bar is dropped for `crypto`
   and kept for `equity`.
4. **Universe schema** — every entry has `symbol`/`name`/`class`, no duplicate
   symbols, class is one of the three valid values.
5. **Dataset sanity** — committed `signals.json` parses, has ≥100 symbols, and
   contains no `NaN`/`null` prices. This is the gate that protects the commit.

Indicator math itself is not retested — `indicators.test.ts` already covers it,
and this feature deliberately adds a caller rather than new math.

## Files

**New**
- `src/data/universe.json`
- `src/data/signals.json` (generated)
- `scripts/scan-signals.ts`
- `src/lib/resample.ts` — daily→weekly, isolated so it is testable alone
- `src/lib/flips.ts` — `flippedAt` + alignment derivation
- `src/app/flips/page.tsx`, `src/app/flips/layout.tsx`
- `src/lib/resample.test.ts`, `src/lib/flips.test.ts`
- `.github/workflows/scan.yml`

**Modified**
- `package.json` — `scan` script; add `tsx` devDependency so the script can
  import the existing TypeScript indicator module instead of duplicating the
  math in `.mjs`
- `src/components/site-footer.tsx` — nav link to `/flips`

This repo has `src/app/robots.ts` but no `sitemap.ts`, so there is no sitemap to
update.

## Risks

| Risk | Mitigation |
|---|---|
| Yahoo is unofficial and can break or rate-limit | Preflight + 95% floor + stale-safe writes + alert issue. Same failure mode game-ranker just taught us to instrument. |
| GitHub cron delayed or dropped | `flippedAt` is derived from history, so a missed run self-repairs. |
| S&P 100 membership drifts | A dead symbol fails its fetch, is skipped, and is visible in the run log. |
| Daily commits inflate repo size | ~35KB/day ≈ 9MB/year. Acceptable. |
| Page reads as financial advice | Rule and disclaimer stated on-page; no "buy"/"sell" wording anywhere in the copy. |

## Future (out of scope)

The committed history of `signals.json` is a dated record of every signal this
system produced. Once a few months accumulate, that supports an honest
hit-rate analysis — *did the flips actually lead anywhere?* — which is a far
rarer portfolio artifact than the screener itself.
