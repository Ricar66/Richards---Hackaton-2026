import type { Prisma } from "@/generated/prisma/client";
export type AuditInput = {
  organizationId: string; entity: "TelegramSubscription" | "TelegramLink" | "HydraulicMap" | "Occurrence" | "DonationBatch" | "RecipientOrganization" | "Organization"; entityId: string;
  action: string; actor: string; metadata?: Record<string, Prisma.InputJsonValue | null>;
};
/** Monta o AuditEvent; gravar com o MESMO client de transação da mudança auditada. */
export function auditRecord(i: AuditInput): Prisma.AuditEventUncheckedCreateInput {
  return { organizationId: i.organizationId, entity: i.entity, entityId: i.entityId, action: i.action, metadata: { actor: i.actor, ...i.metadata } };
}
