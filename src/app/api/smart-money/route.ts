import { NextResponse } from "next/server";
import { getSmartMoneyReport } from "@/lib/edgar";

// First uncached call walks ~40 EDGAR requests sequentially — allow time for it.
export const maxDuration = 120;

export async function GET() {
  try {
    return NextResponse.json(await getSmartMoneyReport());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
