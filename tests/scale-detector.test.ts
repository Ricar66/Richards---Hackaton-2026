import { test } from "node:test";
import assert from "node:assert/strict";
import { ScaleSurplusDetector } from "../src/modules/monitoring/domain/scale-surplus-detector";

/**
 * "Estável" na balança (07/11): acima do gatilho E sem saltos além de max(0,15 kg; 5%). Com o gatilho de 1,5 kg da
 * HX711 de 5 kg, a leitura parcial enquanto o objeto é colocado não pode virar o peso do lote.
 */
const T0 = Date.parse("2026-11-07T10:00:00Z");
function feed(values: number[], minKg = 1.5, stable = 6, stepS = 2) {
  const d = new ScaleSurplusDetector(minKg, stable);
  return values.map((v, i) => d.push({ at: new Date(T0 + i * stepS * 1000), value: v }));
}
const lot = (out: ReturnType<typeof feed>) => out.map((o, i) => (o.trigger ? { at: i * 2, kg: o.weightKg } : null)).filter(Boolean);

test("balança: caixa colocada em etapas (3,1 kg parcial → 6,06 kg) vira lote de 6,0 kg, não de 3,1 kg", () => {
  assert.deepEqual(lot(feed([0, 3.1, 6.06, 6.06, 6.07, 6.06, 6.06])), [{ at: 10, kg: 6.0 }],
    "o salto de 3,1 para 6,06 reinicia a contagem; o lote sai 6 s depois do peso assentar");
});

test("balança: ruído normal da HX711 (±0,05 kg) conta como estável e o peso é a menor leitura, arredondada para baixo", () => {
  assert.deepEqual(lot(feed([0, 2.03, 1.98, 2.05, 2.0])), [{ at: 8, kg: 1.9 }]);
});

test("balança: carregamento gradual (+0,4 kg a cada leitura) não dispara enquanto não assenta", () => {
  const out = feed([0, 1.6, 2.0, 2.4, 2.8, 3.2, 3.6, 4.0]);
  assert.equal(out.some(o => o.trigger), false, "cada leitura salta além da tolerância: nunca 6 s estável");
});

test("balança: 1,5 kg da bancada física dispara com o gatilho padrão; abaixo de 1,5 kg, não", () => {
  assert.deepEqual(lot(feed([0, 1.52, 1.52, 1.53, 1.52])), [{ at: 8, kg: 1.5 }]);
  assert.equal(feed([0, 1.4, 1.4, 1.4, 1.4, 1.4]).some(o => o.trigger), false);
});
