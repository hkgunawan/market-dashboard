import { NextRequest, NextResponse } from "next/server";
import { getCompanyProfile } from "@/lib/finnhub";
import { cached } from "@/lib/cache";

// Fundamentals snapshot for the selected ticker (equities only; crypto → null).
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "symbol query param required" }, { status: 400 });
  const profile = await cached(`profile:${symbol}`, 24 * 60 * 60_000, () => getCompanyProfile(symbol));
  return NextResponse.json({ profile });
}
