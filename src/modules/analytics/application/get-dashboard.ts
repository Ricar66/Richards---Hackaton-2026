import { Prisma } from "@/generated/prisma/client";
import { DatabaseUnavailableError, getDb } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
import { TIME_ZONE } from "@/lib/format";
import { deviceConnectivity } from "@/modules/monitoring/domain/device-connectivity";
import { BUCKET_SECONDS, filterToQuery, type AnalyticsFilter } from "../domain/analytics-filter";
import type { DashboardDTO, OccurrenceStatus, Provenance, SeriesPoint, Severity, SourceKey } from "../domain/dashboard";
import { OverviewNotSeededError } from "./get-overview";

const ACTIVE: OccurrenceStatus[] = ["OPEN", "ACKNOWLEDGED"];
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const isoOrNull = (v: unknown) => { if (typeof v !== "string") return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };
type SeriesRow = { idx: number; liters: number; avg_flow: number; max_flow: number; samples: number };
type HeatRow = { dow: number; hour: number; liters: number; days: number };

/** Recorte de leituras do filtro (unidade, sensor, origem). O período é aplicado por cada consulta. */
function readingScope(f: AnalyticsFilter) {
  return {
    device: { organizationId: DEMO_ORG_ID, kind:"FLOW", ...(f.siteId ? { siteId: f.siteId } : {}) },
    ...(f.deviceId ? { deviceId: f.deviceId } : {}),
    ...(f.source !== "ALL" ? { source: f.source } : {}),
  } satisfies Prisma.TelemetryReadingWhereInput;
}
function readingSql(f: AnalyticsFilter) {
  return Prisma.sql`d."organizationId" = ${DEMO_ORG_ID} AND d.kind='FLOW'
    ${f.siteId ? Prisma.sql`AND d."siteId" = ${f.siteId}` : Prisma.empty}
    ${f.deviceId ? Prisma.sql`AND tr."deviceId" = ${f.deviceId}` : Prisma.empty}
    ${f.source !== "ALL" ? Prisma.sql`AND tr.source::text = ${f.source}` : Prisma.empty}`;
}
function occurrenceScope(f: AnalyticsFilter) {
  return {
    organizationId: DEMO_ORG_ID, kind:{not:"TEMPERATURE_EXCURSION"},
    ...(f.siteId ? { siteId: f.siteId } : {}),
    ...(f.deviceId ? { deviceId: f.deviceId } : {}),
    ...(f.source !== "ALL" ? { source: f.source } : {}),
  } satisfies Prisma.OccurrenceWhereInput;
}

/**
 * Tudo o que o BI e o PDF mostram sai daqui, agregado no PostgreSQL. Nenhum número é preenchido para "ficar bonito":
 * sem leitura no período o volume é null (UI mostra "sem dados"), e intervalos sem amostra viram lacuna, não zero.
 */
export async function getDashboard(f: AnalyticsFilter, now = new Date()): Promise<DashboardDTO> {
  try {
    const db = getDb();
    const org = await db.organization.findUnique({ where: { id: DEMO_ORG_ID } });
    if (!org) throw new OverviewNotSeededError();
    const bucketSec = BUCKET_SECONDS[f.bucket];
    const fromSec = f.from.getTime() / 1000;
    const spanMs = f.to.getTime() - f.from.getTime();
    const prevFrom = new Date(f.from.getTime() - spanMs);
    const period = { gte: f.from, lte: f.to };
    const scope = readingScope(f);
    const occScope = occurrenceScope(f);

    const [sites, devices, seriesRows, prevAgg, sourceGroups, heatRows, deviceGroups, peakAgg, occurrences, activeGroups, closedInPeriod, openedInPeriod] = await Promise.all([
      db.site.findMany({ where: { organizationId: org.id }, orderBy: { name: "asc" } }),
      db.device.findMany({ where: { organizationId: org.id, kind:"FLOW" }, include: { site: true }, orderBy: { code: "asc" } }),
      db.$queryRaw<SeriesRow[]>`
        SELECT floor((extract(epoch FROM tr."capturedAt") - ${fromSec}::float8) / ${bucketSec}::float8)::int AS idx,
               COALESCE(SUM(tr."deltaLiters"), 0)::float8 AS liters, AVG(tr."flowLpm")::float8 AS avg_flow,
               MAX(tr."flowLpm")::float8 AS max_flow, COUNT(*)::int AS samples
        FROM "TelemetryReading" tr INNER JOIN "Device" d ON d.id = tr."deviceId"
        WHERE ${readingSql(f)} AND tr."capturedAt" >= ${f.from} AND tr."capturedAt" <= ${f.to}
        GROUP BY 1 ORDER BY 1`,
      db.telemetryReading.aggregate({ where: { ...scope, capturedAt: { gte: prevFrom, lt: f.from } }, _sum: { deltaLiters: true }, _count: { _all: true } }),
      db.telemetryReading.groupBy({ by: ["source"], where: { ...scope, capturedAt: period }, _count: { _all: true }, _min: { capturedAt: true }, _max: { capturedAt: true } }),
      db.$queryRaw<HeatRow[]>`
        WITH local AS (
          SELECT (tr."capturedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TIME_ZONE} AS t, tr."deltaLiters" AS liters
          FROM "TelemetryReading" tr INNER JOIN "Device" d ON d.id = tr."deviceId"
          WHERE ${readingSql(f)} AND tr."capturedAt" >= ${f.from} AND tr."capturedAt" <= ${f.to})
        SELECT extract(isodow FROM t)::int AS dow, extract(hour FROM t)::int AS hour,
               SUM(liters)::float8 AS liters, COUNT(DISTINCT t::date)::int AS days
        FROM local GROUP BY 1, 2`,
      db.telemetryReading.groupBy({ by: ["deviceId"], where: { ...scope, capturedAt: period }, _count: { _all: true }, _sum: { deltaLiters: true } }),
      db.telemetryReading.aggregate({ where: { ...scope, capturedAt: period }, _max: { flowLpm: true } }),
      db.occurrence.findMany({
        where: { ...occScope, OR: [{ openedAt: period }, { status: { in: ACTIVE } }, { resolvedAt: period }] },
        include: { device: true, site: true }, orderBy: { openedAt: "desc" }, take: 300,
      }),
      db.occurrence.groupBy({ by: ["status"], where: { ...occScope, status: { in: ACTIVE } }, _count: { _all: true } }),
      db.occurrence.findMany({ where: { ...occScope, resolvedAt: period, status: { in: ["RESOLVED", "DISMISSED"] } }, select: { status: true, openedAt: true, acknowledgedAt: true, resolvedAt: true } }),
      db.occurrence.findMany({ where: { ...occScope, openedAt: period }, select: { id: true, status: true, severity: true, openedAt: true, acknowledgedAt: true } }),

    ]);

    // Janela de evidência de cada ocorrência aberta no período (marcadores do gráfico investigativo).
    const created = openedInPeriod.length ? await db.auditEvent.findMany({ where: { organizationId: org.id, entity: "Occurrence", action: "CREATED", entityId: { in: openedInPeriod.map(o => o.id) } }, select: { entityId: true, metadata: true } }) : [];
    const windows = new Map(created.map(a => { const m = (a.metadata ?? {}) as Record<string, unknown>; return [a.entityId, { start: isoOrNull(m.windowStart), end: isoOrNull(m.windowEnd) }]; }));

    // Série: todos os intervalos do período, inclusive os sem leitura.
    const byIdx = new Map(seriesRows.map(r => [r.idx, r]));
    // +1: o intervalo que contém `to` entra mesmo quando o fim cai exatamente na borda (soma da série = total do KPI).
    const count = Math.floor(spanMs / (bucketSec * 1000)) + 1;
    const openedPerIdx = new Map<number, number>();
    for (const o of openedInPeriod) { const i = Math.floor((o.openedAt.getTime() / 1000 - fromSec) / bucketSec); openedPerIdx.set(i, (openedPerIdx.get(i) ?? 0) + 1); }
    const series: SeriesPoint[] = Array.from({ length: count }, (_, i) => {
      const r = byIdx.get(i);
      const t = f.from.getTime() + i * bucketSec * 1000, end = t + bucketSec * 1000;
      return {
        t, end, samples: r?.samples ?? 0, occurrences: openedPerIdx.get(i) ?? 0, partial: end > now.getTime(),
        liters: r ? round(r.liters, 2) : null, avgFlowLpm: r ? round(r.avg_flow, 2) : null, maxFlowLpm: r ? round(r.max_flow, 2) : null,
      };
    });

    const samples = sourceGroups.reduce((n, g) => n + g._count._all, 0);
    const present = sourceGroups.filter(g => g._count._all > 0).map(g => g.source as SourceKey);
    const label: Provenance = present.length === 0 ? "NONE" : present.length > 1 ? "MIXED" : present[0];
    const firsts = sourceGroups.map(g => g._min.capturedAt).filter((d): d is Date => !!d);
    const lasts = sourceGroups.map(g => g._max.capturedAt).filter((d): d is Date => !!d);
    const observed = seriesRows.reduce((n, r) => n + r.liters, 0);
    const nightLiters = heatRows.filter(h => h.hour < 5).reduce((n, h) => n + h.liters, 0);

    const minutes = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 60_000;
    const avg = (xs: number[]) => xs.length ? Math.round(xs.reduce((n, x) => n + x, 0) / xs.length) : null;
    const activeCount = (s: OccurrenceStatus) => activeGroups.find(g => g.status === s)?._count._all ?? 0;

    const scopedDevices = devices.filter(d => (!f.siteId || d.siteId === f.siteId) && (!f.deviceId || d.id === f.deviceId));
    const rules = new Set(scopedDevices.map(d => `${d.minFlowLpm}|${d.continuousSeconds}`));
    const perDevice = new Map(deviceGroups.map(g => [g.deviceId, g]));
    const deviceDtos = devices.map(d => {
      const g = perDevice.get(d.id);
      return {
        id: d.id, code: d.code, label: d.label, kind: d.kind, siteId: d.siteId, siteName: d.site.name,
        connectivity: deviceConnectivity(d.state, d.lastSeenAt, now), lastSeen: d.lastSeenAt?.toISOString() ?? null,
        samples: g?._count._all ?? 0, liters: g ? round(Number(g._sum.deltaLiters ?? 0), 2) : null,
        minFlowLpm: d.minFlowLpm, continuousSeconds: d.continuousSeconds, pulsesPerLiter: d.calibrationPulsesPerLiter,
      };
    });

    const STATUSES: OccurrenceStatus[] = ["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"];
    const SEVERITIES: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

    return {
      generatedAt: now.toISOString(),
      organization: { name: org.name, city: org.city, sector: org.sector },
      filter: { range: f.range, from: f.from.toISOString(), to: f.to.toISOString(), bucket: f.bucket, bucketSeconds: bucketSec, siteId: f.siteId, deviceId: f.deviceId, source: f.source, query: filterToQuery(f).toString() },
      options: { sites: sites.map(s => ({ id: s.id, name: s.name })), devices: devices.map(d => ({ id: d.id, code: d.code, label: d.label, siteId: d.siteId })) },
      provenance: {
        label, samples, sources: sourceGroups.map(g => ({ source: g.source as SourceKey, samples: g._count._all })),
        firstReading: firsts.length ? new Date(Math.min(...firsts.map(d => d.getTime()))).toISOString() : null,
        lastReading: lasts.length ? new Date(Math.max(...lasts.map(d => d.getTime()))).toISOString() : null,
      },
      kpis: {
        observedLiters: samples ? round(observed) : null,
        previousLiters: prevAgg._count._all ? round(Number(prevAgg._sum.deltaLiters ?? 0)) : null, previousSamples: prevAgg._count._all,
        peakFlowLpm: peakAgg._max.flowLpm === null ? null : round(Number(peakAgg._max.flowLpm), 2),
        nightLiters: samples ? round(nightLiters) : null,
        activeOccurrences: activeCount("OPEN") + activeCount("ACKNOWLEDGED"), openOccurrences: activeCount("OPEN"), acknowledgedOccurrences: activeCount("ACKNOWLEDGED"),
        openedInPeriod: openedInPeriod.length,
        resolvedInPeriod: closedInPeriod.filter(o => o.status === "RESOLVED").length,
        dismissedInPeriod: closedInPeriod.filter(o => o.status === "DISMISSED").length,
        avgResolutionMin: avg(closedInPeriod.filter(o => o.status === "RESOLVED").map(o => minutes(o.openedAt, o.resolvedAt!))),
        avgAckMin: avg(openedInPeriod.filter(o => o.acknowledgedAt).map(o => minutes(o.openedAt, o.acknowledgedAt!))),
        deliveredKg:0,deliveredCount:0,availableKg:0,pendingReview:0,
        devices: scopedDevices.length, devicesOnline: deviceDtos.filter(d => scopedDevices.some(s => s.id === d.id) && d.connectivity === "ONLINE").length,
      },
      series,
      threshold: rules.size === 1 ? { minFlowLpm: scopedDevices[0].minFlowLpm, continuousSeconds: scopedDevices[0].continuousSeconds } : null,
      markers: occurrences.filter(o => o.openedAt >= f.from && o.openedAt <= f.to).map(o => ({
        id: o.id, title: o.title, severity: o.severity, status: o.status, source: o.source as SourceKey, openedAt: o.openedAt.toISOString(),
        windowStart: windows.get(o.id)?.start ?? null, windowEnd: windows.get(o.id)?.end ?? null,
      })),
      heatmap: heatRows.map(h => ({ dow: h.dow, hour: h.hour, liters: round(h.liters, 2), days: h.days })),
      statusBreakdown: STATUSES.map(s => ({ status: s, count: openedInPeriod.filter(o => o.status === s).length })),
      severityBreakdown: SEVERITIES.map(s => ({ severity: s, count: openedInPeriod.filter(o => o.severity === s).length })),
      occurrences: occurrences.map(o => ({
        id: o.id, title: o.title, description: o.description, kind: o.kind, severity: o.severity, status: o.status, source: o.source as SourceKey,
        deviceId: o.deviceId, deviceCode: o.device?.code ?? null, siteName: o.site.name,
        openedAt: o.openedAt.toISOString(), acknowledgedAt: o.acknowledgedAt?.toISOString() ?? null, resolvedAt: o.resolvedAt?.toISOString() ?? null,
        suspectedLiters: o.suspectedLiters === null ? null : Number(o.suspectedLiters),
        resolutionMin: o.resolvedAt ? Math.round(minutes(o.openedAt, o.resolvedAt)) : null,
      })),
      donations:{items:[],pipeline:[]},
      devices: deviceDtos,
    };
  } catch (err) {
    if (err instanceof OverviewNotSeededError) throw err;
    throw new DatabaseUnavailableError(err);
  }
}
