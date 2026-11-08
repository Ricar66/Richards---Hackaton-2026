import { NextRequest, NextResponse } from "next/server";
import { getColdChain } from "@/modules/cold-chain/application/cold-chain-service";
import { apiError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HOURS = new Set([24, 168, 720]);

/** Cadeia do frio (privada: o proxy exige o operador em /api). `hours` = 24, 168 ou 720; `source` explícita. */
export async function GET(req: NextRequest) {
  const hours = Number(req.nextUrl.searchParams.get("hours") ?? 24);
  const source = req.nextUrl.searchParams.get("source") ?? "DEVICE";
  if (!HOURS.has(hours)) return apiError(422, "VALIDATION_ERROR", "Período inválido: use 24, 168 ou 720 horas.");
  if (source !== "DEVICE" && source !== "SIMULATED") return apiError(422, "VALIDATION_ERROR", "Origem inválida: DEVICE ou SIMULATED.");
  try {
    return NextResponse.json(await getColdChain({ hours, source }), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return apiError(503, "COLD_CHAIN_UNAVAILABLE", "Cadeia do frio indisponível agora. Nenhum valor foi estimado.");
  }
}
