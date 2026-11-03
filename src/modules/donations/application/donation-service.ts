import { getDb } from "@/lib/db";
import { DEMO_ORG_ID, DEMO_RECIPIENT_ID } from "@/lib/constants";
import { auditRecord } from "@/modules/audit/infrastructure/audit-record";
import { DonationRuleError, DonationWorkflow } from "../domain/donation-workflow";
export type DonationTransition = "AVAILABLE" | "RESERVED" | "DELIVERED" | "CANCELLED";
// Lógica movida das rotas sem mudar a regra; a escolha real da instituição receptora fica para a Fase 4.
export class DonationService {
  async create(input: { description: string; weightKg: number }, actor: string) {
    return getDb().$transaction(async tx => {
      const item = await tx.donationBatch.create({ data: { organizationId: DEMO_ORG_ID, description: input.description, weightKg: input.weightKg, status: "PENDING_REVIEW", source: "MANUAL" } });
      await tx.auditEvent.create({ data: auditRecord({ organizationId: DEMO_ORG_ID, entity: "DonationBatch", entityId: item.id, action: "CREATED", actor, metadata: { weightKg: input.weightKg } }) });
      return { id: item.id, status: item.status };
    });
  }
  async transition(id: string, next: DonationTransition, verifiedBy: string | undefined, actor: string) {
    const db = getDb();
    const old = await db.donationBatch.findFirst({ where: { id, organizationId: DEMO_ORG_ID } });
    if (!old) throw new Error("NOT_FOUND");
    const verifier = verifiedBy?.trim();
    const verified = Boolean(old.safetyVerifiedAt) || (next === "AVAILABLE" && Boolean(verifier && verifier.length >= 3));
    const recipient = Boolean(old.recipientId) || next === "RESERVED";
    DonationWorkflow.assertTransition(old.status, next, verified, recipient);
    return db.$transaction(async tx => {
      const now = new Date();
      const { count } = await tx.donationBatch.updateMany({ where: { id, organizationId: DEMO_ORG_ID, status: old.status }, data: {
        status: next,
        safetyVerifiedAt: next === "AVAILABLE" ? now : undefined,
        safetyVerifiedBy: next === "AVAILABLE" ? verifier : undefined,
        recipientId: next === "RESERVED" ? DEMO_RECIPIENT_ID : undefined,
        receivedAt: next === "DELIVERED" ? now : undefined,
      } });
      if (count === 0) throw new DonationRuleError("O lote foi alterado por outra ação. Atualize e tente novamente.");
      await tx.auditEvent.create({ data: auditRecord({ organizationId: DEMO_ORG_ID, entity: "DonationBatch", entityId: id, action: next, actor, metadata: { from: old.status, verifiedBy: next === "AVAILABLE" ? verifier ?? null : null } }) });
      return { id, status: next };
    });
  }
}
