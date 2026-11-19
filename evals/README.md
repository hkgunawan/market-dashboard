# Brief evals

The `/insiders` page carries a daily paragraph written by an LLM (Gemini, free tier) over SEC Form 4 insider-purchase data. On a finance page, bad prose isn't the risk that matters. The risk is a fluent sentence quoting a ticker or a dollar figure that isn't in the data. This folder is how that risk gets measured.

## What runs where

| | When | What |
|---|---|---|
| **Grounding check** (`src/lib/brief-check.ts`) | every daily run, before publishing | Every ticker-like token must be one of the rows the model was shown. Every dollar figure must match a row value within the precision the sentence uses ("$40.39 million" → ±$10k). No buy/sell or forecast language. **If any check fails, yesterday's brief stays up.** |
| **Fixtures** (`fixtures/YYYY-MM-DD.json`) | saved by every daily run | The exact feed each brief was written from. The eval set grows by one real day at a time, with no hand-made examples. |
| **Eval** (`npm run eval`, or the *Evaluate insider brief* workflow) | on demand | Generates the brief several times per saved feed (temperature 0.3, so one sample proves little) and scores each output: complete · length · grounded · mentions the largest purchase. Results go to `results/`. |

All checks are deterministic code, not a second LLM grading the first, so a result is reproducible and costs nothing.

## Findings so far

- **19 Nov 2026, first run against real data:** the model wrote `$30.66 million` for $30,666,320. It **truncated** instead of rounding. That's imprecise, not invented, so the tolerance was widened from half a unit to one unit of the last written digit. A test pins this case.
- The same run flagged `$3.22 million`. It turned out to be real (Kamfar, $3,224,289) but had slid from row 12 to row 17 as newer filings arrived after the brief was written. That's why the daily job checks against the feed **at generation time** and saves that exact feed as a fixture, instead of re-fetching later.

## Limits (stated plainly)

- The check verifies **facts**, not insight. A grounded brief can still be dull.
- Ticker detection is pattern-based. A new all-caps word can be a false positive, which fails safe: the brief is held back, never published wrong.
- The eval set is small and young. Pass rates get more meaningful as fixtures accumulate.
