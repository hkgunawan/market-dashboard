import { NextRequest, NextResponse } from "next/server";
import { getBulkEarnings } from "@/lib/market";
import { cdnCache, parseSymbols } from "@/lib/symbols";

// Upcoming earnings + recent surprises for the watchlist (equities only; crypto/ETFs omitted).
export async function GET(req: NextRequest) {
  const symbols = parseSymbols(req.nextUrl.searchParams.get("symbols"), 20);
  if (symbols.length === 0) {
    return NextResponse.json({ error: "symbols query param required" }, { status: 400 });
  }
  // upstream values are cached 6h; an hour at the CDN keeps repeat views free
  return NextResponse.json({ earnings: await getBulkEarnings(symbols) }, { headers: cdnCache(3600) });
}
