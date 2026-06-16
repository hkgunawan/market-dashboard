import { NextRequest, NextResponse } from "next/server";
import { getQuote } from "@/lib/market";

// AI daily brief — only active when ANTHROPIC_API_KEY is set in .env.local.
// The brief summarizes the watchlist's current state; it is commentary, not advice.

export async function GET(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ available: false });

  const symbols = (req.nextUrl.searchParams.get("symbols") ?? "PAXG-USD,QQQ,BTC-USD")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);

  const results = await Promise.allSettled(symbols.map(getQuote));
  const lines = results
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof getQuote>>> => r.status === "fulfilled")
    .map((r) => `${r.value.name} (${r.value.symbol}): ${r.value.price} ${r.value.currency}, ${r.value.changePct.toFixed(2)}% today`);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: `You are a neutral markets-desk writer. Given today's watchlist snapshot, write a 3-4 sentence plain-English brief of what moved and by how much. No predictions, no advice, no hype.\n\n${lines.join("\n")}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    return NextResponse.json({ available: true, error: `Anthropic API ${res.status}` }, { status: 502 });
  }
  const data = await res.json();
  const text = data.content?.[0]?.text ?? "";
  return NextResponse.json({ available: true, brief: text });
}
