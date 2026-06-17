import { NextRequest, NextResponse } from "next/server";
import { getHistory, type Range } from "@/lib/market";
import { macdCM, supertrend } from "@/lib/indicators";

const RANGES: Range[] = ["1d", "5d", "1mo", "6mo", "1y", "5y"];

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  const range = (req.nextUrl.searchParams.get("range") ?? "6mo") as Range;
  if (!symbol) return NextResponse.json({ error: "symbol query param required" }, { status: 400 });
  if (!RANGES.includes(range)) return NextResponse.json({ error: "invalid range" }, { status: 400 });

  try {
    const candles = await getHistory(symbol, range);
    const closes = candles.map((c) => c.close);
    return NextResponse.json({
      candles,
      supertrend: supertrend(candles, 10, 3),
      macd: macdCM(closes, 12, 26, 9),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
