// Turns the raw insider-buy feed into a short written brief via an LLM.
//
// Why this exists: the insiders page shows 25 cluster buys and 25 notable
// purchases as tables. That's accurate but it doesn't *read* — you have to scan
// the whole grid to notice that three Cybin executives bought independently in
// two days. A paragraph says it in one line.
//
// Generated once per day by scripts/write-brief.ts and committed as
// src/data/brief.json, so page views cost zero LLM calls and the free-tier
// quota can never be exhausted by traffic.

import type { InsiderBuy } from "./openinsider";

export interface Brief {
  /** The generated prose. Empty string means "no brief available" — render nothing. */
  text: string;
  /** ISO timestamp of when the brief was written. */
  generatedAt: string;
  /** Model that wrote it, recorded so a change in output is traceable. */
  model: string;
}

export interface BriefFile {
  brief: Brief;
}

const MODEL = "gemini-3.6-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Hard ceiling on the reply. The prompt asks for ~90 words (~130 tokens), but
// this model spends output budget on internal reasoning before it writes, so a
// 300 ceiling truncated the paragraph mid-sentence at 19 characters. The
// headroom is for that thinking, not for a longer brief.
const MAX_OUTPUT_TOKENS = 4000;

// The feed is long and most of it is noise for summarising purposes. Sending
// the top slice keeps the prompt small (cost, latency) and focuses the model on
// what actually carries signal.
const CLUSTER_ROWS = 12;
const BIG_ROWS = 12;

/**
 * Compact the feed into the few fields the model needs.
 * Sending whole objects wastes tokens on keys the brief will never mention.
 */
export function toPromptRows(rows: InsiderBuy[], limit: number): string {
  return rows
    .slice(0, limit)
    .map((r) => [r.ticker, r.company, r.insiders, r.title, r.value].join(" | "))
    .join("\n");
}

export function buildPrompt(clusterBuys: InsiderBuy[], bigBuys: InsiderBuy[]): string {
  // Task first, constraints last. An earlier version led with a block of
  // prohibitions and the model echoed the rules back instead of writing.
  return `Below is today's SEC Form 4 insider-purchase data from a market dashboard.

CLUSTER BUYS — multiple insiders bought the same stock
ticker | company | insider count | industry | total value
${toPromptRows(clusterBuys, CLUSTER_ROWS)}

NOTABLE INDIVIDUAL PURCHASES
ticker | company | who bought | role | total value
${toPromptRows(bigBuys, BIG_ROWS)}

Write one paragraph of 2-3 sentences (roughly 90 words) describing what stands out, naming specific tickers and dollar figures from the rows above. Point out things a reader would miss while scanning the tables: an industry several names share, one company where an unusual number of insiders bought, or a purchase far larger than the rest.

Example of the tone and shape wanted:
"Pharmaceutical names dominate this week's cluster activity, with CYBN, RLMD and QNRX all drawing multiple independent buyers. The largest single commitment came from LILA at $47.8 million across six insiders, roughly double the next biggest. ANGX stands out for size relative to existing holdings, where three insiders grew their stake by 314%."

Describe only what the rows show — no motives, forecasts, or buy/sell language. Return the paragraph alone, with no heading, label, or markdown.`;
}

/** Thrown when the API responds but the payload isn't usable. */
export class BriefError extends Error {}

/**
 * Pull the text out of a Gemini response.
 * Exported so the parsing is testable without a network call — this is the part
 * most likely to break when the provider changes its response shape.
 */
export function extractText(payload: unknown): string {
  const candidates = (payload as { candidates?: unknown[] })?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    // A blocked prompt returns no candidates but does explain itself.
    const reason = (payload as { promptFeedback?: { blockReason?: string } })?.promptFeedback
      ?.blockReason;
    throw new BriefError(reason ? `blocked: ${reason}` : "no candidates in response");
  }
  const parts = (candidates[0] as { content?: { parts?: { text?: string }[] } })?.content?.parts;
  const text = parts
    ?.map((p) => p?.text ?? "")
    .join("")
    .trim();
  if (!text) throw new BriefError("empty text in response");
  return text;
}

/**
 * Whether the text reads as a finished thought.
 *
 * Hitting the token ceiling truncates mid-sentence — one run ended on
 * "...belonged to GPI, where 10% owner". That text is long enough to pass a
 * simple length check but is visibly broken on the page, so require terminal
 * punctuation as well.
 */
export function looksComplete(text: string): boolean {
  return /[.!?]["')\]]?$/.test(text.trim());
}

/**
 * Strip artefacts the model adds despite the prompt: surrounding quotes, a
 * leading label, stray markdown emphasis. Cheaper and more predictable than
 * re-prompting.
 */
export function tidy(text: string): string {
  return text
    .replace(/^```[a-z]*\n?|```$/g, "")
    .replace(/^\s*(brief|summary)\s*:\s*/i, "")
    .replace(/\*\*/g, "")
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function writeBrief(
  clusterBuys: InsiderBuy[],
  bigBuys: InsiderBuy[],
  apiKey: string,
): Promise<Brief> {
  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(clusterBuys, bigBuys) }] }],
      generationConfig: {
        // Low but not zero: deterministic enough to be reproducible, varied
        // enough that consecutive days don't read identically.
        temperature: 0.3,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    }),
  });

  if (!res.ok) {
    // 429 is the free-tier quota; surface it plainly so the workflow log says why.
    const detail = res.status === 429 ? "rate limited / quota exhausted" : await res.text();
    throw new BriefError(`gemini ${res.status}: ${detail.slice(0, 200)}`);
  }

  return {
    text: tidy(extractText(await res.json())),
    generatedAt: new Date().toISOString(),
    model: MODEL,
  };
}
