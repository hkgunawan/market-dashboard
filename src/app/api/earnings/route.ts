import { NextRequest, NextResponse } from "next/server";
import { getBulkEarnings } from "@/lib/market";

// Upcoming earnings + recent surprises for the watchlist (equities only; crypto/ETFs omitted).
export async function GET(req: NextRequest) {
  const symbols = (req.nextUrl.searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
  if (symbols.length === 0) {
    return NextResponse.json({ error: "symbols query param required" }, { status: 400 });
  }
  return NextResponse.json({ earnings: await getBulkEarnings(symbols) });
}
