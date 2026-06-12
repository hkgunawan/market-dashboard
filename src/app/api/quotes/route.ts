import { NextRequest, NextResponse } from "next/server";
import { getQuotes } from "@/lib/market";

export async function GET(req: NextRequest) {
  const symbols = (req.nextUrl.searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
  if (symbols.length === 0) {
    return NextResponse.json({ error: "symbols query param required" }, { status: 400 });
  }
  return NextResponse.json(await getQuotes(symbols));
}
