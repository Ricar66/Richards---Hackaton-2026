import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
import { auditRecord } from "@/modules/audit/infrastructure/audit-record";
import { notifyLive } from "@/modules/realtime/infrastructure/notify-event";
import { DonationRuleError, DonationWorkflow, type DonationStepDetails } from "../domain/donation-workflow";
import { passportWindow, tempSourceFor } from "../domain/passport";
import { newPassportToken } from "../infrastructure/passport-token";
import { coldEvidence, type ColdEvidence } from "@/modules/cold-chain/application/cold-chain-service";
import { KIND_LABEL, equipmentRange, rangeText, type ColdKind } from "@/modules/cold-chain/domain/cold-chain";
export type DonationTransition = "AVAILABLE" | "RESERVED" | "DELIVERED" | "CANCELLED";
export type DonationTransitionInput = DonationStepDetails & { status: DonationTransition; note?: string };

export type DonationDetailDTO = {
  id: string; description: string; kg: number; status: string; source: string; createdAt: string;
  verifiedBy: string | null; verifiedAt: string | null; recipient: { id: string; name: string; city: string } | null;
  receivedBy: string | null; receivedAt: string | null; cancelReason: string | null;
  /** Token do Passaporte do Alimento (null: lote antigo, ainda sem passaporte emitido). */
  passportToken: string | null;
  originEquipment: { id: string; label: string; kindLabel: string } | null;
  timeline: { action: string; at: string; actor: string | null; detail: string | null }[];
};

const clean = (s: string | undefined) => s?.trim() || undefined;

export class DonationService {
  async create(input: { description: string; weightKg: number }, actor: string) {
    return getDb().$transaction(async tx => {
      const item = await tx.donationBatch.create({ data: { organizationId: DEMO_ORG_ID, description: input.description, weightKg: input.weightKg, status: "PENDING_REVIEW", source: "MANUAL", passportToken: newPassportToken() } });
      await tx.auditEvent.create({ data: auditRecord({ organizationId: DEMO_ORG_ID, entity: "DonationBatch", entityId: item.id, action: "CREATED", actor, metadata: { weightKg: input.weightKg } }) });
      await notifyLive(tx, { type: "donation.created", orgId: DEMO_ORG_ID, id: item.id, kg: Number(item.weightKg), status: "PENDING_REVIEW", source: "MANUAL", origin: "manual", description: item.description });
      return { id: item.id, status: item.status };
    });
  }

  /**
   * Lote pesado pela balança da bancada. Entra SEMPRE em PENDING_REVIEW (regra 6: só fica disponível com
   * verificação humana documentada). No máximo UM lote da mesma balança E da mesma origem aguarda verificação por vez:
   * leitura repetida ou ponte reiniciada com o peso ainda na balança não duplica kg, e um lote SIMULATED pendente
   * nunca impede a balança real (nem o contrário).
   */
  async createFromScale(input: {
    organizationId: string; deviceId: string; deviceCode: string; weightKg: number; source: "DEVICE" | "SIMULATED";
    evidence: Record<string, Prisma.InputJsonValue | null>;
  }, actor: string): Promise<{ created: boolean; id: string }> {
    return getDb().$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`scale-donation:${input.deviceId}:${input.source}`}))`;
      // O lote não tem coluna de dispositivo: a autoria fica na auditoria de criação.
      const mine = await tx.auditEvent.findMany({ where: { organizationId: input.organizationId, entity: "DonationBatch", action: "CREATED", metadata: { path: ["deviceCode"], equals: input.deviceCode } }, select: { entityId: true } });
      const pending = mine.length ? await tx.donationBatch.findFirst({ where: { id: { in: mine.map(m => m.entityId) }, status: "PENDING_REVIEW", source: input.source }, select: { id: true } }) : null;
      if (pending) return { created: false, id: pending.id };
      const item = await tx.donationBatch.create({ data: {
        organizationId: input.organizationId, description: `Excedente pesado na balança · ${input.deviceCode}`,
        weightKg: input.weightKg, status: "PENDING_REVIEW", source: input.source, passportToken: newPassportToken(),
      } });
      await tx.auditEvent.create({ data: auditRecord({ organizationId: input.organizationId, entity: "DonationBatch", entityId: item.id, action: "CREATED", actor, metadata: {
        weightKg: input.weightKg, deviceCode: input.deviceCode, source: input.source, ...input.evidence,
      } }) });
      await notifyLive(tx, { type: "donation.created", orgId: input.organizationId, id: item.id, kg: Number(item.weightKg), status: "PENDING_REVIEW", source: input.source, origin: "scale", deviceCode: input.deviceCode, description: item.description });
      return { created: true, id: item.id };
    }, { maxWait: 5_000, timeout: 10_000 });
  }

  async transition(id: string, input: DonationTransitionInput, actor: string) {
    const db = getDb();
    const next = input.status;
    const details: DonationStepDetails = {
      verifiedBy: clean(input.verifiedBy), recipientId: clean(input.recipientId),
      receivedBy: clean(input.receivedBy), reason: clean(input.reason),
      foodOrigin: input.foodOrigin, reviewerQualification: clean(input.reviewerQualification),
      inspectionOk: input.inspectionOk, conservationOk: input.conservationOk,
      validityOk: input.validityOk, transportOk: input.transportOk,
      originEquipmentId: input.originEquipmentId === null ? null : clean(input.originEquipmentId),
    };
    const old = await db.donationBatch.findFirst({ where: { id, organizationId: DEMO_ORG_ID }, include: { recipient: { select: { name: true } } } });
    if (!old) throw new Error("NOT_FOUND");
    const verified = Boolean(old.safetyVerifiedAt) || (next === "AVAILABLE" && (details.verifiedBy?.length ?? 0) >= 3);
    const recipient = next === "RESERVED" && details.recipientId ? await db.recipientOrganization.findFirst({ where: { id: details.recipientId, active: true } }) : null;
    if (next === "RESERVED" && details.recipientId && !recipient) throw new DonationRuleError("Instituição receptora inexistente ou inativa");
    DonationWorkflow.assertTransition(old.status, next, verified, Boolean(old.recipientId) || Boolean(recipient));
    DonationWorkflow.assertDetails(next, details);
    // Equipamento de origem declarado na triagem: precisa existir, estar ativo e ser da mesma organização. O que o
    // responsável viu (temperatura do equipamento desde 24 h antes da pesagem) vai para a auditoria, calculado aqui.
    let evidence: ColdEvidence | null = null;
    if (next === "AVAILABLE" && details.originEquipmentId) {
      const w = passportWindow(old.createdAt, null, new Date());
      evidence = await coldEvidence(details.originEquipmentId, { source: tempSourceFor(old.source), from: w.from, to: w.to, orgId: DEMO_ORG_ID, activeOnly: true, points: 2 });
      if (!evidence) throw new DonationRuleError("Equipamento de origem inexistente ou inativo");
    }
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
        originEquipmentId: next === "AVAILABLE" && details.originEquipmentId !== undefined ? details.originEquipmentId : undefined,
      } });
      if (count === 0) throw new DonationRuleError("O lote foi alterado por outra ação. Atualize e tente novamente.");
      await tx.auditEvent.create({ data: auditRecord({ organizationId: DEMO_ORG_ID, entity: "DonationBatch", entityId: id, action: next, actor, metadata: {
        from: old.status,
        verifiedBy: next === "AVAILABLE" ? details.verifiedBy ?? null : null,
        ...(next === "AVAILABLE" ? { foodOrigin: details.foodOrigin ?? null,
          reviewerQualification: details.reviewerQualification ?? null,
          sanitaryChecklist: { inspectionOk: details.inspectionOk === true, conservationOk: details.conservationOk === true,
            validityOk: details.validityOk === true, transportOk: details.transportOk === true },
          // undefined = não declarado (cliente antigo da API); null = declarado "fora de equipamento monitorado".
          originDeclared: details.originEquipmentId !== undefined,
          originEquipmentId: details.originEquipmentId ?? null,
          coldEvidence: evidence ? {
            equipment: evidence.equipment.label, source: evidence.source, from: evidence.from, to: evidence.to,
            samples: evidence.summary.samples, inRangePct: evidence.summary.inRangePct, coveragePct: evidence.summary.coveragePct,
            excursionCount: evidence.summary.excursionCount, minC: evidence.summary.minC, maxC: evidence.summary.maxC,
          } : null } : {}),
        recipientId: recipient?.id ?? null, recipientName: recipient?.name ?? null,
        receivedBy: next === "DELIVERED" ? details.receivedBy ?? null : null,
        reason: next === "CANCELLED" ? details.reason ?? null : null,
        note: clean(input.note) ?? null,
      } }) });
      // Telão público: só o nome da instituição viaja; quem recebeu (pessoa) fica no banco e na auditoria.
      const recipientName = next === "RESERVED" || next === "DELIVERED" ? recipient?.name ?? old.recipient?.name : undefined;
      // A origem do lote viaja junto: lote SIMULATED continua carimbado no telão em cada passo (regra 1).
      await notifyLive(tx, { type: "donation.status", orgId: DEMO_ORG_ID, id, kg: Number(old.weightKg), from: old.status, status: next, source: old.source, ...(recipientName ? { recipientName } : {}) });
      return { id, status: next };
    });
  }

  async detail(id: string): Promise<DonationDetailDTO> {
    const db = getDb();
    const d = await db.donationBatch.findFirst({ where: { id, organizationId: DEMO_ORG_ID }, include: { recipient: true, originEquipment: { select: { id: true, label: true, kind: true } } } });
    if (!d) throw new Error("NOT_FOUND");
    const audit = await db.auditEvent.findMany({ where: { organizationId: DEMO_ORG_ID, entity: "DonationBatch", entityId: id }, orderBy: { at: "asc" } });
    const text = (m: Record<string, unknown>, a: string) => {
      const s = (k: string) => (typeof m[k] === "string" ? (m[k] as string) : null);
      const ce = m.coldEvidence && typeof m.coldEvidence === "object" ? m.coldEvidence as Record<string, unknown> : null;
      const cold = ce && typeof ce.equipment === "string" ? `equipamento: ${ce.equipment}${typeof ce.inRangePct === "number" ? ` (${ce.inRangePct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% na faixa)` : " (sem leitura)"}` : null;
      const parts = [a === "CREATED" && typeof m.weightKg === "number" ? `${m.weightKg} kg` : null, cold, s("verifiedBy") && `verificado por ${s("verifiedBy")}`, s("reviewerQualification") && `cargo/habilitação: ${s("reviewerQualification")}`, s("foodOrigin") && `origem: ${s("foodOrigin")}`, s("recipientName") && `para ${s("recipientName")}`, s("receivedBy") && `recebido por ${s("receivedBy")}`, s("reason") && `motivo: ${s("reason")}`, s("note")];
      return parts.filter(Boolean).join(" · ") || null;
    };
    return {
      id: d.id, description: d.description, kg: Number(d.weightKg), status: d.status, source: d.source, createdAt: d.createdAt.toISOString(),
      verifiedBy: d.safetyVerifiedBy, verifiedAt: d.safetyVerifiedAt?.toISOString() ?? null,
      recipient: d.recipient ? { id: d.recipient.id, name: d.recipient.name, city: d.recipient.city } : null,
      receivedBy: d.receivedBy, receivedAt: d.receivedAt?.toISOString() ?? null, cancelReason: d.cancelReason,
      passportToken: d.passportToken,
      originEquipment: d.originEquipment ? { id: d.originEquipment.id, label: d.originEquipment.label, kindLabel: KIND_LABEL[d.originEquipment.kind as ColdKind] } : null,
      timeline: audit.map(a => { const m = (a.metadata ?? {}) as Record<string, unknown>; return { action: a.action, at: a.at.toISOString(), actor: typeof m.actor === "string" ? m.actor : null, detail: text(m, a.action) }; }),
    };
  }

  /**
   * Emite o Passaporte do Alimento de um lote antigo (criado antes de 08/11, sem token). Idempotente: lote que já tem
   * passaporte devolve o mesmo token. Auditado.
   */
  async issuePassport(id: string, actor: string): Promise<{ token: string; created: boolean }> {
    return getDb().$transaction(async tx => {
      const lot = await tx.donationBatch.findFirst({ where: { id, organizationId: DEMO_ORG_ID }, select: { passportToken: true } });
      if (!lot) throw new Error("NOT_FOUND");
      if (lot.passportToken) return { token: lot.passportToken, created: false };
      const token = newPassportToken();
      const { count } = await tx.donationBatch.updateMany({ where: { id, organizationId: DEMO_ORG_ID, passportToken: null }, data: { passportToken: token } });
      if (count === 0) {
        const again = await tx.donationBatch.findFirst({ where: { id }, select: { passportToken: true } });
        return { token: again!.passportToken!, created: false };
      }
      await tx.auditEvent.create({ data: auditRecord({ organizationId: DEMO_ORG_ID, entity: "DonationBatch", entityId: id, action: "PASSPORT_ISSUED", actor }) });
      return { token, created: true };
    });
  }

  /** Prévia da evidência na triagem: temperatura do equipamento desde 24 h antes da pesagem até agora, na origem do lote. */
  async triageEvidence(id: string, equipmentId: string): Promise<ColdEvidence> {
    const lot = await getDb().donationBatch.findFirst({ where: { id, organizationId: DEMO_ORG_ID }, select: { createdAt: true, source: true } });
    if (!lot) throw new Error("NOT_FOUND");
    const w = passportWindow(lot.createdAt, null, new Date());
    const ev = await coldEvidence(equipmentId, { source: tempSourceFor(lot.source), from: w.from, to: w.to, orgId: DEMO_ORG_ID, activeOnly: true, points: 60 });
    if (!ev) throw new DonationRuleError("Equipamento de origem inexistente ou inativo");
    return ev;
  }

  /** Equipamentos ativos que podem ser declarados como origem do alimento. */
  async originEquipments() {
    const rows = await getDb().coldEquipment.findMany({ where: { organizationId: DEMO_ORG_ID, active: true }, include: { site: { select: { name: true } } }, orderBy: [{ siteId: "asc" }, { label: "asc" }] });
    return rows.map(e => ({ id: e.id, label: e.label, kindLabel: KIND_LABEL[e.kind as ColdKind], siteName: e.site.name, rangeText: rangeText(equipmentRange(e.kind as ColdKind, e)) }));
  }

  async recipients() {
    const rows = await getDb().recipientOrganization.findMany({ where: { active: true }, orderBy: { name: "asc" } });
    return rows.map(r => ({ id: r.id, name: r.name, city: r.city }));
  }
}
