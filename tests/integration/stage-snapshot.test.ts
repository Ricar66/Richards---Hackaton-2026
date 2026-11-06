import { DEVICE_CODE, db, newBootId, resetAndSeed } from "./helpers";
import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { getStageSnapshot } from "../../src/modules/analytics/application/get-stage-snapshot";
import { floorToBucket } from "../../src/modules/analytics/domain/analytics-filter";
import { DonationService } from "../../src/modules/donations/application/donation-service";
import { OccurrenceService } from "../../src/modules/monitoring/application/occurrence-service";
import { ingestReading } from "../../src/modules/monitoring/application/ingest-telemetry";
import { DEMO_DEVICE_ID, DEMO_ORG_ID, DEMO_RECIPIENT_ID, DEMO_SITE_ID } from "../../src/lib/constants";

const donations = new DonationService();
beforeEach(resetAndSeed);
after(() => db().$disconnect());

const device = () => db().device.findUniqueOrThrow({ where: { id: DEMO_DEVICE_ID } });

async function deliver(description: string, kg: number, receivedBy: string) {
  const { id } = await donations.create({ description, weightKg: kg }, "operador:ricardo");
  await donations.transition(id, { status: "AVAILABLE", verifiedBy: "Verificadora Sanitária Ana" }, "operador:ricardo");
  await donations.transition(id, { status: "RESERVED", recipientId: DEMO_RECIPIENT_ID }, "operador:ricardo");
  await donations.transition(id, { status: "DELIVERED", receivedBy }, "operador:ricardo");
  return id;
}

test("snapshot do palco: kg de hoje pela data de recebimento, sem quem recebeu, sem usuário do operador", async () => {
  const now = new Date();
  const today = await deliver("Hortaliças de teste", 4.25, "Maria Recebedora");
  const yesterday = await deliver("Pães de ontem", 9, "Joana Recebedora");
  // Recebido antes da meia-noite de São Paulo: não conta em "hoje".
  await db().donationBatch.update({ where: { id: yesterday }, data: { receivedAt: new Date(floorToBucket(now, "1d").getTime() - 60_000) } });
  await donations.create({ description: "Frutas aguardando", weightKg: 2 }, "operador:ricardo");

  const s = await getStageSnapshot(new Date());
  assert.equal(s.today.deliveredKg.value, 4.25);
  assert.equal(s.today.deliveredKg.provenance, "MANUAL");
  assert.equal(s.today.deliveredBatches, 1);
  assert.equal(s.today.pendingReview.value, 1);
  assert.equal(s.organization.name, "Org de teste");
  const json = JSON.stringify(s);
  assert.doesNotMatch(json, /Maria Recebedora|Joana Recebedora/, "quem recebeu não vai para o telão");
  assert.doesNotMatch(json, /Verificadora Sanitária/, "quem verificou também não");
  assert.doesNotMatch(json, /ricardo/, "o usuário do operador (metade da Basic Auth) não vai para o telão");
  const deliveredLine = s.audit.find(a => a.entityId === today && a.action === "DELIVERED");
  assert.equal(deliveredLine?.institution, "Receptor de teste", "a instituição aparece");
  assert.equal(deliveredLine?.actor, "operador");
  assert.ok(s.audit.length <= 12);
  assert.ok(s.audit.every((a, i) => i === 0 || a.at <= s.audit[i - 1].at), "mais novo primeiro");
});

test("snapshot do palco: leituras dos últimos 180 s e regra reavaliada como na ingestão", async () => {
  const d = await device();
  const boot = newBootId();
  const t = (secondsAgo: number) => new Date(Date.now() - secondsAgo * 1000);
  await db().telemetryReading.create({ data: { deviceId: d.id, bootId: boot, sequence: 0, flowLpm: 2, deltaLiters: 0.5, capturedAt: t(400), source: "SIMULATED" } });
  let seq = 1;
  for (const ago of [24, 18, 12, 6, 0]) await ingestReading(d, { bootId: boot, sequence: seq++, flowLpm: 2.4, deltaLiters: 0.24, capturedAt: t(ago) }, "SIMULATED", "bancada-virtual");

  const s = await getStageSnapshot(new Date());
  assert.equal(s.readings.length, 5, "a leitura de 400 s atrás fica fora da janela");
  assert.ok(s.readings.every(r => r.source === "SIMULATED" && r.deviceId === d.id));
  const dev = s.devices.find(x => x.code === DEVICE_CODE)!;
  assert.equal(dev.connectivity, "ONLINE");
  assert.ok(dev.rule, "regra calculada");
  assert.equal(dev.rule!.sequence, 5);
  assert.ok(Math.abs(dev.rule!.observedSeconds - 24) < 1, `observado ${dev.rule!.observedSeconds}`);
  assert.equal(dev.rule!.suspicious, false, "24 s de 30 s: ainda contando");
});

test("snapshot do palco: ocorrências ativas com origem e lote da balança aguardando verificação", async () => {
  const d = await device();
  const open = await db().occurrence.create({ data: { organizationId: DEMO_ORG_ID, siteId: DEMO_SITE_ID, deviceId: d.id, kind: "UNUSUAL_FLOW", severity: "HIGH", status: "OPEN", source: "SIMULATED", title: "Fluxo de teste", description: "teste" } });
  const done = await db().occurrence.create({ data: { organizationId: DEMO_ORG_ID, siteId: DEMO_SITE_ID, deviceId: d.id, kind: "TEMPERATURE_EXCURSION", severity: "MEDIUM", status: "OPEN", source: "DEVICE", title: "Temperatura de teste", description: "teste" } });
  await new OccurrenceService().transition(done.id, "RESOLVED", "Verificado na bancada de teste", "operador:Fulano Silva");
  await donations.createFromScale({ organizationId: DEMO_ORG_ID, deviceId: d.id, deviceCode: d.code, weightKg: 6.2, source: "SIMULATED", evidence: { channel: "bancada-virtual" } }, `simulador:${d.code}`);

  const s = await getStageSnapshot(new Date());
  assert.deepEqual(s.activeOccurrences.map(o => o.id), [open.id]);
  assert.equal(s.activeOccurrences[0].deviceCode, DEVICE_CODE);
  assert.deepEqual(s.today.activeOccurrences, { value: 1, provenance: "SIMULATED", sources: [{ source: "SIMULATED", value: 1 }] });
  assert.equal(s.pendingScaleLots.length, 1);
  assert.equal(s.pendingScaleLots[0].deviceCode, DEVICE_CODE);
  assert.equal(s.pendingScaleLots[0].kg, 6.2);
  const resolved = s.audit.find(a => a.entityId === done.id && a.action === "RESOLVED");
  assert.equal(resolved?.title, "Temperatura de teste");
  assert.equal(resolved?.actor, "operador", "usuário com espaço sai inteiro (antes ficava 'operador Silva')");
  assert.doesNotMatch(JSON.stringify(s), /Fulano|Silva/);
});
