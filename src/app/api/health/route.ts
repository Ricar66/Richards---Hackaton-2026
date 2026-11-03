import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Saúde real: a aplicação só está saudável se o PostgreSQL responde. Rota pública: não expor detalhes do erro. */
export async function GET() {
  const at = new Date().toISOString();
  try {
    await Promise.race([
      getDb().$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3_000)),
    ]);
    return NextResponse.json({ service: "richards", healthy: true, database: "up", at }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ service: "richards", healthy: false, database: "down", at }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
