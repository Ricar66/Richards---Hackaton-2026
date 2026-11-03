import { getDb } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
import { auditRecord } from "@/modules/audit/infrastructure/audit-record";
import { DonationRuleError, DonationWorkflow, type DonationStepDetails } from "../domain/donation-workflow";
export type DonationTransition = "AVAILABLE" | "RESERVED" | "DELIVERED" | "CANCELLED";
export type DonationTransitionInput = DonationStepDetails & { status: DonationTransition; note?: string };

export type DonationDetailDTO = {
  id: string; description: string; kg: number; status: string; source: string; createdAt: string;
  verifiedBy: string | null; verifiedAt: string | null; recipient: { id: string; name: string; city: string } | null;
  receivedBy: string | null; receivedAt: string | null; cancelReason: string | null;
  timeline: { action: string; at: string; actor: string | null; detail: string | null }[];
};

const clean = (s: string | undefined) => s?.trim() || undefined;

export class DonationService {
  async create(input: { description: string; weightKg: number }, actor: string) {
    return getDb().$transaction(async tx => {
      const item = await tx.donationBatch.create({ data: { organizationId: DEMO_ORG_ID, description: input.description, weightKg: input.weightKg, status: "PENDING_REVIEW", source: "MANUAL" } });
      await tx.auditEvent.create({ data: auditRecord({ organizationId: DEMO_ORG_ID, entity: "DonationBatch", entityId: item.id, action: "CREATED", actor, metadata: { weightKg: input.weightKg } }) });
      return { id: item.id, status: item.status };
    });
  }

  async transition(id: string, input: DonationTransitionInput, actor: string) {
    const db = getDb();
    const next = input.status;
    const details: DonationStepDetails = { verifiedBy: clean(input.verifiedBy), recipientId: clean(input.recipientId), receivedBy: clean(input.receivedBy), reason: clean(input.reason) };
    const old = await db.donationBatch.findFirst({ where: { id, organizationId: DEMO_ORG_ID } });
    if (!old) throw new Error("NOT_FOUND");
    const verified = Boolean(old.safetyVerifiedAt) || (next === "AVAILABLE" && (details.verifiedBy?.length ?? 0) >= 3);
    const recipient = next === "RESERVED" && details.recipientId ? await db.recipientOrganization.findFirst({ where: { id: details.recipientId, active: true } }) : null;
    if (next === "RESERVED" && details.recipientId && !recipient) throw new DonationRuleError("Instituição receptora inexistente ou inativa");
    DonationWorkflow.assertTransition(old.status, next, verified, Boolean(old.recipientId) || Boolean(recipient));
    DonationWorkflow.assertDetails(next, details);
    return db.$transaction(async tx => {
      const now = new Date();
      // Guarda otimista: só muda se ninguém mudou o lote desde a leitura acima.
      const { count } = await tx.donationBatch.updateMany({ where: { id, organizationId: DEMO_ORG_ID, status: old.status }, data: {
        status: next,
        safetyVerifiedAt: next === "AVAILABLE" ? now : undefined,
        safetyVerifiedBy: next === "AVAILABLE" ? details.verifiedBy : undefined,
        recipientId: next === "RESERVED" ? recipient!.id : undefined,
        receivedAt: next === "DELIVERED" ? now : undefined,
        receivedBy: next === "DELIVERED" ? details.receivedBy : undefined,
        cancelReason: next === "CANCELLED" ? details.reason : undefined,
      } });
      if (count === 0) throw new DonationRuleError("O lote foi alterado por outra ação. Atualize e tente novamente.");
      await tx.auditEvent.create({ data: auditRecord({ organizationId: DEMO_ORG_ID, entity: "DonationBatch", entityId: id, action: next, actor, metadata: {
        from: old.status,
        verifiedBy: next === "AVAILABLE" ? details.verifiedBy ?? null : null,
        recipientId: recipient?.id ?? null, recipientName: recipient?.name ?? null,
        receivedBy: next === "DELIVERED" ? details.receivedBy ?? null : null,
        reason: next === "CANCELLED" ? details.reason ?? null : null,
        note: clean(input.note) ?? null,
      } }) });
      return { id, status: next };
    });
  }

  async detail(id: string): Promise<DonationDetailDTO> {
    const db = getDb();
    const d = await db.donationBatch.findFirst({ where: { id, organizationId: DEMO_ORG_ID }, include: { recipient: true } });
    if (!d) throw new Error("NOT_FOUND");
    const audit = await db.auditEvent.findMany({ where: { organizationId: DEMO_ORG_ID, entity: "DonationBatch", entityId: id }, orderBy: { at: "asc" } });
    const text = (m: Record<string, unknown>, a: string) => {
      const s = (k: string) => (typeof m[k] === "string" ? (m[k] as string) : null);
      const parts = [a === "CREATED" && typeof m.weightKg === "number" ? `${m.weightKg} kg` : null, s("verifiedBy") && `verificado por ${s("verifiedBy")}`, s("recipientName") && `para ${s("recipientName")}`, s("receivedBy") && `recebido por ${s("receivedBy")}`, s("reason") && `motivo: ${s("reason")}`, s("note")];
      return parts.filter(Boolean).join(" · ") || null;
    };
    return {
      id: d.id, description: d.description, kg: Number(d.weightKg), status: d.status, source: d.source, createdAt: d.createdAt.toISOString(),
      verifiedBy: d.safetyVerifiedBy, verifiedAt: d.safetyVerifiedAt?.toISOString() ?? null,
      recipient: d.recipient ? { id: d.recipient.id, name: d.recipient.name, city: d.recipient.city } : null,
      receivedBy: d.receivedBy, receivedAt: d.receivedAt?.toISOString() ?? null, cancelReason: d.cancelReason,
      timeline: audit.map(a => { const m = (a.metadata ?? {}) as Record<string, unknown>; return { action: a.action, at: a.at.toISOString(), actor: typeof m.actor === "string" ? m.actor : null, detail: text(m, a.action) }; }),
    };
  }

  async recipients() {
    const rows = await getDb().recipientOrganization.findMany({ where: { active: true }, orderBy: { name: "asc" } });
    return rows.map(r => ({ id: r.id, name: r.name, city: r.city }));
  }
}
