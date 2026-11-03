import { NextRequest, NextResponse } from "next/server";
import { getDashboard } from "@/modules/analytics/application/get-dashboard";
import { OverviewNotSeededError } from "@/modules/analytics/application/get-overview";
import { FilterError, parseAnalyticsFilter } from "@/modules/analytics/domain/analytics-filter";
import { buildReportPdf, reportFileName } from "@/modules/reports/application/build-report-pdf";
import { apiError, databaseUnavailable, notSeeded } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** PDF do recorte: mesmos parâmetros e mesmo serviço do BI (`/api/analytics/dashboard`). */
export async function GET(req: NextRequest) {
  let data;
  try { data = await getDashboard(parseAnalyticsFilter(req.nextUrl.searchParams)); }
  catch (e) {
    if (e instanceof FilterError) return apiError(422, "INVALID_FILTER", e.message);
    if (e instanceof OverviewNotSeededError) return notSeeded();
    console.error("reports summary", e); return databaseUnavailable();
  }
  const now = new Date();
  const bytes = await buildReportPdf(data, now);
  return new NextResponse(new Uint8Array(bytes), { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${reportFileName(now)}"`,
    "Cache-Control": "no-store",
    "X-Report-Provenance": data.provenance.label,
  } });
}
