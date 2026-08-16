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
// Free tier is 8 requests per minute. 7.6s spacing computes to 7.9/min, which
// looked fine locally only because each response took ~14s on a home connection
// — the real pacing was ~2.7/min. On a GitHub runner the responses are fast, the
// sleep becomes the only delay, and 7.9/min lands 9-13 calls inside some
// wall-clock minutes (Twelve Data meters fixed minutes, not a rolling window).
// The first unattended run lost 29 symbols to that. 9.5s = 6.3/min, ~21% margin.
const SPACING_MS = 9_500;
const SUCCESS_FLOOR = 0.9;

// A MINUTE-quota rejection is transient — the next minute clears it. Treating it
// as a permanent symbol failure is what turned one burst into 29 lost symbols and
// a run below the floor.
//
// The match must be narrow. Twelve Data phrases the daily-credit exhaustion the
// same way ("run out of API credits"), and that one is NOT transient: retrying
// every remaining symbol would sleep 130s each, ~3.8h total, blow the workflow's
// timeout — and a timed-out job is CANCELLED, which skips `if: failure()` and
// therefore skips the alert entirely. That would turn the loud failure this
// pipeline is built around back into a silent one. Match the minute wording only.
const RATE_LIMIT_WAIT_MS = 65_000;
const MAX_RATE_LIMIT_RETRIES = 12; // whole-run budget: ~13 min of backoff, worst case
let rateLimitRetries = 0;

const isMinuteRateLimit = (err: unknown) => /current minute/i.test((err as Error).message ?? "");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Fetch a series, backing off once and retrying if we hit the per-minute cap.
async function fetchSeries(symbol: string, interval: "1day" | "1week", size: number) {
  try {
    return await getTdSeries(symbol, interval, size, KEY);
  } catch (err) {
    if (!isMinuteRateLimit(err)) throw err;
    if (rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) {
      throw new Error(
        `minute rate-limited and the per-run retry budget (${MAX_RATE_LIMIT_RETRIES}) is spent — ` +
          `pacing is too tight or the key is shared with another consumer`
      );
    }
    rateLimitRetries++;
    console.warn(
      `  ${symbol.padEnd(9)} minute-rate-limited on ${interval}; waiting 65s ` +
        `(retry ${rateLimitRetries}/${MAX_RATE_LIMIT_RETRIES})`
    );
    await sleep(RATE_LIMIT_WAIT_MS);
    return await getTdSeries(symbol, interval, size, KEY);
  }
}

// One cheap probe before a ~33-minute loop, so an auth or quota problem is
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
  await preflight(universe.length * 2 + MAX_RATE_LIMIT_RETRIES + 10); // + headroom: each retry is a billed credit the base figure does not reserve

  const now = new Date();
  const out: SymbolSignal[] = [];
  const failed: string[] = [];
  let call = 0;

  for (const entry of universe) {
    try {
      if (call++ > 0) await sleep(SPACING_MS);
      const dailyRaw = await fetchSeries(entry.symbol, "1day", DAILY_BARS);
      await sleep(SPACING_MS);
      call++;
      const weeklyRaw = await fetchSeries(entry.symbol, "1week", WEEKLY_BARS);

      // Read the clock here, not at run start: the loop takes ~35 minutes and
      // crosses UTC midnight, so `now` is the wrong day by the time the last
      // symbols land. `now` stays the run's identity, used for generatedAt.
      const trimAt = new Date();
      const daily = dropInProgressDaily(dailyRaw, entry.class, trimAt);
      const weekly = dropInProgressWeekly(weeklyRaw, trimAt);
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

main().catch((err) => {
  console.error(`\nScan failed: ${(err as Error).message}`);
  process.exit(1);
});
