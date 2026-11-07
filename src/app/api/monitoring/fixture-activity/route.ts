import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, databaseUnavailable } from "@/lib/http";
import { getFixtureActivity } from "@/modules/monitoring/application/get-fixture-activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const query = z.object({
  siteId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  deviceId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
});
/** Leituras DEVICE reais; 72 horas independentemente do filtro de gráficos. */
export async function GET(req: NextRequest) {
  const p = query.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!p.success) return apiError(422, "INVALID_FILTER", "Filtro de unidade ou dispositivo inválido");
  try {
    return NextResponse.json(await getFixtureActivity(p.data), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("fixture activity", error);
    return databaseUnavailable();
  }
}
