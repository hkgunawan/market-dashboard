import { NextResponse } from "next/server";
import { getEtfFlows, hasCoinglass } from "@/lib/coinglass";

export async function GET() {
  if (!hasCoinglass()) return NextResponse.json({ available: false });
  try {
    return NextResponse.json({ available: true, days: await getEtfFlows() });
  } catch (e) {
    return NextResponse.json({ available: true, error: (e as Error).message }, { status: 502 });
  }
}
