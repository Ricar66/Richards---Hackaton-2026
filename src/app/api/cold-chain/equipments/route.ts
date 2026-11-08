import { NextResponse } from "next/server";
import { databaseUnavailable } from "@/lib/http";
import { DonationService } from "@/modules/donations/application/donation-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Equipamentos ativos que podem ser declarados como origem do alimento na triagem. Privado. */
export async function GET() {
  try { return NextResponse.json(await new DonationService().originEquipments(), { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { console.error("cold equipments", e); return databaseUnavailable(); }
}
