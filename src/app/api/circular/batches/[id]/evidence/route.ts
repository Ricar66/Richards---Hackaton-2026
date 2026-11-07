import { NextResponse } from "next/server";
import { CircularService } from "@/modules/circular/application/circular-service";
import { evidenceInput, CircularError } from "@/modules/circular/domain/contracts";
import { circularActor, circularFailure, readJson } from "@/modules/circular/infrastructure/http";
export const runtime = "nodejs";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const actor = circularActor(req); const p = evidenceInput.safeParse(await readJson(req, 3 * 1024 * 1024)); if (!p.success) throw new CircularError("Comprovante inválido: confira arquivo, quantidade, data e conferência", 422); return NextResponse.json(await new CircularService().addEvidence((await params).id, p.data, actor), { status: 201 }); }
  catch (error) { return circularFailure(error); }
}
