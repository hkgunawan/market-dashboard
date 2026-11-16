import { NextResponse } from "next/server";
import { getSmartMoneyReport } from "@/lib/edgar";
import { cdnCache } from "@/lib/symbols";

// First uncached call walks ~40 EDGAR requests sequentially — allow time for it.
export const maxDuration = 120;

export async function GET() {
  try {
    // 13F data changes quarterly; an hour at the CDN spares the slow EDGAR walk
    return NextResponse.json(await getSmartMoneyReport(), { headers: cdnCache(3600) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
