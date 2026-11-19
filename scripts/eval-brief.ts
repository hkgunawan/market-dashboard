// Measures brief quality on saved real feeds (evals/fixtures/*.json).
//
// For each feed it generates the brief several times (the model samples at
// temperature 0.3, so one run proves little) and scores every output on the
// same checks the daily job enforces, plus one quality check the job doesn't:
// does the brief mention the single largest purchase it was shown?
//
//   GEMINI_API_KEY=xxxx npm run eval            # ~15 calls, free tier
//   GEMINI_API_KEY=xxxx npm run eval -- --calls 30
//
// Results print as a table and are saved to evals/results/<date>.json so a
// prompt change can be compared before vs after with real numbers.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { writeBrief, looksComplete, shownRows, PROMPT_VERSION } from "../src/lib/brief";
import { checkBrief, parseValue } from "../src/lib/brief-check";
import type { InsiderBuy } from "../src/lib/openinsider";
import { FIXTURES, loadSnapshots } from "./lib/snapshot";

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  console.error("Missing GEMINI_API_KEY.");
  process.exit(1);
}

const arg = process.argv.indexOf("--calls");
const BUDGET = arg > -1 ? Number(process.argv[arg + 1]) : 15;
const GAP_MS = 6_000; // free tier is ~10 requests/min; stay well under it

interface Score {
  fixture: string;
  complete: boolean;
  length: boolean;
  grounded: boolean;
  mentionsTop: boolean;
  problems: string[];
  text: string;
}

function topTicker(rows: InsiderBuy[]): string | null {
  let best: { t: string; v: number } | null = null;
  for (const r of rows) {
    const v = parseValue(r.value);
    if (v !== null && (!best || v > best.v)) best = { t: r.ticker.toUpperCase(), v };
  }
  return best?.t ?? null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The free tier returns 503 "overloaded" and drops connections at busy times
// (3 of 10 calls on the first run). One retry after a pause separates a
// transient outage from a real failure without burning the quota.
async function generate(report: { clusterBuys: InsiderBuy[]; bigBuys: InsiderBuy[] }) {
  try {
    return await writeBrief(report.clusterBuys, report.bigBuys, KEY!);
  } catch (err) {
    const msg = (err as Error).message;
    if (!/503|fetch failed|ECONNRESET|timeout/i.test(msg)) throw err;
    console.log(`    transient (${msg.slice(0, 40)}), retrying once in 15s`);
    await sleep(15_000);
    return writeBrief(report.clusterBuys, report.bigBuys, KEY!);
  }
}

async function main() {
  // Most recent feeds first: they reflect the current data shape.
  const fixtures = loadSnapshots().reverse();
  if (fixtures.length === 0) {
    console.error(`No fixtures in ${FIXTURES}. They are saved by each \`npm run brief\`.`);
    process.exit(1);
  }

  const use = fixtures.slice(0, BUDGET);
  const perFixture = Math.max(1, Math.floor(BUDGET / use.length));
  console.log(`${use.length} feed(s) × ${perFixture} sample(s) = ${use.length * perFixture} calls\n`);

  const scores: Score[] = [];
  for (const { name, report } of use) {
    const rows = shownRows(report.clusterBuys, report.bigBuys);
    const top = topTicker(rows);
    for (let i = 0; i < perFixture; i++) {
      if (scores.length > 0) await sleep(GAP_MS);
      try {
        const { text } = await generate(report);
        const check = checkBrief(text, rows);
        scores.push({
          fixture: name,
          complete: looksComplete(text),
          length: text.length >= 80 && text.length <= 900,
          grounded: check.ok,
          mentionsTop: top !== null && text.toUpperCase().includes(top),
          problems: check.problems,
          text,
        });
      } catch (err) {
        // A failed call is a failed sample, not a crashed eval.
        scores.push({
          fixture: name, complete: false, length: false, grounded: false, mentionsTop: false,
          problems: [`call failed: ${(err as Error).message}`], text: "",
        });
      }
      const s = scores[scores.length - 1];
      const mark = (b: boolean) => (b ? "✓" : "✗");
      console.log(
        `${name} #${i + 1}  complete ${mark(s.complete)}  length ${mark(s.length)}  ` +
          `grounded ${mark(s.grounded)}  top ${mark(s.mentionsTop)}` +
          (s.problems.length ? `\n    ${s.problems.join("\n    ")}` : "") +
          // Print the text of a grounding failure: the problem list says
          // *what* was wrong, the sentence shows *why* the model did it.
          (!s.grounded && s.text ? `\n    text: ${s.text}` : ""),
      );
      // Save after every sample, so a timeout or cancel keeps what was learned.
      save(scores);
    }
  }
  save(scores, true);
}

const RESULT_FILE = join(
  FIXTURES, "..", "results", `${new Date().toISOString().slice(0, 16).replace(":", "")}.json`,
);

function save(scores: Score[], final = false) {
  const n = scores.length;
  const rate = (k: keyof Score) => scores.filter((s) => s[k] === true).length;
  const passAll = scores.filter((s) => s.complete && s.length && s.grounded).length;
  const summary = {
    samples: n,
    complete: rate("complete"),
    length: rate("length"),
    grounded: rate("grounded"),
    mentionsTop: rate("mentionsTop"),
    passedAllGates: passAll,
  };

  mkdirSync(dirname(RESULT_FILE), { recursive: true });
  writeFileSync(
    RESULT_FILE,
    `${JSON.stringify({ ranAt: new Date().toISOString(), prompt: PROMPT_VERSION, summary, scores }, null, 2)}\n`,
  );
  if (!final) return;

  console.log(`\n── summary (${n} samples, prompt ${PROMPT_VERSION}) ──`);
  console.log(`complete      ${summary.complete}/${n}`);
  console.log(`length        ${summary.length}/${n}`);
  console.log(`grounded      ${summary.grounded}/${n}`);
  console.log(`mentions top  ${summary.mentionsTop}/${n}`);
  console.log(`would publish ${passAll}/${n}  (complete + length + grounded)`);
  console.log(`\nsaved ${RESULT_FILE}`);
}

main();
