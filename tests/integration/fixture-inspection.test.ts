import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { db, resetAndSeed } from "./helpers";
import { DEMO_DEVICE_ID } from "../../src/lib/constants";
import { FixtureInspectionError, requestFixtureInspection } from "../../src/modules/monitoring/application/request-fixture-inspection";

beforeEach(resetAndSeed);
after(() => db().$disconnect());

test("vistoria de 72h sem dados físicos é recusada", async () => {
  await assert.rejects(requestFixtureInspection(DEMO_DEVICE_ID, { dedicated: true, expectedUse: true }, "operador:escola"), FixtureInspectionError);
});
test("vistoria exige declaração explícita de dedicação e ocupação", async () => {
  await assert.rejects(requestFixtureInspection(DEMO_DEVICE_ID, { dedicated: false, expectedUse: true }, "operador:escola"), /Confirme/);
  await assert.rejects(requestFixtureInspection(DEMO_DEVICE_ID, { dedicated: true, expectedUse: false }, "operador:escola"), /Confirme/);
});
test("cria ocorrência manual auditada após cobertura real sem fluxo; não duplica ativa", async () => {
  const now = new Date();
  const base = now.getTime() - 72 * 60 * 60_000;
  const rows = Array.from({ length: 432 }, (_, i) => [0, 1].map(j => ({
    deviceId: DEMO_DEVICE_ID, bootId: "fixture-test", sequence: i * 2 + j,
    source: "DEVICE" as const, capturedAt: new Date(base + i * 600_000 + 25_000 + j * 60_000),
    flowLpm: 0, deltaLiters: 0,
  }))).flat();
  rows.push({ deviceId: DEMO_DEVICE_ID, bootId: "fixture-test", sequence: 865, source: "DEVICE",
    capturedAt: new Date(now.getTime() - 15_000), flowLpm: 0, deltaLiters: 0 });
  await db().telemetryReading.createMany({ data: rows });
  await db().device.update({ where: { id: DEMO_DEVICE_ID }, data: { lastSeenAt: now } });
  const first = await requestFixtureInspection(DEMO_DEVICE_ID, { dedicated: true, expectedUse: true }, "operador:escola");
  assert.equal(first.created, true);
  const again = await requestFixtureInspection(DEMO_DEVICE_ID, { dedicated: true, expectedUse: true }, "operador:escola");
  assert.equal(again.created, false);
  const entry = await db().occurrence.findUniqueOrThrow({ where: { id: first.id } });
  assert.equal(entry.kind, "MANUAL");
  assert.equal(entry.source, "MANUAL");
  assert.match(entry.title, /vistoria/);
  const audit = await db().auditEvent.findFirstOrThrow({ where: { entity: "Occurrence", entityId: entry.id, action: "CREATED" } });
  assert.equal((audit.metadata as Record<string, unknown>).sourceOfEvidence, "DEVICE");
  assert.equal((audit.metadata as Record<string, unknown>).dedicatedDeclared, true);
});
