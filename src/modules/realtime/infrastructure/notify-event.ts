import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { LIVE_CHANNEL, encodeLiveEvent, stampLiveEvent, type LiveEventInput } from "../domain/live-event";

/** Cliente do Prisma ou transação interativa: só precisa do `$executeRaw`. */
export type LiveNotifier = Pick<Prisma.TransactionClient, "$executeRaw">;

/**
 * Publica um fato no canal ao vivo pelo `pg_notify`. Dentro de uma transação (`tx`), o PostgreSQL só entrega
 * o aviso no COMMIT e o descarta no ROLLBACK: o telão nunca mostra o que não ficou gravado.
 * Falha aqui faz parte da transação (aborta junto); para aviso fora de transação use `notifyLiveSafe`.
 */
export async function notifyLive(client: LiveNotifier, input: LiveEventInput, now = new Date()): Promise<void> {
  await client.$executeRaw`SELECT pg_notify(${LIVE_CHANNEL}, ${encodeLiveEvent(stampLiveEvent(input, now))})`;
}

/** Best-effort e fora de transação: nunca derruba a ingestão (o fato já está gravado; a tela recupera pelo snapshot). */
export async function notifyLiveSafe(input: LiveEventInput, now = new Date()): Promise<void> {
  try { await notifyLive(getDb(), input, now); }
  catch (error) { console.warn(`[live] aviso ${input.type} não enviado: ${error instanceof Error ? error.message : String(error)}`); }
}
