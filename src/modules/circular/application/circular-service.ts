import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
import type { Prisma, CircularBatch } from "@/generated/prisma/client";
import { auditRecord } from "@/modules/audit/infrastructure/audit-record";
import { notifyLive } from "@/modules/realtime/infrastructure/notify-event";
import { CircularError, grams, pastDate, requireMass, type ActionInput, type BatchInput, type EvidenceInput, type PartnerInput } from "../domain/contracts";
import { decodeEvidence } from "../infrastructure/evidence-file";

const hash = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
const ORG = DEMO_ORG_ID;
const RESIDUE = ["RESIDUE", "SCHEDULED", "COLLECTED", "RECEIVED", "EVIDENCED"] as const;
const EVIDENCE_SELECT = { id: true, kind: true, weightKg: true, eventAt: true, documentReference: true, reviewedBy: true, mime: true, fileSize: true, sha256: true, createdAt: true } as const;
const batchSelect = { id: true, description: true, weightKg: true, origin: true, material: true, reason: true, source: true, occurredAt: true, createdAt: true, status: true, version: true,
  reviewedBy: true, reviewNote: true, reviewedAt: true, method: true, scheduledAt: true, collectedKg: true, receivedKg: true, confirmedKg: true, firstCollectedAt: true, firstReceivedAt: true, donationBatchId: true, cancelReason: true,
  site: { select: { id: true, name: true } }, partnerSnapshot: true,
} as const;
type Row = Prisma.CircularBatchGetPayload<{ select: typeof batchSelect }>;
const dto = (row: Row) => ({ ...row, weightKg: Number(row.weightKg), collectedKg: Number(row.collectedKg), receivedKg: Number(row.receivedKg), confirmedKg: Number(row.confirmedKg), occurredAt: row.occurredAt.toISOString(), createdAt: row.createdAt.toISOString(), reviewedAt: row.reviewedAt?.toISOString() ?? null, scheduledAt: row.scheduledAt?.toISOString() ?? null, firstCollectedAt: row.firstCollectedAt?.toISOString() ?? null, firstReceivedAt: row.firstReceivedAt?.toISOString() ?? null });
export type CircularBatchDTO = ReturnType<typeof dto>;
export class CircularService {
  async create(input: BatchInput, actor: string) {
    pastDate(input.occurredAt, new Date());
    const fingerprint = hash(input);
    return getDb().$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`circular:${ORG}:${input.requestKey}`}))`;
      const existing = await tx.circularBatch.findUnique({ where: { organizationId_requestKey: { organizationId: ORG, requestKey: input.requestKey } } });
      if (existing) { if (existing.requestHash !== fingerprint) throw new CircularError("Chave de cadastro já utilizada com outros dados"); return { id: existing.id }; }
      if (!await tx.site.findFirst({ where: { id: input.siteId, organizationId: ORG } })) throw new CircularError("Unidade inválida", 422);
      const row = await tx.circularBatch.create({ data: { ...input, occurredAt: new Date(input.occurredAt), organizationId: ORG, requestHash: fingerprint } });
      await tx.auditEvent.create({ data: auditRecord({ organizationId: ORG, entity: "CircularBatch", entityId: row.id, action: "REGISTERED", actor, metadata: { weightKg: input.weightKg, source: input.source, origin: input.origin } }) });
      return { id: row.id };
    });
  }
  async createPartner(input: PartnerInput, actor: string) {
    const now = new Date(), expires = new Date(input.reviewExpiresAt);
    if (expires <= now || expires.getTime() > now.getTime() + 366 * 86400000) throw new CircularError("A revisão cadastral deve vencer nos próximos 366 dias", 422);
    return getDb().$transaction(async tx => {
      const { attested: _attested, ...fields } = input; void _attested;
      const row = await tx.circularPartner.create({ data: { ...fields, methods: [...new Set(input.methods)], materials: [...new Set(input.materials)], reviewExpiresAt: expires, organizationId: ORG } });
      await tx.auditEvent.create({ data: auditRecord({ organizationId: ORG, entity: "CircularPartner", entityId: row.id, action: "REGISTERED", actor, metadata: { source: row.source, reviewedBy: row.reviewedBy, authorizationReference: row.authorizationReference } }) });
      return { id: row.id };
    });
  }
  async deactivatePartner(id: string, actor: string) {
    return getDb().$transaction(async tx => {
      if (!(await tx.circularPartner.updateMany({ where: { id, organizationId: ORG, active: true }, data: { active: false } })).count) throw new CircularError("Operador inexistente ou já inativo", 404);
      await tx.auditEvent.create({ data: auditRecord({ organizationId: ORG, entity: "CircularPartner", entityId: id, action: "DEACTIVATED", actor }) });
      return { id };
    });
  }
  async reviewPartner(id: string, input: PartnerInput, actor: string) {
    const now = new Date(), expires = new Date(input.reviewExpiresAt);
    if (expires <= now || expires.getTime() > now.getTime() + 366 * 86400000) throw new CircularError("Prazo de conferência inválido",422);
    return getDb().$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "CircularPartner" WHERE id=${id} AND "organizationId"=${ORG} FOR UPDATE`;
      const previous = await tx.circularPartner.findFirst({ where: { id, organizationId: ORG, source: input.source } });
      if (!previous) throw new CircularError("Operador não encontrado nesta origem",404);
      const { attested: _attested, source: _source, ...fields } = input; void _attested; void _source;
      await tx.circularPartner.update({ where: { id }, data: { ...fields, methods: [...new Set(input.methods)], materials: [...new Set(input.materials)], reviewExpiresAt: expires, reviewedAt: now, active: true } });
      await tx.auditEvent.create({ data: auditRecord({ organizationId: ORG, entity: "CircularPartner", entityId: id, action: "REVIEWED", actor, metadata: { previousAuthorizationReference: previous.authorizationReference, previousExpiresAt: previous.reviewExpiresAt.toISOString(), ...input } }) });
      return { id };
    });
  }
  private async locked(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM "CircularBatch" WHERE id=${id} AND "organizationId"=${ORG} FOR UPDATE`;
    const row = await tx.circularBatch.findFirst({ where: { id, organizationId: ORG } });
    if (!row) throw new CircularError("Lote não encontrado", 404);
    return row;
  }
  private async compatible(tx: Prisma.TransactionClient, row: CircularBatch, partnerId: string, method: NonNullable<CircularBatch["method"]>) {
    await tx.$queryRaw`SELECT id FROM "CircularPartner" WHERE id=${partnerId} AND "organizationId"=${ORG} FOR UPDATE`;
    const p = await tx.circularPartner.findFirst({ where: { id: partnerId, organizationId: ORG, source: row.source, active: true } });
    if (!p || p.reviewExpiresAt <= new Date() || !p.methods.includes(method) || row.material === "UNKNOWN" || !p.materials.includes(row.material)) throw new CircularError("Operador sem conferência vigente ou incompatível com material, método ou origem dos dados");
    return p;
  }
  async action(id: string, input: ActionInput, actor: string) {
    return getDb().$transaction(async tx => {
      const row = await this.locked(tx, id);
      if (input.action === "COLLECT") {
        const previous = await tx.auditEvent.findFirst({ where: { organizationId: ORG, entity: "CircularBatch", entityId: id, action: "COLLECTED", metadata: { path: ["requestKey"], equals: input.requestKey } } });
        if (previous) { if ((previous.metadata as Record<string, unknown>)?.requestHash !== hash(input)) throw new CircularError("Chave de coleta já usada com outros dados"); return { id }; }
      }
      if (row.version !== input.version) throw new CircularError("Lote alterado por outra operação. Atualize os dados");
      const data: Prisma.CircularBatchUncheckedUpdateInput = { version: { increment: 1 } };
      let auditAction: string = input.action;
      if (input.action === "TRIAGE") {
        if (row.status !== "REGISTERED") throw new CircularError("Este lote já passou por triagem");
        data.reviewedBy = input.reviewedBy; data.reviewNote = input.note; data.reviewedAt = new Date(); data.origin = input.origin; data.material = input.material;
        if (input.decision === "DONATION") {
          if (!["PREPARATION", "KITCHEN_UNSERVED"].includes(input.origin)) throw new CircularError("Esta origem permanece bloqueada para encaminhamento à doação neste MVP");
          const donation = await tx.donationBatch.create({ data: { organizationId: ORG, description: `Circular · ${row.description}`.slice(0,180), weightKg: row.weightKg, status: "PENDING_REVIEW", source: row.source } });
          data.status = "DONATION_REFERRED"; data.donationBatchId = donation.id;
          await tx.auditEvent.create({ data: auditRecord({ organizationId: ORG, entity: "DonationBatch", entityId: donation.id, action: "CREATED", actor, metadata: { circularBatchId: id, weightKg: Number(row.weightKg), source: row.source } }) });
          await notifyLive(tx, { type: "donation.created", orgId: ORG, id: donation.id, kg: Number(row.weightKg), status: "PENDING_REVIEW", source: row.source, origin: "manual", description: donation.description });
        } else { if (input.material === "UNKNOWN") throw new CircularError("Classifique o material antes de marcar como resíduo"); data.status = "RESIDUE"; }
      } else if (input.action === "SCHEDULE") {
        if (!["RESIDUE", "SCHEDULED"].includes(row.status)) throw new CircularError("Triagem de resíduo obrigatória; após coleta a destinação não pode ser trocada");
        const partner = await this.compatible(tx, row, input.partnerId, input.method);
        const date = new Date(input.scheduledAt);
        if (date < row.occurredAt || date.getTime() > Date.now() + 180 * 86400000) throw new CircularError("Data planejada incompatível com o lote");
        data.status = "SCHEDULED"; data.partnerId = partner.id; data.method = input.method; data.scheduledAt = date;
        data.partnerSnapshot = { name: partner.name, city: partner.city, authorizationReference: partner.authorizationReference, reviewedBy: partner.reviewedBy, reviewExpiresAt: partner.reviewExpiresAt.toISOString(), reason: input.reason };
      } else if (input.action === "COLLECT") {
        if (!["SCHEDULED", "COLLECTED", "RECEIVED", "EVIDENCED"].includes(row.status) || !row.partnerId || !row.method) throw new CircularError("Defina a destinação antes de registrar coleta");
        await this.compatible(tx, row, row.partnerId, row.method);
        const at = pastDate(input.eventAt, new Date(), row.occurredAt);
        requireMass(grams(row.weightKg) - grams(row.collectedKg), grams(input.weightKg));
        data.collectedKg = (grams(row.collectedKg) + grams(input.weightKg)) / 1000;
        data.firstCollectedAt = !row.firstCollectedAt || at < row.firstCollectedAt ? at : row.firstCollectedAt;
        if (row.status === "SCHEDULED") data.status = "COLLECTED";
        auditAction = "COLLECTED";
      } else {
        if (!["REGISTERED", "RESIDUE", "SCHEDULED"].includes(row.status)) throw new CircularError("Lote com movimentação ou encaminhado à doação não pode ser cancelado aqui");
        data.status = "CANCELLED"; data.cancelReason = input.reason;
      }
      await tx.circularBatch.update({ where: { id }, data });
      await tx.auditEvent.create({ data: auditRecord({ organizationId: ORG, entity: "CircularBatch", entityId: id, action: auditAction, actor, metadata: { ...input, ...(input.action === "COLLECT" ? { requestHash: hash(input) } : {}) } }) });
      return { id };
    }, { timeout: 10000 });
  }
  async addEvidence(id: string, input: EvidenceInput, actor: string) {
    const file = decodeEvidence(input.file);
    const fingerprint = hash({ ...input, file: { mime: input.file.mime, sha256: file.sha256 } });
    return getDb().$transaction(async tx => {
      const row = await this.locked(tx, id);
      const previous = await tx.circularEvidence.findUnique({ where: { batchId_requestKey: { batchId: id, requestKey: input.requestKey } } });
      if (previous) { if (previous.requestHash !== fingerprint) throw new CircularError("Chave documental já usada com outros dados"); return { id: previous.id }; }
      if (row.version !== input.version) throw new CircularError("Lote alterado. Atualize antes de comprovar");
      if (!RESIDUE.includes(row.status as typeof RESIDUE[number]) || !row.method || !row.firstCollectedAt) throw new CircularError("Coleta registrada obrigatória antes do comprovante");
      if (await tx.circularEvidence.findFirst({ where: { batchId: id, kind: input.kind, sha256: file.sha256 } })) throw new CircularError("Este arquivo já foi contabilizado nesta etapa do lote");
      const receipt = input.kind === "RECEIPT";
      if (!receipt && (row.method === "DISPOSAL" ? input.kind !== "DISPOSAL" : input.kind !== "TREATMENT")) throw new CircularError("Tipo documental incompatível com a destinação");
      if (!receipt && !row.firstReceivedAt) throw new CircularError("Comprove o recebimento antes da destinação");
      const at = pastDate(input.eventAt, new Date(), receipt ? row.firstCollectedAt : row.firstReceivedAt);
      requireMass(receipt ? grams(row.collectedKg) - grams(row.receivedKg) : grams(row.receivedKg) - grams(row.confirmedKg), grams(input.weightKg));
      const evidence = await tx.circularEvidence.create({ data: { batchId: id, requestKey: input.requestKey, requestHash: fingerprint, kind: input.kind, weightKg: input.weightKg, eventAt: at, documentReference: input.documentReference, reviewedBy: input.reviewedBy, mime: input.file.mime, fileSize: file.bytes.length, sha256: file.sha256, content: file.bytes } });
      await tx.circularBatch.update({ where: { id }, data: receipt ? { receivedKg: (grams(row.receivedKg) + grams(input.weightKg)) / 1000, firstReceivedAt: !row.firstReceivedAt || at < row.firstReceivedAt ? at : row.firstReceivedAt, status: row.status === "EVIDENCED" ? "EVIDENCED" : "RECEIVED", version: { increment: 1 } }
        : { confirmedKg: (grams(row.confirmedKg) + grams(input.weightKg)) / 1000, status: "EVIDENCED", version: { increment: 1 } } });
      await tx.auditEvent.create({ data: auditRecord({ organizationId: ORG, entity: "CircularBatch", entityId: id, action: receipt ? "RECEIPT_EVIDENCED" : "DESTINATION_EVIDENCED", actor, metadata: { evidenceId: evidence.id, kind: input.kind, weightKg: input.weightKg, sha256: file.sha256, reviewedBy: input.reviewedBy } }) });
      return { id: evidence.id };
    }, { timeout: 10000 });
  }
  async detail(id: string) {
    const row = await getDb().circularBatch.findFirst({ where: { id, organizationId: ORG }, select: { ...batchSelect, evidence: { select: EVIDENCE_SELECT, orderBy: { createdAt: "asc" } } } });
    if (!row) throw new CircularError("Lote não encontrado", 404);
    const timeline = await getDb().auditEvent.findMany({ where: { organizationId: ORG, entity: "CircularBatch", entityId: id }, orderBy: { at: "asc" }, take: 300, select: { id: true, action: true, at: true, metadata: true } });
    return { ...dto(row), evidence: row.evidence.map(e => ({ ...e, weightKg: Number(e.weightKg), eventAt: e.eventAt.toISOString(), createdAt: e.createdAt.toISOString() })), timeline: timeline.map(e => ({ ...e, at: e.at.toISOString() })) };
  }
  async evidenceFile(id: string) {
    const row = await getDb().circularEvidence.findFirst({ where: { id, batch: { organizationId: ORG } }, select: { id: true, mime: true, content: true, sha256: true } });
    if (!row) throw new CircularError("Documento não encontrado", 404);
    return row;
  }
  async snapshot(source: "MANUAL" | "SIMULATED", range: "24h" | "7d" | "30d") {
    const now = new Date(), from = new Date(now.getTime() - ({ "24h": 1, "7d": 7, "30d": 30 }[range]) * 86400000);
    const where = { organizationId: ORG, source, createdAt: { gte: from, lte: now } };
    const db = getDb();
    const [rows, count, grouped, partners, sites, triage, donations] = await Promise.all([
      db.circularBatch.findMany({ where, select: batchSelect, orderBy: { createdAt: "desc" }, take: 100 }), db.circularBatch.count({ where }),
      db.circularBatch.groupBy({ by: ["method"], where: { ...where, status: { in: [...RESIDUE] } }, _sum: { weightKg: true, collectedKg: true, receivedKg: true, confirmedKg: true } }),
      db.circularPartner.findMany({ where: { organizationId: ORG, source }, orderBy: { reviewedAt: "desc" }, take: 100 }),
      db.site.findMany({ where: { organizationId: ORG }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      db.circularBatch.count({ where: { ...where, status: "REGISTERED" } }), db.circularBatch.count({ where: { ...where, status: "DONATION_REFERRED" } }),
    ]);
    const sum = (field: "weightKg" | "collectedKg" | "receivedKg" | "confirmedKg") => grouped.reduce((n, g) => n + grams(g._sum[field] ?? 0), 0) / 1000;
    const residueKg = sum("weightKg"), confirmed = sum("confirmedKg");
    return { generatedAt: now.toISOString(), filter: { source, range, from: from.toISOString(), to: now.toISOString(), basis: "Lotes cadastrados no período; massas acumuladas desses lotes" }, count, limit: 100,
      kpis: { residueKg, collectedKg: sum("collectedKg"), receivedKg: sum("receivedKg"), organicConfirmedKg: grouped.filter(g => g.method !== "DISPOSAL").reduce((n,g) => n + grams(g._sum.confirmedKg ?? 0),0) / 1000,
        disposalConfirmedKg: grouped.filter(g => g.method === "DISPOSAL").reduce((n,g) => n + grams(g._sum.confirmedKg ?? 0),0) / 1000, unprovenKg: Math.max(0, Math.round((residueKg - confirmed) * 1000) / 1000), awaitingTriage: triage, donationCandidates: donations },
      batches: rows.map(dto), partners: partners.map(p => ({ ...p, reviewedAt: p.reviewedAt.toISOString(), reviewExpiresAt: p.reviewExpiresAt.toISOString() })), sites };
  }
}
export type CircularSnapshot = Awaited<ReturnType<CircularService["snapshot"]>>;
export type CircularDetail = Awaited<ReturnType<CircularService["detail"]>>;
