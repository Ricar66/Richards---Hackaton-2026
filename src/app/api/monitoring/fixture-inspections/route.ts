import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { actorFrom } from "@/lib/actor";
import { apiError, databaseUnavailable } from "@/lib/http";
import { FixtureInspectionError, requestFixtureInspection } from "@/modules/monitoring/application/request-fixture-inspection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const body = z.object({
  deviceId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  dedicated: z.literal(true),
  expectedUse: z.literal(true),
});
export async function POST(req: NextRequest) {
  let raw: unknown;
  try { raw = await req.json(); } catch { return apiError(400, "INVALID_JSON", "JSON inválido"); }
  const parsed = body.safeParse(raw);
  if (!parsed.success) return apiError(422, "INVALID_INSPECTION", "Confirme o sensor dedicado e o uso esperado");
  try {
    const result = await requestFixtureInspection(parsed.data.deviceId, parsed.data, actorFrom(req));
    if (!result.created) return apiError(409, "ALREADY_OPEN", "Já existe uma vistoria manual ativa para esse ponto");
    return NextResponse.json({ id: result.id, status: "OPEN", source: "MANUAL" }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof FixtureInspectionError) return apiError(409, "INSPECTION_UNAVAILABLE", e.message);
    console.error("request fixture inspection", e); return databaseUnavailable();
  }
}
