import { getDb } from "@/lib/db";
import { coldEvidence, type ColdPoint } from "@/modules/cold-chain/application/cold-chain-service";
import type { TempRange } from "@/modules/cold-chain/domain/cold-chain";
import { FOOD_ORIGIN_LABEL, FOOD_ORIGINS, SANITARY_CHECKS, type DonationState, type FoodOrigin } from "../domain/donation-workflow";
import {
  isPassportToken, PASSPORT_VERDICT, passportCode, passportStamps, passportWindow, publicName, tempSourceFor,
  type Stamp, type VerdictTone,
} from "../domain/passport";

/**
 * O que a página pública do lote mostra. Montado campo a campo (nunca o registro do banco inteiro):
 * - SAI: peso, descrição, loja, carimbos com data, temperatura do equipamento de origem, cargo/habilitação declarado,
 *   primeiro nome + inicial de quem atestou, checklist declarado e o nome da instituição.
 * - NÃO SAI: quem recebeu na instituição, notas, motivo do cancelamento, operador/autor, nome completo, ids internos.
 */
export type PublicPassport = {
  code: string;
  source: "DEVICE" | "SIMULATED" | "MANUAL";
  store: { name: string; demo: boolean };
  description: string;
  kg: number;
  status: DonationState;
  verdict: { tone: VerdictTone; title: string; text: string };
  stamps: Stamp[];
  cancelledAt: string | null;
  weighedByScale: boolean;
  triage: { at: string; by: string | null; qualification: string | null; foodOrigin: string | null; checklist: string[] } | null;
  /** A triagem declarou de onde saiu o alimento (equipamento ou "fora de equipamento monitorado"). */
  originDeclared: boolean;
  cold: {
    equipment: { label: string; kindLabel: string; siteName: string; rangeText: string; reference: string; range: TempRange };
    source: "DEVICE" | "SIMULATED"; from: string; to: string; capped: boolean; open: boolean;
    summary: { samples: number; inRangePct: number | null; coveragePct: number; excursionCount: number; outRangeMinutes: number; minC: number | null; maxC: number | null;
      longest: { start: string; minutes: number; peakC: number; ongoing: boolean } | null };
    series: Pick<ColdPoint, "t" | "c" | "max">[];
  } | null;
  recipient: { name: string; city: string } | null;
  generatedAt: string;
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** null = token em formato inválido ou inexistente (a página responde 404, sem dizer qual dos dois). */
export async function getPublicPassport(token: string, now = new Date()): Promise<PublicPassport | null> {
  if (!isPassportToken(token)) return null;
  const db = getDb();
  const lot = await db.donationBatch.findUnique({
    where: { passportToken: token },
    include: { organization: { select: { name: true, isDemo: true } }, recipient: { select: { name: true, city: true } } },
  });
  if (!lot) return null;
  const audit = await db.auditEvent.findMany({
    where: { organizationId: lot.organizationId, entity: "DonationBatch", entityId: lot.id, action: { in: ["CREATED", "AVAILABLE", "RESERVED", "CANCELLED"] } },
    orderBy: { at: "asc" }, select: { action: true, at: true, metadata: true },
  });
  const last = (action: string) => [...audit].reverse().find(a => a.action === action);
  const meta = (a: { metadata: unknown } | undefined) => (a?.metadata && typeof a.metadata === "object" ? a.metadata as Record<string, unknown> : {});
  const created = meta(last("CREATED"));
  const triageMeta = meta(last("AVAILABLE"));
  const reservedAt = last("RESERVED")?.at ?? null;
  const cancelledAt = last("CANCELLED")?.at ?? null;
  const status = lot.status as DonationState;

  const checklist = triageMeta.sanitaryChecklist && typeof triageMeta.sanitaryChecklist === "object"
    ? SANITARY_CHECKS.filter(c => (triageMeta.sanitaryChecklist as Record<string, unknown>)[c.key] === true).map(c => c.label) : [];
  const origin = str(triageMeta.foodOrigin);
  const triage = lot.safetyVerifiedAt ? {
    at: lot.safetyVerifiedAt.toISOString(),
    by: publicName(lot.safetyVerifiedBy),
    qualification: str(triageMeta.reviewerQualification),
    foodOrigin: origin && (FOOD_ORIGINS as readonly string[]).includes(origin) ? FOOD_ORIGIN_LABEL[origin as FoodOrigin] : null,
    checklist,
  } : null;

  let cold: PublicPassport["cold"] = null;
  if (lot.originEquipmentId) {
    const w = passportWindow(lot.createdAt, lot.receivedAt ?? cancelledAt, now);
    const ev = await coldEvidence(lot.originEquipmentId, { source: tempSourceFor(lot.source), from: w.from, to: w.to, orgId: lot.organizationId, points: 96 });
    if (ev) cold = {
      equipment: { label: ev.equipment.label, kindLabel: ev.equipment.kindLabel, siteName: ev.equipment.siteName, rangeText: ev.equipment.rangeText,
        reference: ev.equipment.reference, range: ev.equipment.range },
      source: ev.source, from: ev.from, to: ev.to, capped: w.capped, open: w.open,
      summary: { samples: ev.summary.samples, inRangePct: ev.summary.inRangePct, coveragePct: ev.summary.coveragePct, excursionCount: ev.summary.excursionCount,
        outRangeMinutes: ev.summary.outRangeMinutes, minC: ev.summary.minC, maxC: ev.summary.maxC, longest: ev.summary.longest },
      series: ev.series.map(p => ({ t: p.t, c: p.c, max: p.max })),
    };
  }

  return {
    code: passportCode(token),
    source: lot.source as PublicPassport["source"],
    store: { name: lot.organization.name, demo: lot.organization.isDemo },
    description: lot.description,
    kg: Number(lot.weightKg),
    status,
    verdict: PASSPORT_VERDICT[status],
    stamps: passportStamps({ createdAt: lot.createdAt, verifiedAt: lot.safetyVerifiedAt, reservedAt, deliveredAt: lot.receivedAt }, typeof created.deviceCode === "string"),
    cancelledAt: cancelledAt?.toISOString() ?? null,
    weighedByScale: typeof created.deviceCode === "string",
    triage,
    originDeclared: Boolean(lot.originEquipmentId) || triageMeta.originDeclared === true,
    cold,
    recipient: (status === "RESERVED" || status === "DELIVERED") && lot.recipient ? { name: lot.recipient.name, city: lot.recipient.city } : null,
    generatedAt: now.toISOString(),
  };
}
