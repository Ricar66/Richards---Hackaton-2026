import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { auditRecord } from "@/modules/audit/infrastructure/audit-record";
export type OpenFlowOccurrenceInput = {
  organizationId: string; siteId: string; deviceId: string;
  source: "DEVICE" | "SIMULATED"; title: string; description: string; suspectedLiters: number;
  eventNote: string; actor: string; evidence: Record<string, Prisma.InputJsonValue | null>;
};
export type OpenFlowOccurrenceResult = { created: boolean; occurrenceId: string };
/**
 * Regra inviolável 5: no máximo UMA ocorrência UNUSUAL_FLOW ativa (OPEN/ACKNOWLEDGED) por dispositivo.
 * O advisory lock serializa leituras simultâneas do mesmo dispositivo; ocorrência, timeline e auditoria
 * são gravadas na mesma transação.
 */
export async function openFlowOccurrence(input: OpenFlowOccurrenceInput): Promise<OpenFlowOccurrenceResult> {
  return getDb().$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"flow-occurrence:" + input.deviceId}))`;
    const existing = await tx.occurrence.findFirst({ where: { deviceId: input.deviceId, kind: "UNUSUAL_FLOW", status: { in: ["OPEN", "ACKNOWLEDGED"] } }, select: { id: true } });
    if (existing) return { created: false, occurrenceId: existing.id };
    const occurrence = await tx.occurrence.create({ data: {
      organizationId: input.organizationId, siteId: input.siteId, deviceId: input.deviceId,
      kind: "UNUSUAL_FLOW", source: input.source, severity: "HIGH", status: "OPEN",
      title: input.title, description: input.description, suspectedLiters: input.suspectedLiters,
      events: { create: { action: "CREATED", note: input.eventNote, actor: input.actor } },
    } });
    await tx.auditEvent.create({ data: auditRecord({
      organizationId: input.organizationId, entity: "Occurrence", entityId: occurrence.id,
      action: "CREATED", actor: input.actor, metadata: { source: input.source, ...input.evidence },
    }) });
    return { created: true, occurrenceId: occurrence.id };
  }, { maxWait: 5_000, timeout: 10_000 });
}
