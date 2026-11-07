import { NextResponse } from "next/server";
import { CircularService } from "@/modules/circular/application/circular-service";
import { actionInput, CircularError } from "@/modules/circular/domain/contracts";
import { circularActor, circularFailure, readJson } from "@/modules/circular/infrastructure/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, context: Context) {
  try { circularActor(req); return NextResponse.json(await new CircularService().detail((await context.params).id), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return circularFailure(error); }
}
export async function PATCH(req: Request, context: Context) {
  try { const actor = circularActor(req); const p = actionInput.safeParse(await readJson(req)); if (!p.success) throw new CircularError("Dados inválidos; a etapa exige confirmação humana e campos completos", 422); return NextResponse.json(await new CircularService().action((await context.params).id, p.data, actor)); }
  catch (error) { return circularFailure(error); }
}
