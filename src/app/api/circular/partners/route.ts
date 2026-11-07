import { NextResponse } from "next/server";
import { z } from "zod";
import { CircularService } from "@/modules/circular/application/circular-service";
import { partnerInput, CircularError } from "@/modules/circular/domain/contracts";
import { circularActor, circularFailure, readJson } from "@/modules/circular/infrastructure/http";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try { const actor = circularActor(req); const p = partnerInput.safeParse(await readJson(req)); if (!p.success) throw new CircularError("Confira operador, métodos, materiais, validade e declaração de conferência", 422); return NextResponse.json(await new CircularService().createPartner(p.data, actor), { status: 201 }); }
  catch (error) { return circularFailure(error); }
}
export async function PATCH(req: Request) {
  try {
    const actor = circularActor(req), raw = await readJson(req);
    const deactivate = z.object({ id: z.string().min(1).max(100), active: z.literal(false) }).strict().safeParse(raw);
    if (deactivate.success) return NextResponse.json(await new CircularService().deactivatePartner(deactivate.data.id, actor));
    const p = partnerInput.extend({ id: z.string().min(1).max(100) }).strict().safeParse(raw);
    if (!p.success) throw new CircularError("Dados inválidos para nova conferência do operador",422);
    const { id, ...input } = p.data; return NextResponse.json(await new CircularService().reviewPartner(id, input, actor));
  }
  catch (error) { return circularFailure(error); }
}
