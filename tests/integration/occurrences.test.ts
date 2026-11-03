import { db, resetAndSeed } from "./helpers";
import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { OccurrenceService } from "../../src/modules/monitoring/application/occurrence-service";
import { openFlowOccurrence } from "../../src/modules/monitoring/application/open-flow-occurrence";
import { DEMO_DEVICE_ID, DEMO_ORG_ID, DEMO_SITE_ID } from "../../src/lib/constants";

const service = new OccurrenceService();
const open = () => openFlowOccurrence({
  organizationId: DEMO_ORG_ID, siteId: DEMO_SITE_ID, deviceId: DEMO_DEVICE_ID, source: "SIMULATED",
  title: "Teste", description: "Ocorrência de teste", suspectedLiters: 1, eventNote: "teste", actor: "simulador:teste", evidence: {},
});
beforeEach(resetAndSeed);
after(() => db().$disconnect());

test("T13 ACK e RESOLVE ficam na timeline e na auditoria com quem executou", async () => {
  const { occurrenceId: id } = await open();
  await service.transition(id, "ACKNOWLEDGED", "", "operador:ana");
  await service.transition(id, "RESOLVED", "Registro fechado após inspeção", "operador:bia");
  const occ = await db().occurrence.findUniqueOrThrow({ where: { id }, include: { events: { orderBy: { at: "asc" } } } });
  assert.equal(occ.status, "RESOLVED");
  assert.ok(occ.acknowledgedAt && occ.resolvedAt);
  assert.equal(occ.verificationNote, "Registro fechado após inspeção");
  assert.deepEqual(occ.events.map(e => [e.action, e.actor]), [["CREATED", "simulador:teste"], ["ACKNOWLEDGED", "operador:ana"], ["RESOLVED", "operador:bia"]]);
  const audit = await db().auditEvent.findMany({ where: { entityId: id }, orderBy: { at: "asc" } });
  assert.deepEqual(audit.map(a => [a.action, (a.metadata as { actor: string }).actor]), [["CREATED", "simulador:teste"], ["ACKNOWLEDGED", "operador:ana"], ["RESOLVED", "operador:bia"]]);
});

test("T14 RESOLVE sem nota é recusado e nada muda", async () => {
  const { occurrenceId: id } = await open();
  await assert.rejects(service.transition(id, "RESOLVED", "  ok ", "operador:ana"), /RESOLUTION_NOTE_REQUIRED/);
  assert.equal((await db().occurrence.findUniqueOrThrow({ where: { id } })).status, "OPEN");
  assert.equal(await db().occurrenceEvent.count({ where: { occurrenceId: id } }), 1);
});

test("transição inválida e ocorrência inexistente", async () => {
  const { occurrenceId: id } = await open();
  await service.transition(id, "DISMISSED", "Alarme de teste descartado", "operador:ana");
  await assert.rejects(service.transition(id, "ACKNOWLEDGED", "", "operador:ana"), /INVALID_TRANSITION/);
  await assert.rejects(service.transition("nao-existe", "ACKNOWLEDGED", "", "operador:ana"), /NOT_FOUND/);
});

test("dois RESOLVE simultâneos: só um vence, um único evento na timeline", async () => {
  const { occurrenceId: id } = await open();
  const results = await Promise.allSettled([
    service.transition(id, "RESOLVED", "Primeira resolução registrada", "operador:ana"),
    service.transition(id, "RESOLVED", "Segunda resolução registrada", "operador:bia"),
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const lost = results.find(r => r.status === "rejected") as PromiseRejectedResult;
  assert.match(String(lost.reason), /CONFLICT|INVALID_TRANSITION/);
  assert.equal(await db().occurrenceEvent.count({ where: { occurrenceId: id, action: "RESOLVED" } }), 1);
});

test("10 aberturas simultâneas para o mesmo sensor criam uma ocorrência só", async () => {
  const results = await Promise.all(Array.from({ length: 10 }, open));
  assert.equal(results.filter(r => r.created).length, 1);
  assert.equal(new Set(results.map(r => r.occurrenceId)).size, 1);
  assert.equal(await db().occurrence.count(), 1);
});
