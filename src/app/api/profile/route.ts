import { NextRequest, NextResponse } from "next/server";
import { getCompanyProfile } from "@/lib/finnhub";
import { cached } from "@/lib/cache";
import { cdnCache, isValidSymbol } from "@/lib/symbols";

// Fundamentals snapshot for the selected ticker (equities only; crypto → null).
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.trim().toUpperCase();
  if (!symbol) return NextResponse.json({ error: "symbol query param required" }, { status: 400 });
  if (!isValidSymbol(symbol)) return NextResponse.json({ error: "invalid symbol" }, { status: 400 });
  const profile = await cached(`profile:${symbol}`, 24 * 60 * 60_000, () => getCompanyProfile(symbol));
  // getCompanyProfile returns null both for "not an equity" and for a transient
  // upstream failure, so a null is cached only briefly.
  return NextResponse.json({ profile }, { headers: cdnCache(profile ? 6 * 3600 : 300) });
}
