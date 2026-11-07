import { getDb } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
import { TIME_ZONE } from "@/lib/format";
import { deviceConnectivity } from "../domain/device-connectivity";
import {
  assessFixtureActivity, FIXTURE_WINDOW_HOURS, FLOW_EVENT_THRESHOLD_LPM,
  type FixtureActivityState,
} from "../domain/fixture-activity-policy";

/** Só telemetria DEVICE física; nunca alimentar a análise com seed/SIMULATED. */
type ActivityRow = {
  deviceId: string;
  samples: number;
  coveredBuckets: number;
  flowSamples: number;
  lastFlowAt: Date | null;
  lastDeviceReadingAt: Date | null;
  nightLiters: number;
  weekendLiters: number;
};
export type FixtureActivityItem = {
  deviceId: string; deviceCode: string; deviceLabel: string; siteName: string;
  source: "DEVICE"; windowHours: number; at: string;
  connectivity: string; state: FixtureActivityState;
  coveragePercent: number; samples: number; coveredBuckets: number;
  flowSamples: number; lastFlowAt: string | null;
  nightLiters: number; weekendLiters: number;
  thresholdLpm: number;
};
export type FixtureActivityResponse = { generatedAt: string; windowHours: number; items: FixtureActivityItem[] };

const round = (v: number) => Math.round(v * 100) / 100;

/**
 * Observação diagnóstica para pontos hidráulicos, SEM abrir ocorrências automáticas.
 * A classificação "sem fluxo" só é útil se a instalação for dedicada a UMA descarga,
 * a escola deveria estar em atividade e a sensibilidade do sensor for comprovada.
 * Sem ocupação esperada também é normal não haver acionamentos.
 */
export async function getFixtureActivity(
  options: { siteId?: string | null; deviceId?: string | null } = {},
  now = new Date(),
): Promise<FixtureActivityResponse> {
  const db = getDb();
  const devices = await db.device.findMany({
    where: {
      organizationId: DEMO_ORG_ID, kind: "FLOW",
      ...(options.siteId ? { siteId: options.siteId } : {}),
      ...(options.deviceId ? { id: options.deviceId } : {}),
    },
    include: { site: { select: { name: true } } },
    orderBy: { code: "asc" },
  });
  if (!devices.length) return { generatedAt: now.toISOString(), windowHours: FIXTURE_WINDOW_HOURS, items: [] };

  const from = new Date(now.getTime() - FIXTURE_WINDOW_HOURS * 60 * 60_000);
  // A consulta cruza somente dispositivos da organização, fonte DEVICE e últimos 3 dias.
  // bucket por 10 min mede presença de sinal no tempo; COUNT impede cobertura fake com uma amostra por bloco.
  const rows = await db.$queryRaw<ActivityRow[]>`
    SELECT tr."deviceId" AS "deviceId",
      COUNT(*)::int AS samples,
      COUNT(DISTINCT floor(extract(epoch from tr."capturedAt") / 600))::int AS "coveredBuckets",
      COUNT(*) FILTER (WHERE tr."flowLpm" >= ${FLOW_EVENT_THRESHOLD_LPM})::int AS "flowSamples",
      MAX(tr."capturedAt") FILTER (WHERE tr."flowLpm" >= ${FLOW_EVENT_THRESHOLD_LPM}) AS "lastFlowAt",
      MAX(tr."capturedAt") AS "lastDeviceReadingAt",
      COALESCE(SUM(tr."deltaLiters") FILTER (
        WHERE EXTRACT(HOUR FROM tr."capturedAt" AT TIME ZONE ${TIME_ZONE}) BETWEEN 0 AND 5
      ), 0)::float8 AS "nightLiters",
      COALESCE(SUM(tr."deltaLiters") FILTER (
        WHERE EXTRACT(ISODOW FROM tr."capturedAt" AT TIME ZONE ${TIME_ZONE}) IN (6, 7)
      ), 0)::float8 AS "weekendLiters"
    FROM "TelemetryReading" tr
    INNER JOIN "Device" d ON d.id = tr."deviceId"
    WHERE d."organizationId" = ${DEMO_ORG_ID}
      AND d.kind = 'FLOW' AND tr.source = 'DEVICE'
      AND tr."capturedAt" >= ${from} AND tr."capturedAt" <= ${now}
    GROUP BY tr."deviceId"
  `;
  const byId = new Map(rows.map(row => [row.deviceId, row]));
  return {
    generatedAt: now.toISOString(), windowHours: FIXTURE_WINDOW_HOURS,
    items: devices.map(device => {
      const r = byId.get(device.id);
      const deviceConnectivityNow = deviceConnectivity(device.state, device.lastSeenAt, now);
      // Um simulador pode atualizar lastSeenAt do mesmo Device: só leitura DEVICE recente valida telemetria física.
      const lastPhysicalAt = r?.lastDeviceReadingAt?.getTime() ?? null;
      const physicallyFresh = lastPhysicalAt !== null && now.getTime() - lastPhysicalAt >= 0 &&
        now.getTime() - lastPhysicalAt <= 120_000;
      const connectivity = deviceConnectivityNow === "ONLINE" && !physicallyFresh ? "OFFLINE" : deviceConnectivityNow;
      const evidence = {
        connectivity, samples: r?.samples ?? 0, coveredBuckets: r?.coveredBuckets ?? 0,
        flowSamples: r?.flowSamples ?? 0,
      };
      const assessment = assessFixtureActivity(evidence);
      return {
        deviceId: device.id, deviceCode: device.code, deviceLabel: device.label, siteName: device.site.name,
        source: "DEVICE" as const, windowHours: FIXTURE_WINDOW_HOURS, at: now.toISOString(),
        connectivity, state: assessment.state, coveragePercent: assessment.coveragePercent,
        samples: evidence.samples, coveredBuckets: evidence.coveredBuckets,
        flowSamples: evidence.flowSamples, lastFlowAt: r?.lastFlowAt?.toISOString() ?? null,
        nightLiters: round(r?.nightLiters ?? 0), weekendLiters: round(r?.weekendLiters ?? 0),
        thresholdLpm: FLOW_EVENT_THRESHOLD_LPM,
      };
    }),
  };
}
