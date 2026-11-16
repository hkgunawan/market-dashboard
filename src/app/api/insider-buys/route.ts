import { NextResponse } from "next/server";
import { getInsiderReport } from "@/lib/openinsider";
import { cdnCache } from "@/lib/symbols";

export async function GET() {
  try {
    return NextResponse.json(await getInsiderReport(), { headers: cdnCache(900) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
