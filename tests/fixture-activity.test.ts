import { test } from "node:test";
import assert from "node:assert/strict";
import { assessFixtureActivity, FLOW_EVENT_THRESHOLD_LPM } from "../src/modules/monitoring/domain/fixture-activity-policy";

const clean = { connectivity: "ONLINE" as const, samples: 9_600, coveredBuckets: 432, flowSamples: 0 };
test("72 horas com telemetria física contínua e sem vazão: só observação de ausência de fluxo", () => {
  assert.deepEqual(assessFixtureActivity(clean), { state: "NO_FLOW_OBSERVED", coveragePercent: 100, expectedBuckets: 432 });
});
test("um acionamento observado impede classificar ausência de fluxo", () => {
  assert.equal(assessFixtureActivity({ ...clean, flowSamples: 1 }).state, "FLOW_OBSERVED");
});
test("sensor offline nunca vira descarga sem uso", () => {
  assert.equal(assessFixtureActivity({ ...clean, connectivity: "OFFLINE" }).state, "NO_SIGNAL");
  assert.equal(assessFixtureActivity({ ...clean, connectivity: "MAINTENANCE" }).state, "NO_SIGNAL");
});
test("lacunas e amostragem insuficiente são dados insuficientes", () => {
  assert.equal(assessFixtureActivity({ ...clean, coveredBuckets: 100 }).state, "INSUFFICIENT_DATA");
  assert.equal(assessFixtureActivity({ ...clean, samples: 250 }).state, "INSUFFICIENT_DATA");
});
test("limiar de evento não é o mesmo limiar de vazamento", () => {
  assert.equal(FLOW_EVENT_THRESHOLD_LPM, 0.2);
  assert.throws(() => assessFixtureActivity({ ...clean, hours: 0 }), /Janela/);
});
