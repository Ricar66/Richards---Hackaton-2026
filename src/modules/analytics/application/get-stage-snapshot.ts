import { DatabaseUnavailableError, getDb } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
import { floorToBucket } from "../domain/analytics-filter";
import type { Provenance } from "../domain/dashboard";
import { OverviewNotSeededError } from "./get-overview";
import { deviceConnectivity, type DeviceConnectivity } from "@/modules/monitoring/domain/device-connectivity";
import { FlowAlertPolicy } from "@/modules/monitoring/domain/flow-alert-policy";
import type { FlowRuleProgress, LiveSource } from "@/modules/realtime/domain/live-event";
import { publicActor } from "@/modules/realtime/domain/public-actor";

/**
 * Snapshot da Sala ao vivo (tela de palco). A tela busca isto ao abrir, a cada `hello` do stream e a cada evento de
 * ocorrência ou lote: agregados (kg, contagens) vêm SEMPRE daqui, nunca somados no navegador a partir de eventos.
 * O telão é público: nome de quem recebeu, quem verificou, notas e o usuário do operador NÃO saem daqui.
 */
export const STAGE_READINGS_SECONDS = 180;
export const STAGE_AUDIT_LIMIT = 12;

export type StageReading = { deviceId: string; bootId: string; sequence: number; capturedAt: string; flowLpm: number; deltaLiters: number; source: LiveSource };
/** Regra de fluxo reavaliada pela FlowAlertPolicy sobre a última leitura do dispositivo, com o mesmo histórico da ingestão. */
export type StageRule = FlowRuleProgress & { at: string; bootId: string; sequence: number; source: LiveSource; flowLpm: number };
export type StageDevice = {
  id: string; code: string; label: string; kind: string; siteName: string;
  minFlowLpm: number; continuousSeconds: number; lastSeenAt: string | null; connectivity: DeviceConnectivity;
  rule: StageRule | null;
};
export type StageOccurrence = { id: string; kind: string; severity: string; status: string; title: string; source: LiveSource; deviceId: string | null; deviceCode: string | null; openedAt: string };
/** Contador com a origem dos registros que o compõem (o telão carimba SIMULADO quando for o caso). */
export type StageCounter = { value: number; provenance: Provenance; sources: { source: LiveSource; value: number }[] };
export type StageAuditEntry = {
  id: string; at: string; entity: "Occurrence" | "DonationBatch"; entityId: string; action: string;
  /** Autor sem o usuário do operador ("operador", "dispositivo:CODIGO", "simulador:CODIGO"). */
  actor: string;
  title: string; source: LiveSource | null; kg: number | null;
  /** Só a instituição. Quem recebeu não vai para o telão. */
  institution: string | null;
  severity: string | null; deviceCode: string | null;
};
export type StageScaleLot = { id: string; deviceCode: string; kg: number; source: LiveSource; createdAt: string };
export type StageSnapshot = {
  serverTime: string;
  organization: { name: string; city: string; sites: string[] };
  devices: StageDevice[];
  /** Leituras dos últimos STAGE_READINGS_SECONDS de todos os dispositivos, da mais antiga para a mais nova. */
  readings: StageReading[];
  activeOccurrences: StageOccurrence[];
  today: {
    /** Início do dia no fuso de São Paulo. */
    from: string;
    deliveredKg: StageCounter; deliveredBatches: number;
    pendingReview: StageCounter; activeOccurrences: StageCounter;
  };
  /** Lotes da balança ainda aguardando verificação humana (a autoria da balança está na auditoria de criação). */
  pendingScaleLots: StageScaleLot[];
  /** Últimos eventos de auditoria de ocorrência e lote, do mais novo para o mais antigo. */
  audit: StageAuditEntry[];
};

const ACTIVE = ["OPEN", "ACKNOWLEDGED"] as const;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const asSource = (s: string) => s as LiveSource;

function counter(rows: { source: string; value: number }[]): StageCounter {
  const sources = rows.filter(r => r.value > 0).map(r => ({ source: asSource(r.source), value: round3(r.value) }));
  const value = round3(sources.reduce((n, r) => n + r.value, 0));
  const provenance: Provenance = sources.length === 0 ? "NONE" : sources.length === 1 ? sources[0].source : "MIXED";
  return { value, provenance, sources };
}

export async function getStageSnapshot(now = new Date()): Promise<StageSnapshot> {
  try {
    const db = getDb();
    const org = await db.organization.findUnique({ where: { id: DEMO_ORG_ID }, include: { sites: { select: { name: true }, orderBy: { name: "asc" } } } });
    if (!org) throw new OverviewNotSeededError();
    const dayStart = floorToBucket(now, "1d");
    const since = new Date(now.getTime() - STAGE_READINGS_SECONDS * 1000);
    const [devices, readings, active, delivered, pending, activeBySource, audit, pendingLots] = await Promise.all([
      db.device.findMany({ where: { organizationId: org.id }, include: { site: { select: { name: true } } }, orderBy: { code: "asc" } }),
      db.telemetryReading.findMany({ where: { device: { organizationId: org.id }, capturedAt: { gte: since, lte: now } }, orderBy: { capturedAt: "asc" }, take: 2000 }),
      db.occurrence.findMany({ where: { organizationId: org.id, status: { in: [...ACTIVE] } }, include: { device: { select: { code: true } } }, orderBy: { openedAt: "desc" }, take: 20 }),
      // Kg entregues HOJE contam pela data de recebimento (decisão do projeto), no fuso de São Paulo.
      db.donationBatch.groupBy({ by: ["source"], where: { organizationId: org.id, status: "DELIVERED", receivedAt: { gte: dayStart, lte: now } }, _sum: { weightKg: true }, _count: { _all: true } }),
      db.donationBatch.groupBy({ by: ["source"], where: { organizationId: org.id, status: "PENDING_REVIEW" }, _count: { _all: true } }),
      db.occurrence.groupBy({ by: ["source"], where: { organizationId: org.id, status: { in: [...ACTIVE] } }, _count: { _all: true } }),
      db.auditEvent.findMany({ where: { organizationId: org.id, entity: { in: ["Occurrence", "DonationBatch"] } }, orderBy: { at: "desc" }, take: STAGE_AUDIT_LIMIT }),
      db.donationBatch.findMany({ where: { organizationId: org.id, status: "PENDING_REVIEW" }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, weightKg: true, source: true, createdAt: true } }),
    ]);

    // Regra por dispositivo: mesma consulta e mesma política da ingestão (mesma origem da última leitura, janela e limite iguais).
    const lastByDevice = new Map<string, (typeof readings)[number]>();
    for (const r of readings) lastByDevice.set(r.deviceId, r);
    const rules = new Map<string, StageRule>();
    await Promise.all(devices.map(async d => {
      const last = lastByDevice.get(d.id);
      if (!last) return;
      const from = new Date(last.capturedAt.getTime() - Math.max(d.continuousSeconds + 60, 120) * 1000);
      const history = await db.telemetryReading.findMany({ where: { deviceId: d.id, source: last.source, capturedAt: { gte: from, lte: last.capturedAt } }, orderBy: { capturedAt: "desc" }, take: 120 });
      const decision = new FlowAlertPolicy(d.minFlowLpm, d.continuousSeconds).evaluate(history.map(x => ({ capturedAt: x.capturedAt, flowLpm: Number(x.flowLpm), deltaLiters: Number(x.deltaLiters) })));
      rules.set(d.id, {
        minFlowLpm: d.minFlowLpm, continuousSeconds: d.continuousSeconds, observedSeconds: decision.observedSeconds, suspicious: decision.suspicious,
        at: last.capturedAt.toISOString(), bootId: last.bootId, sequence: last.sequence, source: asSource(last.source), flowLpm: Number(last.flowLpm),
      });
    }));

    // Títulos da auditoria e autoria da balança (o lote não tem coluna de dispositivo: fica no CREATED da auditoria).
    const occIds = [...new Set(audit.filter(a => a.entity === "Occurrence").map(a => a.entityId))];
    const lotIds = [...new Set([...audit.filter(a => a.entity === "DonationBatch").map(a => a.entityId), ...pendingLots.map(l => l.id)])];
    const [occs, lots, lotCreations] = await Promise.all([
      occIds.length ? db.occurrence.findMany({ where: { id: { in: occIds } }, select: { id: true, title: true, source: true, severity: true, device: { select: { code: true } } } }) : [],
      lotIds.length ? db.donationBatch.findMany({ where: { id: { in: lotIds } }, select: { id: true, description: true, weightKg: true, source: true, recipient: { select: { name: true } } } }) : [],
      pendingLots.length ? db.auditEvent.findMany({ where: { organizationId: org.id, entity: "DonationBatch", action: "CREATED", entityId: { in: pendingLots.map(l => l.id) } }, select: { entityId: true, metadata: true } }) : [],
    ]);
    const occById = new Map(occs.map(o => [o.id, o]));
    const lotById = new Map(lots.map(l => [l.id, l]));
    const scaleCode = new Map(lotCreations.map(c => {
      const m = (c.metadata ?? {}) as Record<string, unknown>;
      return [c.entityId, typeof m.deviceCode === "string" ? m.deviceCode : null] as const;
    }));

    return {
      serverTime: now.toISOString(),
      organization: { name: org.name, city: org.city, sites: org.sites.map(s => s.name) },
      devices: devices.map(d => ({
        id: d.id, code: d.code, label: d.label, kind: d.kind, siteName: d.site.name,
        minFlowLpm: d.minFlowLpm, continuousSeconds: d.continuousSeconds,
        lastSeenAt: d.lastSeenAt?.toISOString() ?? null, connectivity: deviceConnectivity(d.state, d.lastSeenAt, now),
        rule: rules.get(d.id) ?? null,
      })),
      readings: readings.map(r => ({ deviceId: r.deviceId, bootId: r.bootId, sequence: r.sequence, capturedAt: r.capturedAt.toISOString(), flowLpm: Number(r.flowLpm), deltaLiters: Number(r.deltaLiters), source: asSource(r.source) })),
      activeOccurrences: active.map(o => ({ id: o.id, kind: o.kind, severity: o.severity, status: o.status, title: o.title, source: asSource(o.source), deviceId: o.deviceId, deviceCode: o.device?.code ?? null, openedAt: o.openedAt.toISOString() })),
      today: {
        from: dayStart.toISOString(),
        deliveredKg: counter(delivered.map(g => ({ source: g.source, value: Number(g._sum.weightKg ?? 0) }))),
        deliveredBatches: delivered.reduce((n, g) => n + g._count._all, 0),
        pendingReview: counter(pending.map(g => ({ source: g.source, value: g._count._all }))),
        activeOccurrences: counter(activeBySource.map(g => ({ source: g.source, value: g._count._all }))),
      },
      pendingScaleLots: pendingLots.flatMap(l => {
        const code = scaleCode.get(l.id);
        return code ? [{ id: l.id, deviceCode: code, kg: Number(l.weightKg), source: asSource(l.source), createdAt: l.createdAt.toISOString() }] : [];
      }),
      audit: audit.map(a => {
        const m = (a.metadata ?? {}) as Record<string, unknown>;
        const occ = a.entity === "Occurrence" ? occById.get(a.entityId) : undefined;
        const lot = a.entity === "DonationBatch" ? lotById.get(a.entityId) : undefined;
        // Instituição: só quando o passo envolve a instituição (reserva e entrega).
        const institution = lot && (a.action === "RESERVED" || a.action === "DELIVERED") ? (typeof m.recipientName === "string" ? m.recipientName : lot.recipient?.name ?? null) : null;
        return {
          id: a.id, at: a.at.toISOString(), entity: a.entity as StageAuditEntry["entity"], entityId: a.entityId, action: a.action,
          actor: publicActor(typeof m.actor === "string" ? m.actor : null),
          title: occ?.title ?? lot?.description ?? "(registro não encontrado)",
          source: occ ? asSource(occ.source) : lot ? asSource(lot.source) : null,
          kg: lot ? Number(lot.weightKg) : null, institution,
          severity: occ?.severity ?? null,
          deviceCode: occ?.device?.code ?? (typeof m.deviceCode === "string" ? m.deviceCode : null),
        };
      }),
    };
  } catch (err) {
    if (err instanceof OverviewNotSeededError) throw err;
    throw new DatabaseUnavailableError(err);
  }
}
