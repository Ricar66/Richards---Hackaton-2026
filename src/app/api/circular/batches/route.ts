import { NextResponse } from "next/server";
import { CircularService } from "@/modules/circular/application/circular-service";
import { batchInput, CircularError } from "@/modules/circular/domain/contracts";
import { circularActor, circularFailure, readJson } from "@/modules/circular/infrastructure/http";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try { const actor = circularActor(req); const p = batchInput.safeParse(await readJson(req)); if (!p.success) throw new CircularError("Confira os dados do lote, origem, data e peso (até 3 casas)", 422); return NextResponse.json(await new CircularService().create(p.data, actor), { status: 201 }); }
  catch (error) { return circularFailure(error); }
}
