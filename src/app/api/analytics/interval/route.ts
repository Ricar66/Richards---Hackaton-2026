import { NextRequest, NextResponse } from "next/server";
import { getInterval } from "@/modules/analytics/application/get-interval";
import { FilterError, parseAnalyticsFilter } from "@/modules/analytics/domain/analytics-filter";
import { apiError, databaseUnavailable } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Leituras e ocorrências de um intervalo do gráfico: `?start=ISO&end=ISO` + os filtros de recorte do BI. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  try {
    const scope = new URLSearchParams(q); scope.delete("start"); scope.delete("end");
    const f = parseAnalyticsFilter(scope);
    return NextResponse.json(await getInterval(f, new Date(q.get("start") ?? ""), new Date(q.get("end") ?? "")), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof FilterError) return apiError(422, "INVALID_FILTER", e.message);
    console.error("analytics interval", e); return databaseUnavailable();
  }
}
