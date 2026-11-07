import { NextResponse } from "next/server";
import { DonationService } from "@/modules/donations/application/donation-service";
import { databaseUnavailable } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Instituições receptoras ativas (destino possível de um lote reservado). */
export async function GET() {
  try { return NextResponse.json(await new DonationService().recipients(), { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { console.error("recipients", e); return databaseUnavailable(); }
}
