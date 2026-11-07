import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { db, resetAndSeed, DEVICE_CODE } from "./helpers";
import { DEMO_DEVICE_ID } from "../../src/lib/constants";
import { getFixtureActivity } from "../../src/modules/monitoring/application/get-fixture-activity";

beforeEach(resetAndSeed);
after(() => db().$disconnect());

test("sem amostras reais: no data, não uma descarga inativa", async () => {
  await db().device.update({ where: { id: DEMO_DEVICE_ID }, data: { lastSeenAt: new Date() } });
  const x = await getFixtureActivity();
  assert.equal(x.items.length, 1);
  assert.equal(x.items[0].deviceCode, DEVICE_CODE);
  assert.equal(x.items[0].source, "DEVICE");
  assert.equal(x.items[0].state, "INSUFFICIENT_DATA");
});

test("72h de amostras zeradas DEVICE permitem análise; simulação não conta", async () => {
  const now = new Date();
  const from = now.getTime() - 72 * 60 * 60_000;
  // Duas leituras a cada bloco de 10 minutos em 72 h: cobertura temporal explícita.
  const samples = Array.from({ length: 432 }, (_, i) => [0, 1].map(j => ({
    deviceId: DEMO_DEVICE_ID, bootId: "fixture-real", sequence: i * 2 + j,
    source: "DEVICE" as const, capturedAt: new Date(from + i * 600_000 + 30_000 + j * 60_000),
    flowLpm: 0, deltaLiters: 0,
  }))).flat();
  await db().telemetryReading.createMany({ data: samples });
  await db().telemetryReading.create({ data: {
    deviceId: DEMO_DEVICE_ID, bootId: "fixture-real", sequence: 865, source: "DEVICE",
    capturedAt: new Date(now.getTime() - 25_000), flowLpm: 0, deltaLiters: 0,
  } });
  await db().device.update({ where: { id: DEMO_DEVICE_ID }, data: { lastSeenAt: now } });
  const res = await getFixtureActivity({}, now);
  assert.equal(res.items[0].state, "NO_FLOW_OBSERVED");
  assert.equal(res.items[0].flowSamples, 0);
  assert.ok(res.items[0].coveragePercent >= 99);
  await db().telemetryReading.create({ data: {
    deviceId: DEMO_DEVICE_ID, bootId: "fixture-simulated", sequence: 1, source: "SIMULATED",
    capturedAt: new Date(now.getTime() - 20_000), flowLpm: 4, deltaLiters: 1,
  } });
  assert.equal((await getFixtureActivity({}, now)).items[0].state, "NO_FLOW_OBSERVED", "SIMULATED não pode virar acionamento real");
  await db().telemetryReading.create({ data: {
    deviceId: DEMO_DEVICE_ID, bootId: "fixture-real", sequence: 900, source: "DEVICE",
    capturedAt: new Date(now.getTime() - 10_000), flowLpm: 2, deltaLiters: 0.5,
  } });
  assert.equal((await getFixtureActivity({}, now)).items[0].state, "FLOW_OBSERVED");
  await db().device.update({ where: { id: DEMO_DEVICE_ID }, data: { lastSeenAt: new Date(now.getTime() - 200_000) } });
  assert.equal((await getFixtureActivity({}, now)).items[0].state, "NO_SIGNAL", "sensor offline não permite inferir inatividade");
});

test("simulação pode marcar dispositivo ONLINE, mas não provar que o sensor físico está comunicando", async () => {
  const now = new Date();
  await db().device.update({ where: { id: DEMO_DEVICE_ID }, data: { lastSeenAt: now } });
  await db().telemetryReading.create({ data: {
    deviceId: DEMO_DEVICE_ID, bootId: "fixture-virtual", sequence: 1, source: "SIMULATED",
    capturedAt: new Date(now.getTime() - 15_000), flowLpm: 0, deltaLiters: 0,
  } });
  assert.equal((await getFixtureActivity({}, now)).items[0].state, "NO_SIGNAL");
});
