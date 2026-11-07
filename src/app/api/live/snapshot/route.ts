import { waterStage } from "@/modules/analytics/domain/water-projection";
import { NextResponse } from "next/server";
import { getStageSnapshot } from "@/modules/analytics/application/get-stage-snapshot";
import { OverviewNotSeededError } from "@/modules/analytics/application/get-overview";
import { databaseUnavailable, notSeeded } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Snapshot da Sala ao vivo (protegido pela Basic Auth do proxy, como o resto da API do operador). */
export async function GET() {
  try { return NextResponse.json(waterStage(await getStageSnapshot()), { headers: { "Cache-Control": "no-store" } }); }
  catch (e) {
    if (e instanceof OverviewNotSeededError) return notSeeded();
    console.error("live snapshot", e);
    return databaseUnavailable();
  }
}
