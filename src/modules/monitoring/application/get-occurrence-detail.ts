import { getDb } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
import { deviceConnectivity, type DeviceConnectivity } from "../domain/device-connectivity";

export type EvidenceReading = { at: string; flowLpm: number; deltaLiters: number; source: string; bootId: string; sequence: number };
export type OccurrenceDetailDTO = {
  id: string; title: string; description: string; kind: string; severity: string; status: string; source: string;
  suspectedLiters: number | null; verificationNote: string | null;
  openedAt: string; acknowledgedAt: string | null; resolvedAt: string | null;
  device: { id: string; code: string; label: string; connectivity: DeviceConnectivity; lastSeen: string | null } | null;
  timeline: { action: string; note: string | null; actor: string | null; at: string }[];
  /** Leituras que a regra usou ao abrir o alerta. null = não há janela registrada; nada é associado por proximidade. */
  evidence: {
    windowStart: string; windowEnd: string; rule: { minFlowLpm: number; continuousSeconds: number } | null;
    readings: EvidenceReading[]; totals: { samples: number; liters: number; maxFlowLpm: number };
    /** Leituras da mesma origem depois da abertura (até a resolução ou agora): o fluxo parou após a intervenção? */
    followUp: EvidenceReading[];
  } | null;
  evidenceNote: string;
};

const MAX_READINGS = 240;
const isoDate = (v: unknown) => { if (typeof v !== "string") return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };
const toReading = (r: { capturedAt: Date; flowLpm: unknown; deltaLiters: unknown; source: string; bootId: string; sequence: number }): EvidenceReading =>
  ({ at: r.capturedAt.toISOString(), flowLpm: Number(r.flowLpm), deltaLiters: Number(r.deltaLiters), source: r.source, bootId: r.bootId, sequence: r.sequence });

export async function getOccurrenceDetail(id: string): Promise<OccurrenceDetailDTO> {
  const db = getDb();
  const o = await db.occurrence.findFirst({ where: { id, organizationId: DEMO_ORG_ID, kind:{not:"TEMPERATURE_EXCURSION"} }, include: { device: true, events: { orderBy: { at: "asc" } } } });
  if (!o) throw new Error("NOT_FOUND");
  const created = await db.auditEvent.findFirst({ where: { organizationId: o.organizationId, entity: "Occurrence", entityId: o.id, action: "CREATED" }, orderBy: { at: "asc" } });
  const meta = (created?.metadata ?? null) as Record<string, unknown> | null;
  const windowStart = isoDate(meta?.windowStart), windowEnd = isoDate(meta?.windowEnd);
  const ruleMeta = meta?.rule as { minFlowLpm?: unknown; continuousSeconds?: unknown } | undefined;

  let evidence: OccurrenceDetailDTO["evidence"] = null;
  let evidenceNote = o.kind === "TEMPERATURE_EXCURSION"
    ? "Alerta de temperatura: as leituras do DHT11 que dispararam a regra estão resumidas na descrição e guardadas na auditoria. O BI ainda não grafa temperatura; leituras de vazão não servem de evidência aqui."
    : "Sem janela de leituras registrada para esta ocorrência (simulação pelo painel, cadastro manual ou registro anterior à Fase 1). Nenhuma leitura é associada para não inventar evidência.";
  // Janela de vazão só é evidência de ocorrência de vazão.
  if (o.kind === "UNUSUAL_FLOW" && o.deviceId && windowStart && windowEnd && o.source !== "MANUAL") {
    const scope = { deviceId: o.deviceId, source: o.source };
    const [inWindow, after] = await Promise.all([
      db.telemetryReading.findMany({ where: { ...scope, capturedAt: { gte: windowStart, lte: windowEnd } }, orderBy: { capturedAt: "asc" }, take: MAX_READINGS }),
      db.telemetryReading.findMany({ where: { ...scope, capturedAt: { gt: windowEnd, lte: o.resolvedAt ?? new Date() } }, orderBy: { capturedAt: "asc" }, take: MAX_READINGS }),
    ]);
    const readings = inWindow.map(toReading);
    evidence = {
      windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString(),
      rule: typeof ruleMeta?.minFlowLpm === "number" && typeof ruleMeta?.continuousSeconds === "number" ? { minFlowLpm: ruleMeta.minFlowLpm, continuousSeconds: ruleMeta.continuousSeconds } : null,
      readings,
      totals: { samples: readings.length, liters: Math.round(readings.reduce((n, r) => n + r.deltaLiters, 0) * 1000) / 1000, maxFlowLpm: readings.reduce((m, r) => Math.max(m, r.flowLpm), 0) },
      followUp: after.map(toReading),
    };
    evidenceNote = `Leituras ${o.source === "SIMULATED" ? "SIMULADAS" : "do dispositivo"} que a regra avaliou ao abrir o alerta. Indício de fluxo contínuo, não vazamento comprovado.`;
  }
  return {
    id: o.id, title: o.title, description: o.description, kind: o.kind, severity: o.severity, status: o.status, source: o.source,
    suspectedLiters: o.suspectedLiters === null ? null : Number(o.suspectedLiters), verificationNote: o.verificationNote,
    openedAt: o.openedAt.toISOString(), acknowledgedAt: o.acknowledgedAt?.toISOString() ?? null, resolvedAt: o.resolvedAt?.toISOString() ?? null,
    device: o.device ? { id: o.device.id, code: o.device.code, label: o.device.label, connectivity: deviceConnectivity(o.device.state, o.device.lastSeenAt, new Date()), lastSeen: o.device.lastSeenAt?.toISOString() ?? null } : null,
    timeline: o.events.map(e => ({ action: e.action, note: e.note, actor: e.actor, at: e.at.toISOString() })),
    evidence, evidenceNote,
  };
}
