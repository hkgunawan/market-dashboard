import { describe, it, expect } from "vitest";
import { extractText, tidy, buildPrompt, toPromptRows, looksComplete, BriefError } from "./brief";
import type { InsiderBuy } from "./openinsider";

const row = (over: Partial<InsiderBuy> = {}): InsiderBuy => ({
  filingDate: "2026-09-11",
  tradeDate: "2026-09-10",
  ticker: "CYBN",
  company: "Cybin Inc.",
  insiders: "2 insiders",
  title: "Pharmaceutical Preparations",
  price: "$12.35",
  qty: "400,000",
  deltaOwn: "+5%",
  value: "+$4,941,950",
  ...over,
});

describe("extractText", () => {
  it("pulls the text out of a normal response", () => {
    const payload = { candidates: [{ content: { parts: [{ text: "Insider buying clustered." }] } }] };
    expect(extractText(payload)).toBe("Insider buying clustered.");
  });

  it("joins multi-part responses", () => {
    const payload = { candidates: [{ content: { parts: [{ text: "One. " }, { text: "Two." }] } }] };
    expect(extractText(payload)).toBe("One. Two.");
  });

  it("explains itself when the prompt was blocked", () => {
    // A safety block returns no candidates but names the reason — surface it
    // rather than reporting a generic failure.
    expect(() => extractText({ promptFeedback: { blockReason: "SAFETY" } })).toThrow(
      /blocked: SAFETY/,
    );
  });

  it("throws on an empty or malformed payload rather than returning ''", () => {
    expect(() => extractText({})).toThrow(BriefError);
    expect(() => extractText({ candidates: [] })).toThrow(BriefError);
    expect(() => extractText({ candidates: [{ content: { parts: [{ text: "  " }] } }] })).toThrow(
      /empty text/,
    );
  });
});

describe("tidy", () => {
  it("strips a code fence the model wasn't asked for", () => {
    expect(tidy("```\nPharma led the week.\n```")).toBe("Pharma led the week.");
  });

  it("strips a leading label", () => {
    expect(tidy("Brief: Pharma led the week.")).toBe("Pharma led the week.");
    expect(tidy("Summary: Pharma led the week.")).toBe("Pharma led the week.");
  });

  it("strips wrapping quotes and markdown bold", () => {
    expect(tidy('"**Pharma** led the week."')).toBe("Pharma led the week.");
  });

  it("collapses newlines so the paragraph lays out in one block", () => {
    expect(tidy("Pharma led\nthe   week.")).toBe("Pharma led the week.");
  });

  it("leaves clean prose untouched", () => {
    const clean = "Three Cybin executives bought independently across two days.";
    expect(tidy(clean)).toBe(clean);
  });
});

describe("looksComplete", () => {
  it("accepts a finished paragraph", () => {
    expect(looksComplete("Pharma names dominated the week's cluster activity.")).toBe(true);
  });

  it("rejects the real truncation case — long enough to pass a length check, still broken", () => {
    // Actual output from a run that hit the token ceiling.
    expect(
      looksComplete(
        "Outsizing every cluster group, the single largest transaction belonged to GPI, where 10% owner",
      ),
    ).toBe(false);
  });

  it("allows a closing quote or bracket after the full stop", () => {
    expect(looksComplete('He called it "unusual."')).toBe(true);
    expect(looksComplete("Three insiders bought (per Form 4.)")).toBe(true);
  });

  it("accepts other terminal punctuation", () => {
    expect(looksComplete("Was it unusual?")).toBe(true);
  });

  it("ignores trailing whitespace", () => {
    expect(looksComplete("Ends properly.   ")).toBe(true);
  });
});

describe("toPromptRows", () => {
  it("sends only the fields the brief can mention, to keep the prompt small", () => {
    expect(toPromptRows([row()], 5)).toBe(
      "CYBN | Cybin Inc. | 2 insiders | Pharmaceutical Preparations | +$4,941,950",
    );
  });

  it("caps the row count", () => {
    const rows = Array.from({ length: 30 }, (_, i) => row({ ticker: `T${i}` }));
    expect(toPromptRows(rows, 12).split("\n")).toHaveLength(12);
  });

  it("handles an empty feed without producing a stray newline", () => {
    expect(toPromptRows([], 12)).toBe("");
  });
});

describe("buildPrompt", () => {
  const prompt = buildPrompt([row()], [row({ ticker: "GME", company: "Gamestop Corp." })]);

  it("includes both feeds", () => {
    expect(prompt).toContain("CYBN");
    expect(prompt).toContain("GME");
  });

  // These assert the constraint is present, not its exact wording — the prompt
  // gets reworded when output quality needs tuning, and a brittle string match
  // would fail on a harmless edit while missing a genuine removal.
  it("forbids investment advice — the site is indicator output, not a buy list", () => {
    expect(prompt).toMatch(/buy\/sell language/i);
  });

  it("forbids speculation about motive or direction", () => {
    expect(prompt).toMatch(/no motives, forecasts/i);
  });

  it("asks for a bare paragraph, since the page renders it as prose", () => {
    expect(prompt).toMatch(/no heading, label, or markdown/i);
  });
});
