import { DEVICE_KEY, db, newBootId, reading, resetAndSeed } from "./helpers";
import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { IngestTelemetry } from "../../src/modules/monitoring/application/ingest-telemetry";
import { getOccurrenceDetail } from "../../src/modules/monitoring/application/get-occurrence-detail";
import { openFlowOccurrence } from "../../src/modules/monitoring/application/open-flow-occurrence";
import { OccurrenceService } from "../../src/modules/monitoring/application/occurrence-service";
import { getOverview } from "../../src/modules/analytics/application/get-overview";
import { DEMO_DEVICE_ID, DEMO_ORG_ID, DEMO_SITE_ID } from "../../src/lib/constants";

const ingest = new IngestTelemetry();
beforeEach(resetAndSeed);
after(() => db().$disconnect());

test("T23 detalhe traz as leituras da janela que abriu o alerta, a timeline e o acompanhamento", async () => {
  const boot = newBootId();
  let opened: string | undefined;
  for (const [seq, ago] of [[0, 45], [1, 30], [2, 15]]) opened = (await ingest.execute(reading(boot, seq, 2.0, ago), DEVICE_KEY)).occurrenceId ?? opened;
  await ingest.execute(reading(boot, 3, 0.2, 0), DEVICE_KEY);
  assert.ok(opened, "a terceira leitura abre a ocorrência");
  await new OccurrenceService().transition(opened!, "ACKNOWLEDGED", "", "operador:ana");

  const d = await getOccurrenceDetail(opened!);
  assert.ok(d.evidence, "ocorrência aberta pela regra tem janela registrada");
  assert.deepEqual(d.evidence!.readings.map(r => r.sequence), [0, 1, 2]);
  assert.deepEqual(d.evidence!.rule, { minFlowLpm: 1.5, continuousSeconds: 30 });
  assert.equal(d.evidence!.totals.samples, 3);
  assert.equal(d.evidence!.totals.liters, 1.5);
  assert.equal(d.evidence!.totals.maxFlowLpm, 2);
  assert.deepEqual(d.evidence!.followUp.map(r => r.flowLpm), [0.2], "leitura depois da abertura aparece como acompanhamento");
  assert.deepEqual(d.timeline.map(e => [e.action, e.actor]), [["CREATED", "dispositivo:TEST-FLOW-001"], ["ACKNOWLEDGED", "operador:ana"]]);
  assert.equal(d.device?.connectivity, "ONLINE");
});

test("T22 sem janela registrada não há evidência inventada", async () => {
  const boot = newBootId();
  await ingest.execute(reading(boot, 0, 2.0, 10), DEVICE_KEY, true);   // leitura existe, mas a ocorrência não veio da regra
  const { occurrenceId } = await openFlowOccurrence({ organizationId: DEMO_ORG_ID, siteId: DEMO_SITE_ID, deviceId: DEMO_DEVICE_ID, source: "SIMULATED", title: "Botão de simulação", description: "x", suspectedLiters: 3.6, eventNote: "teste", actor: "simulador:teste", evidence: { scenario: "flow" } });
  const d = await getOccurrenceDetail(occurrenceId);
  assert.equal(d.evidence, null);
  assert.match(d.evidenceNote, /Nenhuma leitura é associada/);
});

test("detalhe de ocorrência inexistente → NOT_FOUND", async () => {
  await assert.rejects(getOccurrenceDetail("nao-existe"), /NOT_FOUND/);
});

test("telemetria não sobrescreve MAINTENANCE; overview calcula conectividade", async () => {
  assert.equal((await getOverview()).devices[0].state, "NEVER_SEEN");
  await ingest.execute(reading(newBootId(), 0, 0.5), DEVICE_KEY);
  assert.equal((await getOverview()).devices[0].state, "ONLINE");
  await db().device.update({ where: { id: DEMO_DEVICE_ID }, data: { state: "MAINTENANCE" } });
  await ingest.execute(reading(newBootId(), 0, 0.5), DEVICE_KEY);
  assert.equal((await db().device.findUniqueOrThrow({ where: { id: DEMO_DEVICE_ID } })).state, "MAINTENANCE");
  assert.equal((await getOverview()).devices[0].state, "MAINTENANCE");
});
