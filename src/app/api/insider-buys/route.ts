import { NextResponse } from "next/server";
import { getInsiderReport } from "@/lib/openinsider";

export async function GET() {
  try {
    return NextResponse.json(await getInsiderReport());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
