import { waterDashboard } from "@/modules/analytics/domain/water-projection";
import { NextRequest, NextResponse } from "next/server";
import { getDashboard } from "@/modules/analytics/application/get-dashboard";
import { OverviewNotSeededError } from "@/modules/analytics/application/get-overview";
import { FilterError, parseAnalyticsFilter } from "@/modules/analytics/domain/analytics-filter";
import { apiError, databaseUnavailable, notSeeded } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Mesmo filtro da URL do BI: `?range=24h|7d|30d` ou `from`/`to` ISO, `siteId`, `deviceId`, `source`. */
export async function GET(req: NextRequest) {
  try { return NextResponse.json(waterDashboard(await getDashboard(parseAnalyticsFilter(req.nextUrl.searchParams))), { headers: { "Cache-Control": "no-store" } }); }
  catch (e) {
    if (e instanceof FilterError) return apiError(422, "INVALID_FILTER", e.message);
    if (e instanceof OverviewNotSeededError) return notSeeded();
    console.error("analytics dashboard", e); return databaseUnavailable();
  }
}
