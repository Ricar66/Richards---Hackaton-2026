import { NextResponse } from "next/server";
import { getLive } from "@/modules/analytics/application/get-live";
import { databaseUnavailable } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json(await getLive(), { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { console.error("analytics live", e); return databaseUnavailable(); }
}
