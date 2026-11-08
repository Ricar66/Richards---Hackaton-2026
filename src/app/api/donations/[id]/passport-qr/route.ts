import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
import { apiError, databaseUnavailable } from "@/lib/http";
import { publicBaseUrl } from "@/lib/public-url";
import { passportPath } from "@/modules/donations/domain/passport";
import { passportQrSvg } from "@/modules/donations/infrastructure/passport-qr";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** QR (SVG) do passaporte do lote, para a gaveta do BI. Privado: quem tem o QR tem o link, então só o operador gera. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const lot = await getDb().donationBatch.findFirst({ where: { id, organizationId: DEMO_ORG_ID }, select: { passportToken: true } });
    if (!lot?.passportToken) return apiError(404, "NOT_FOUND", "Lote sem passaporte");
    return new NextResponse(passportQrSvg(publicBaseUrl(req.headers) + passportPath(lot.passportToken)), {
      headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (e) { console.error("passport qr", e); return databaseUnavailable(); }
}
