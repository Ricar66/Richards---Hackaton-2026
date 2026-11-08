import { NextRequest, NextResponse } from "next/server";
import { apiError, databaseUnavailable } from "@/lib/http";
import { DonationService } from "@/modules/donations/application/donation-service";
import { DonationRuleError } from "@/modules/donations/domain/donation-workflow";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Prévia da temperatura do equipamento escolhido na triagem (desde 24 h antes da pesagem), na origem do lote. Privado. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const equipmentId = req.nextUrl.searchParams.get("equipmentId") ?? "";
  if (!equipmentId || equipmentId.length > 64) return apiError(422, "VALIDATION_ERROR", "Informe o equipamento");
  try { return NextResponse.json(await new DonationService().triageEvidence(id, equipmentId), { headers: { "Cache-Control": "no-store" } }); }
  catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") return apiError(404, "NOT_FOUND", "Lote não encontrado");
    if (e instanceof DonationRuleError) return apiError(404, "EQUIPMENT_NOT_FOUND", e.message);
    console.error("cold evidence", e); return databaseUnavailable();
  }
}
