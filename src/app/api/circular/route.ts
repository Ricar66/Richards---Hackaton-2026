import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CircularService } from "@/modules/circular/application/circular-service";
import { CircularError } from "@/modules/circular/domain/contracts";
import { circularActor, circularFailure } from "@/modules/circular/infrastructure/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    circularActor(req);
    const p = z.object({ source: z.enum(["MANUAL", "SIMULATED"]).default("MANUAL"), range: z.enum(["24h", "7d", "30d"]).default("30d") }).safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!p.success) throw new CircularError("Filtro inválido", 422);
    return NextResponse.json(await new CircularService().snapshot(p.data.source, p.data.range), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return circularFailure(error); }
}
