import { DEVICE_KEY, db, newBootId, reading, resetAndSeed } from "./helpers";
import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { IngestTelemetry } from "../../src/modules/monitoring/application/ingest-telemetry";
import { DEMO_DEVICE_ID } from "../../src/lib/constants";

const ingest = new IngestTelemetry();
const readingsOf = (bootId: string) => db().telemetryReading.findMany({ where: { bootId } });
const activeFlowOccurrences = () => db().occurrence.findMany({ where: { deviceId: DEMO_DEVICE_ID, kind: "UNUSUAL_FLOW", status: { in: ["OPEN", "ACKNOWLEDGED"] } } });
beforeEach(resetAndSeed);
after(() => db().$disconnect());

test("T04 leitura válida é gravada com origem DEVICE; com header de simulador vira SIMULATED", async () => {
  const boot = newBootId();
  assert.deepEqual(await ingest.execute(reading(boot, 0, 0.5), DEVICE_KEY), {
    accepted: true, duplicate: false, alerted: false,
    rule: { minFlowLpm: 1.5, continuousSeconds: 30, observedSeconds: 0, suspicious: false },
  });
  await ingest.execute(reading(boot, 1, 0.5), DEVICE_KEY, true);
  const rows = await db().telemetryReading.findMany({ where: { bootId: boot }, orderBy: { sequence: "asc" } });
  assert.deepEqual(rows.map(r => r.source), ["DEVICE", "SIMULATED"]);
  assert.ok((await db().device.findUniqueOrThrow({ where: { id: DEMO_DEVICE_ID } })).lastSeenAt);
});

test("T05 chave inválida é recusada e nada é gravado", async () => {
  const boot = newBootId();
  await assert.rejects(ingest.execute(reading(boot, 0, 1), "chave-errada"), /NOT_AUTHORIZED/);
  await assert.rejects(ingest.execute(reading(boot, 0, 1), ""), /NOT_AUTHORIZED/);
  assert.equal((await readingsOf(boot)).length, 0);
});

test("relógio fora da tolerância de 5 min é recusado", async () => {
  const boot = newBootId();
  await assert.rejects(ingest.execute(reading(boot, 0, 1, 10 * 60), DEVICE_KEY), /CLOCK_SKEW/);
  assert.equal((await readingsOf(boot)).length, 0);
});

test("T07 retentativa com mesmo bootId+sequence não soma volume", async () => {
  const boot = newBootId();
  await ingest.execute(reading(boot, 7, 1), DEVICE_KEY);
  const again = await ingest.execute(reading(boot, 7, 1), DEVICE_KEY);
  assert.equal(again.duplicate, true);
  const rows = await readingsOf(boot);
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].deltaLiters), 0.25);
});

test("T08 20 requisições idênticas simultâneas: uma leitura, nenhuma falha", async () => {
  const boot = newBootId();
  const payload = reading(boot, 3, 1);
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => ingest.execute(payload, DEVICE_KEY)));
  assert.equal(results.filter(r => r.status === "rejected").length, 0, "nenhuma requisição pode falhar por corrida");
  const ok = results.map(r => (r as PromiseFulfilledResult<{ duplicate: boolean }>).value);
  assert.equal(ok.filter(r => !r.duplicate).length, 1);
  assert.equal((await readingsOf(boot)).length, 1);
});

test("T30 reinício do ESP32 (novo bootId) reaproveita sequence sem colisão", async () => {
  const [a, b] = [newBootId(), newBootId()];
  await ingest.execute(reading(a, 0, 1), DEVICE_KEY);
  const r = await ingest.execute(reading(b, 0, 1), DEVICE_KEY);
  assert.equal(r.duplicate, false);
  assert.equal(await db().telemetryReading.count({ where: { bootId: { in: [a, b] } } }), 2);
});

test("T09 fluxo persistente abaixo do limiar não abre ocorrência", async () => {
  const boot = newBootId();
  for (const [seq, ago] of [[0, 45], [1, 30], [2, 15], [3, 0]]) await ingest.execute(reading(boot, seq, 1.0, ago), DEVICE_KEY);
  assert.equal((await activeFlowOccurrences()).length, 0);
});

test("T10 fluxo persistente acima do limiar abre UMA ocorrência com timeline e auditoria", async () => {
  const boot = newBootId();
  const results = [];
  for (const [seq, ago] of [[0, 45], [1, 30], [2, 15], [3, 0]]) results.push(await ingest.execute(reading(boot, seq, 2.0, ago), DEVICE_KEY));
  assert.deepEqual(results.map(r => r.alerted), [false, false, true, false], "abre quando a janela atinge 30 s e não repete");
  const occ = await activeFlowOccurrences();
  assert.equal(occ.length, 1);
  assert.equal(occ[0].source, "DEVICE");
  assert.equal(results[3].occurrenceId, occ[0].id, "leituras seguintes apontam para a ocorrência ativa");
  const events = await db().occurrenceEvent.findMany({ where: { occurrenceId: occ[0].id } });
  assert.deepEqual(events.map(e => [e.action, e.actor]), [["CREATED", "dispositivo:TEST-FLOW-001"]]);
  const audit = await db().auditEvent.findMany({ where: { entityId: occ[0].id } });
  assert.equal(audit.length, 1);
  const meta = audit[0].metadata as Record<string, unknown>;
  assert.equal(meta.actor, "dispositivo:TEST-FLOW-001");
  assert.ok(meta.windowStart && meta.windowEnd, "auditoria guarda a janela de leituras que motivou o alerta");
});

test("T11 fluxo interrompido reinicia a janela", async () => {
  const boot = newBootId();
  for (const [seq, flow, ago] of [[0, 2, 45], [1, 2, 30], [2, 0.1, 15], [3, 2, 0]]) await ingest.execute(reading(boot, seq, flow, ago), DEVICE_KEY);
  assert.equal((await activeFlowOccurrences()).length, 0);
});

test("T12 leituras simultâneas suspeitas não abrem ocorrências duplicadas", async () => {
  const boot = newBootId();
  await ingest.execute(reading(boot, 0, 2, 30), DEVICE_KEY);
  await ingest.execute(reading(boot, 1, 2, 15), DEVICE_KEY);
  const burst = await Promise.all(Array.from({ length: 10 }, (_, i) => ingest.execute(reading(boot, 10 + i, 2, 0), DEVICE_KEY)));
  assert.equal(burst.filter(r => r.alerted).length, 1);
  assert.equal((await activeFlowOccurrences()).length, 1);
});

test("histórico SIMULATED não sustenta alerta de DEVICE", async () => {
  const boot = newBootId();
  await ingest.execute(reading(boot, 0, 2, 40), DEVICE_KEY, true);
  await ingest.execute(reading(boot, 1, 2, 25), DEVICE_KEY, true);
  const r = await ingest.execute(reading(boot, 2, 2, 0), DEVICE_KEY);
  assert.equal(r.alerted, false);
  assert.equal((await activeFlowOccurrences()).length, 0);
});

test("ocorrência aberta por leituras simuladas registra actor de simulador", async () => {
  const boot = newBootId();
  for (const [seq, ago] of [[0, 45], [1, 30], [2, 15]]) await ingest.execute(reading(boot, seq, 2.0, ago), DEVICE_KEY, true);
  const [occ] = await activeFlowOccurrences();
  assert.equal(occ.source, "SIMULATED");
  const events = await db().occurrenceEvent.findMany({ where: { occurrenceId: occ.id } });
  assert.equal(events[0].actor, "simulador:TEST-FLOW-001");
});
