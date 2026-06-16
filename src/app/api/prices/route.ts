import { NextRequest, NextResponse } from "next/server";
import { getBulkPrices } from "@/lib/market";

// Bulk current prices for the table pages (insider-buys / smart-money).
// Higher cap than /api/quotes and fetched in parallel via Finnhub, so every row fills fast.
export async function GET(req: NextRequest) {
  const symbols = (req.nextUrl.searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 80);
  if (symbols.length === 0) {
    return NextResponse.json({ error: "symbols query param required" }, { status: 400 });
  }
  return NextResponse.json(await getBulkPrices(symbols));
}
