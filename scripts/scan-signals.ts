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
