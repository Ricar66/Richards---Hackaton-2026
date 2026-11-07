import { DEVICE_KEY, db, newBootId, reading, resetAndSeed } from "./helpers";
import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { IngestTelemetry } from "../../src/modules/monitoring/application/ingest-telemetry";
import { openFlowOccurrence } from "../../src/modules/monitoring/application/open-flow-occurrence";
import { DEMO_DEVICE_ID, DEMO_ORG_ID, DEMO_SITE_ID } from "../../src/lib/constants";

/**
 * Fase 4 da auditoria final: modo real × demonstração. A regra 5 vale por dispositivo, tipo e ORIGEM (como a
 * FlowAlertPolicy, que já não mistura leitura simulada com real): simulado nunca bloqueia real, nem o contrário,
 * e duas ocorrências REAIS ativas do mesmo dispositivo e tipo continuam impossíveis.
 */
const ingest = new IngestTelemetry();
const active = (source?: "DEVICE" | "SIMULATED") => db().occurrence.findMany({ where: { deviceId: DEMO_DEVICE_ID, kind: "UNUSUAL_FLOW", status: { in: ["OPEN", "ACKNOWLEDGED"] }, ...(source ? { source } : {}) } });
async function suspicious(simulated: boolean) {
  const boot = newBootId();
  const rs = [];
  for (const [seq, ago] of [[0, 45], [1, 30], [2, 15]]) rs.push(await ingest.execute(reading(boot, seq, 2.0, ago), DEVICE_KEY, simulated));
  return rs[2];
}
const simulateButton = () => openFlowOccurrence({ organizationId: DEMO_ORG_ID, siteId: DEMO_SITE_ID, deviceId: DEMO_DEVICE_ID, source: "SIMULATED", title: "Alerta de demonstração", description: "x", suspectedLiters: 3.6, eventNote: "teste", actor: "simulador:teste", evidence: { scenario: "flow" } });

beforeEach(resetAndSeed);
after(() => db().$disconnect());

test("I4.1 ocorrência SIMULADA ativa (seed/botão) não impede o sensor REAL de abrir a dele", async () => {
  const sim = await simulateButton();
  assert.equal(sim.created, true);
  const real = await suspicious(false);
  assert.equal(real.alerted, true, "o sensor real abre a ocorrência dele");
  assert.notEqual(real.occurrenceId, sim.occurrenceId);
  assert.equal((await active("DEVICE")).length, 1);
  assert.equal((await active("SIMULATED")).length, 1);
});

test("I4.2 nunca duas ocorrências REAIS ativas: duas sessões do sensor real em rajada concorrente = uma", async () => {
  const [a, b] = [newBootId(), newBootId()];
  for (const boot of [a, b]) for (const [seq, ago] of [[0, 45], [1, 30]]) await ingest.execute(reading(boot, seq, 2.0, ago), DEVICE_KEY);
  const burst = await Promise.all([a, b].flatMap(boot => Array.from({ length: 5 }, (_, i) => ingest.execute(reading(boot, 10 + i, 2.0, 0), DEVICE_KEY))));
  assert.equal(burst.filter(r => r.alerted).length, 1);
  assert.equal((await active("DEVICE")).length, 1);
  assert.equal((await active()).length, 1);
});

test("I4.3 ocorrência REAL ativa não impede a demonstração; I4.4 simulada da mesma origem bloqueia a simulada", async () => {
  const real = await suspicious(false);
  assert.equal(real.alerted, true);
  const sim = await suspicious(true);
  assert.equal(sim.alerted, true, "a bancada/simulador abre a dela, carimbada SIMULATED");
  assert.equal((await active("SIMULATED"))[0].source, "SIMULATED");
  const sim2 = await suspicious(true);
  assert.equal(sim2.alerted, false, "regra 5 continua valendo dentro da mesma origem");
  assert.equal(sim2.occurrenceId, sim.occurrenceId);
  const button = await simulateButton();
  assert.equal(button.created, false, "o botão Simular alerta respeita a simulada ativa");
});
