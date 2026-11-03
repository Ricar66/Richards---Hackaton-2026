import { DEVICE_KEY, db, newBootId, reading, resetAndSeed } from "./helpers";
import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { getDashboard } from "../../src/modules/analytics/application/get-dashboard";
import { getInterval } from "../../src/modules/analytics/application/get-interval";
import { getLive } from "../../src/modules/analytics/application/get-live";
import { IngestTelemetry } from "../../src/modules/monitoring/application/ingest-telemetry";
import { parseAnalyticsFilter } from "../../src/modules/analytics/domain/analytics-filter";
import { DEMO_DEVICE_ID, DEMO_ORG_ID, DEMO_RECIPIENT_ID } from "../../src/lib/constants";

beforeEach(resetAndSeed);
after(() => db().$disconnect());

const HOUR = 3_600_000;
/** Insere leituras históricas direto no banco (a API recusa horário fora de ±5 min, de propósito). */
async function history(points: { hoursAgo: number; liters: number; flow?: number; source?: "DEVICE" | "SIMULATED" }[]) {
  const boot = newBootId();
  await db().telemetryReading.createMany({ data: points.map((p, i) => ({
    deviceId: DEMO_DEVICE_ID, bootId: boot, sequence: i, source: p.source ?? "DEVICE",
    flowLpm: p.flow ?? 1, deltaLiters: p.liters, capturedAt: new Date(Date.now() - p.hoursAgo * HOUR),
  })) });
}

test("T40 período sem leitura: volume null e série só de lacunas (nunca zero inventado)", async () => {
  const d = await getDashboard(parseAnalyticsFilter({ range: "24h" }));
  assert.equal(d.kpis.observedLiters, null);
  assert.equal(d.provenance.label, "NONE");
  assert.ok(d.series.length >= 96);
  assert.ok(d.series.every(p => p.liters === null && p.samples === 0));
  assert.equal(d.series.filter(p => p.partial).length, 1, "só o intervalo que contém agora é parcial");
  assert.equal(d.kpis.previousLiters, null);
});

test("T41 soma da série = KPI do período e intervalos sem amostra ficam null", async () => {
  await history([{ hoursAgo: 30, liters: 10 }, { hoursAgo: 20, liters: 4 }, { hoursAgo: 20.1, liters: 6 }, { hoursAgo: 2, liters: 5 }]);
  const d = await getDashboard(parseAnalyticsFilter({ range: "7d" }));
  assert.equal(d.kpis.observedLiters, 25);
  assert.equal(d.series.reduce((n, p) => n + (p.liters ?? 0), 0), 25);
  assert.equal(d.series.filter(p => p.liters !== null).length, 3, "duas leituras na mesma hora somam no mesmo ponto");
  assert.equal(d.provenance.samples, 4);
  const day = await getDashboard(parseAnalyticsFilter({ range: "24h" }));
  assert.equal(day.kpis.observedLiters, 15, "24h exclui a leitura de 30 h atrás");
  assert.equal(day.kpis.previousLiters, 10, "período anterior de mesma duração");
  assert.equal(day.kpis.previousSamples, 1);
});

test("T42 filtro de origem separa sensor de simulação e rotula MIXED quando há as duas", async () => {
  await history([{ hoursAgo: 1, liters: 3, source: "DEVICE" }, { hoursAgo: 2, liters: 7, source: "SIMULATED" }]);
  const all = await getDashboard(parseAnalyticsFilter({ range: "24h" }));
  assert.equal(all.provenance.label, "MIXED"); assert.equal(all.kpis.observedLiters, 10);
  const dev = await getDashboard(parseAnalyticsFilter({ range: "24h", source: "DEVICE" }));
  assert.equal(dev.provenance.label, "DEVICE"); assert.equal(dev.kpis.observedLiters, 3);
  const sim = await getDashboard(parseAnalyticsFilter({ range: "24h", source: "SIMULATED" }));
  assert.equal(sim.provenance.label, "SIMULATED"); assert.equal(sim.kpis.observedLiters, 7);
  const none = await getDashboard(parseAnalyticsFilter({ range: "24h", deviceId: "nao-existe" }));
  assert.equal(none.kpis.observedLiters, null, "dispositivo de outro recorte não herda números");
});

test("T43 kg entregues contam só DELIVERED recebido no período; disponível é separado", async () => {
  const base = { organizationId: DEMO_ORG_ID, source: "MANUAL" as const, safetyVerifiedBy: "Ana", safetyVerifiedAt: new Date() };
  await db().donationBatch.createMany({ data: [
    { ...base, description: "entregue hoje", weightKg: 5, status: "DELIVERED", recipientId: DEMO_RECIPIENT_ID, receivedAt: new Date(Date.now() - HOUR) },
    { ...base, description: "entregue há 10 dias", weightKg: 50, status: "DELIVERED", recipientId: DEMO_RECIPIENT_ID, receivedAt: new Date(Date.now() - 240 * HOUR), createdAt: new Date(Date.now() - 241 * HOUR) },
    { ...base, description: "disponível", weightKg: 2, status: "AVAILABLE" },
    { ...base, description: "reservado", weightKg: 3, status: "RESERVED", recipientId: DEMO_RECIPIENT_ID },
    { organizationId: DEMO_ORG_ID, source: "MANUAL", description: "pendente", weightKg: 9, status: "PENDING_REVIEW" },
  ] });
  const d = await getDashboard(parseAnalyticsFilter({ range: "7d" }));
  assert.equal(d.kpis.deliveredKg, 5); assert.equal(d.kpis.deliveredCount, 1);
  assert.equal(d.kpis.availableKg, 5, "AVAILABLE + RESERVED, fora dos entregues");
  assert.equal(d.kpis.pendingReview, 1);
  assert.deepEqual(d.donations.pipeline.map(p => [p.status, p.count]), [["PENDING_REVIEW", 1], ["AVAILABLE", 1], ["RESERVED", 1], ["DELIVERED", 1], ["CANCELLED", 0]]);
  assert.equal((await getDashboard(parseAnalyticsFilter({ range: "30d" }))).kpis.deliveredKg, 55);
});

test("T44 ocorrência da regra vira marcador com janela, e o intervalo clicado devolve leituras + ligação registrada", async () => {
  const ingest = new IngestTelemetry(); const boot = newBootId();
  let opened: string | undefined;
  for (const [seq, ago] of [[0, 45], [1, 30], [2, 15]]) opened = (await ingest.execute(reading(boot, seq, 2.0, ago), DEVICE_KEY)).occurrenceId ?? opened;
  assert.ok(opened);
  const d = await getDashboard(parseAnalyticsFilter({ range: "24h" }));
  const m = d.markers.find(x => x.id === opened);
  assert.ok(m?.windowStart && m.windowEnd, "marcador carrega a janela da evidência");
  assert.equal(d.kpis.activeOccurrences, 1); assert.equal(d.kpis.openedInPeriod, 1);
  assert.equal(d.series.reduce((n, p) => n + p.occurrences, 0), 1);
  assert.deepEqual(d.threshold, { minFlowLpm: 1.5, continuousSeconds: 30 });

  const point = d.series.find(p => p.samples > 0)!;
  const scope = parseAnalyticsFilter({ range: "24h" });
  const iv = await getInterval(scope, new Date(point.t), new Date(point.end));
  assert.equal(iv.totals.samples, point.samples);
  assert.ok(iv.occurrences.some(o => o.id === opened), "ocorrência ligada ao intervalo por fato registrado");

  const empty = await getInterval(scope, new Date(Date.now() - 20 * HOUR), new Date(Date.now() - 19 * HOUR));
  assert.equal(empty.readings.length, 0); assert.deepEqual(empty.occurrences, [], "intervalo sem ocorrência diz isso, sem associar por proximidade");
  await assert.rejects(getInterval(scope, new Date(Date.now() - 48 * HOUR), new Date()), /24 horas/);

  const live = await getLive();
  assert.equal(live.lastReading?.flowLpm, 2); assert.equal(live.activeCount, 1); assert.equal(live.active[0].id, opened);
});
