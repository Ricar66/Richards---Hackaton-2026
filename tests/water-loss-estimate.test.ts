import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateContinuousFlow } from "../src/modules/monitoring/domain/water-loss-estimate";

test("cenário escola 1 L/min, 30 dias, R$ 10/m³", () => {
  assert.deepEqual(estimateContinuousFlow({ flowLpm: 1, hoursPerDay: 24, days: 30, effectiveRateBRLPerM3: 10 }), {
    liters: 43200, cubicMeters: 43.2, estimatedCostBRL: 432,
  });
});
test("cenário 0,5 L/min, 8 h, 20 dias", () => {
  assert.deepEqual(estimateContinuousFlow({ flowLpm: 0.5, hoursPerDay: 8, days: 20, effectiveRateBRLPerM3: 8 }), {
    liters: 4800, cubicMeters: 4.8, estimatedCostBRL: 38.4,
  });
});
test("validação de valores impossíveis", () => {
  for (const s of [
    { flowLpm: -1, hoursPerDay: 24, days: 30, effectiveRateBRLPerM3: 10 },
    { flowLpm: 1, hoursPerDay: 25, days: 30, effectiveRateBRLPerM3: 10 },
    { flowLpm: 1, hoursPerDay: 24, days: 30, effectiveRateBRLPerM3: NaN },
  ]) assert.equal(estimateContinuousFlow(s), null);
});
