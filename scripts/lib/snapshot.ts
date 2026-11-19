// Saves the insider feed a brief was written from, one file per UTC day, into
// evals/fixtures/. Those real feeds are the eval set for `npm run eval`.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { InsiderReport } from "../../src/lib/openinsider";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const FIXTURES = join(ROOT, "evals", "fixtures");

export function saveSnapshot(report: InsiderReport): string | null {
  try {
    mkdirSync(FIXTURES, { recursive: true });
    const file = join(FIXTURES, `${new Date().toISOString().slice(0, 10)}.json`);
    const { clusterBuys, bigBuys, generatedAt } = report;
    writeFileSync(file, `${JSON.stringify({ generatedAt, clusterBuys, bigBuys }, null, 2)}\n`);
    return file;
  } catch (err) {
    // A snapshot is for measurement only. Never let it stop the brief.
    console.error(`snapshot not saved: ${(err as Error).message}`);
    return null;
  }
}

export function loadSnapshots(): { name: string; report: InsiderReport }[] {
  let names: string[] = [];
  try {
    names = readdirSync(FIXTURES).filter((n) => n.endsWith(".json")).sort();
  } catch {
    return [];
  }
  return names.map((name) => ({
    name,
    report: JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as InsiderReport,
  }));
}
