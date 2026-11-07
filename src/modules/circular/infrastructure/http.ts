import { NextResponse } from "next/server";
import { actorFrom } from "@/lib/actor";
import { CircularError } from "../domain/contracts";
export function circularActor(req: Request) {
  if (process.env.CIRCULAR_ENABLED !== "true") throw new CircularError("Circular aguarda ativação e migração em ambiente de revisão", 503);
  const actor = actorFrom(req);
  if (!actor.startsWith("operador:")) throw new CircularError("Operador autenticado obrigatório", 403);
  return actor;
}
export async function readJson(req: Request, max = 16000): Promise<unknown> {
  const reader = req.body?.getReader(); if (!reader) throw new CircularError("JSON inválido", 400);
  let size = 0; const chunks: Uint8Array[] = [];
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > max) { await reader.cancel(); throw new CircularError("Corpo excede o limite", 413); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new CircularError("JSON inválido", 400); }
}
export function circularFailure(error: unknown) {
  if (error instanceof CircularError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  console.error("Circular: operação indisponível", error instanceof Error ? error.name : "UNKNOWN");
  return NextResponse.json({ error: "Circular indisponível. Verifique conexão e migração; nenhum resultado foi inventado." }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
