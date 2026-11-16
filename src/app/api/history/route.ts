import { NextRequest, NextResponse } from "next/server";
import { getHistory, type Range } from "@/lib/market";
import { macdCM, supertrend, heikinAshi } from "@/lib/indicators";
import { cdnCache, isValidSymbol } from "@/lib/symbols";

const RANGES: Range[] = ["1d", "5d", "1mo", "6mo", "1y", "5y"];

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.trim().toUpperCase();
  const range = (req.nextUrl.searchParams.get("range") ?? "6mo") as Range;
  const ha = req.nextUrl.searchParams.get("type") === "ha";
  if (!symbol) return NextResponse.json({ error: "symbol query param required" }, { status: 400 });
  // Reject anything that is not a single ticker: Twelve Data bills "A,B,C" as a
  // batch, so an unvalidated symbol could burn the daily quota in a few requests.
  if (!isValidSymbol(symbol)) return NextResponse.json({ error: "invalid symbol" }, { status: 400 });
  if (!RANGES.includes(range)) return NextResponse.json({ error: "invalid range" }, { status: 400 });

  try {
    const raw = await getHistory(symbol, range);
    // On a Heikin Ashi chart, indicators are computed on the HA series too (as
    // TradingView does when the chart type is HA).
    const candles = ha ? heikinAshi(raw) : raw;
    const closes = candles.map((c) => c.close);
    return NextResponse.json(
      {
        candles,
        supertrend: supertrend(candles, 10, 3),
        macd: macdCM(closes, 12, 26, 9),
      },
      // intraday views move; daily/weekly candles barely change within the hour
      { headers: cdnCache(range === "1d" || range === "5d" ? 60 : 900) }
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
