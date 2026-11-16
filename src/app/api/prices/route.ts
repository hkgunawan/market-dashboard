import { NextRequest, NextResponse } from "next/server";
import { getBulkPrices } from "@/lib/market";
import { cdnCache, parseSymbols } from "@/lib/symbols";

// Bulk current prices for the table pages (insider-buys / smart-money).
// Higher cap than /api/quotes and fetched in parallel via Finnhub, so every row fills fast.
export async function GET(req: NextRequest) {
  const symbols = parseSymbols(req.nextUrl.searchParams.get("symbols"), 80);
  if (symbols.length === 0) {
    return NextResponse.json({ error: "symbols query param required" }, { status: 400 });
  }
  const data = await getBulkPrices(symbols);
  // a response with gaps is cached only briefly so the next view can fill them
  return NextResponse.json(data, { headers: cdnCache(data.failed.length ? 30 : 300) });
}
