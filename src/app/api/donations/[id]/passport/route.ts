import { NextRequest, NextResponse } from "next/server";
import { actorFrom } from "@/lib/actor";
import { apiError, databaseUnavailable } from "@/lib/http";
import { publicBaseUrl } from "@/lib/public-url";
import { DonationService } from "@/modules/donations/application/donation-service";
import { passportPath } from "@/modules/donations/domain/passport";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Emite o passaporte de um lote antigo (sem token). Privado: passa pela senha do operador no proxy. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const r = await new DonationService().issuePassport(id, actorFrom(req));
    return NextResponse.json({ ...r, url: publicBaseUrl(req.headers) + passportPath(r.token) }, { status: r.created ? 201 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") return apiError(404, "NOT_FOUND", "Lote não encontrado");
    console.error("passport issue", e); return databaseUnavailable();
  }
}
