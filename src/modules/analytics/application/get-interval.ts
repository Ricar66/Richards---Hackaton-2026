import { DatabaseUnavailableError, getDb } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
import { FilterError, type AnalyticsFilter } from "../domain/analytics-filter";
import type { IntervalDTO, SourceKey } from "../domain/dashboard";

const MAX_READINGS = 500;
const MAX_SPAN_MS = 26 * 3_600_000;

/**
 * Detalhe de um intervalo clicado no gráfico: as leituras que formam aquele ponto e as ocorrências ligadas a ele.
 * Ligação só por fato registrado (abertura no intervalo ou janela de evidência que o cruza), nunca por "parecer perto".
 */
export async function getInterval(f: Pick<AnalyticsFilter, "siteId" | "deviceId" | "source">, from: Date, to: Date): Promise<IntervalDTO> {
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) throw new FilterError("Intervalo inválido.");
  if (to.getTime() - from.getTime() > MAX_SPAN_MS) throw new FilterError("Detalhamento limitado a 24 horas por vez.");
  try {
    const db = getDb();
    const where = {
      device: { organizationId: DEMO_ORG_ID, kind:"FLOW" as const, ...(f.siteId ? { siteId: f.siteId } : {}) },
      ...(f.deviceId ? { deviceId: f.deviceId } : {}),
      ...(f.source !== "ALL" ? { source: f.source } : {}),
      capturedAt: { gte: from, lt: to },
    };
    const occWhere = { kind:{not:"TEMPERATURE_EXCURSION" as const}, organizationId: DEMO_ORG_ID, ...(f.siteId ? { siteId: f.siteId } : {}), ...(f.deviceId ? { deviceId: f.deviceId } : {}), ...(f.source !== "ALL" ? { source: f.source } : {}) };
    const [rows, agg, opened, audits] = await Promise.all([
      db.telemetryReading.findMany({ where, include: { device: true }, orderBy: { capturedAt: "asc" }, take: MAX_READINGS + 1 }),
      db.telemetryReading.aggregate({ where, _count: { _all: true }, _sum: { deltaLiters: true }, _max: { flowLpm: true } }),
      db.occurrence.findMany({ where: { ...occWhere, openedAt: { gte: from, lt: to } }, orderBy: { openedAt: "asc" } }),
      // Ocorrências abertas até 1 dia depois cujo CREATED registrou janela que cruza este intervalo.
      db.auditEvent.findMany({ where: { organizationId: DEMO_ORG_ID, entity: "Occurrence", action: "CREATED", at: { gte: from, lt: new Date(to.getTime() + 86_400_000) } }, select: { entityId: true, metadata: true } }),
    ]);
    const overlapping = audits.filter(a => {
      const m = (a.metadata ?? {}) as Record<string, unknown>;
      if (typeof m.windowStart !== "string" || typeof m.windowEnd !== "string") return false;
      return new Date(m.windowStart) < to && new Date(m.windowEnd) >= from;
    }).map(a => a.entityId).filter(id => !opened.some(o => o.id === id));
    const extra = overlapping.length ? await db.occurrence.findMany({ where: { ...occWhere, id: { in: overlapping } } }) : [];
    const pick = (o: (typeof opened)[number], relation: IntervalDTO["occurrences"][number]["relation"]) =>
      ({ id: o.id, title: o.title, severity: o.severity, status: o.status, source: o.source as SourceKey, openedAt: o.openedAt.toISOString(), relation });
    return {
      from: from.toISOString(), to: to.toISOString(),
      readings: rows.slice(0, MAX_READINGS).map(r => ({ at: r.capturedAt.toISOString(), deviceCode: r.device.code, flowLpm: Number(r.flowLpm), deltaLiters: Number(r.deltaLiters), source: r.source as SourceKey, sequence: r.sequence })),
      truncated: rows.length > MAX_READINGS,
      totals: { samples: agg._count._all, liters: Math.round(Number(agg._sum.deltaLiters ?? 0) * 1000) / 1000, maxFlowLpm: agg._max.flowLpm === null ? null : Number(agg._max.flowLpm) },
      occurrences: [...opened.map(o => pick(o, "OPENED_IN_INTERVAL")), ...extra.map(o => pick(o, "EVIDENCE_OVERLAPS"))],
    };
  } catch (err) {
    throw new DatabaseUnavailableError(err);
  }
}
