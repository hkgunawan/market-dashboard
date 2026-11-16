import { NextRequest, NextResponse } from "next/server";
import { getQuotes } from "@/lib/market";
import { cdnCache, parseSymbols } from "@/lib/symbols";

export async function GET(req: NextRequest) {
  const symbols = parseSymbols(req.nextUrl.searchParams.get("symbols"), 20);
  if (symbols.length === 0) {
    return NextResponse.json({ error: "symbols query param required" }, { status: 400 });
  }
  const data = await getQuotes(symbols);
  // the page polls every 60s; a partial result is cached briefly so it can recover
  return NextResponse.json(data, { headers: cdnCache(data.failed.length ? 15 : 45) });
}
