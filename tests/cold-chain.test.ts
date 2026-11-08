import test from "node:test";
import assert from "node:assert/strict";
import { complianceSummary, DEFAULT_RANGE, equipmentRange, equipmentState, inRange, rangeText, shouldPersist, type TempSample } from "../src/modules/cold-chain/domain/cold-chain";

const T0 = new Date("2026-11-08T12:00:00Z");
const at = (s: number) => new Date(T0.getTime() + s * 1000);

test("faixas na letra da RDC 216: refrigerado < 5 °C, congelado ≤ −18 °C, quente > 60 °C", () => {
  assert.equal(inRange(4.9, DEFAULT_RANGE.REFRIGERATOR), true);
  assert.equal(inRange(5, DEFAULT_RANGE.REFRIGERATOR), false, "'inferiores a 5 ºC': 5,0 já está fora");
  assert.equal(inRange(-18, DEFAULT_RANGE.FREEZER), true, "'igual ou inferior a -18 ºC'");
  assert.equal(inRange(-17.9, DEFAULT_RANGE.FREEZER), false);
  assert.equal(inRange(60, DEFAULT_RANGE.HOT_HOLDING), false, "'superior a 60 ºC': 60,0 já está fora");
  assert.equal(inRange(60.1, DEFAULT_RANGE.HOT_HOLDING), true);
  assert.equal(inRange(Number.NaN, DEFAULT_RANGE.AMBIENT), false);
  assert.equal(rangeText(DEFAULT_RANGE.REFRIGERATOR), "abaixo de 5 °C");
  assert.equal(rangeText(DEFAULT_RANGE.FREEZER), "−18 °C ou menos");
  assert.equal(rangeText(DEFAULT_RANGE.HOT_HOLDING), "acima de 60 °C");
});

test("limite próprio só vale se for mais rigoroso que a norma (nunca afrouxa a geladeira)", () => {
  assert.equal(equipmentRange("REFRIGERATOR", { maxC: 8 }).maxC, 5, "8 °C seria mais frouxo: ignorado");
  const strict = equipmentRange("REFRIGERATOR", { maxC: 4 });
  assert.equal(strict.maxC, 4); assert.equal(inRange(4, strict), true); assert.match(strict.reference, /mais rigoroso/);
  assert.equal(equipmentRange("HOT_HOLDING", { minC: 55 }).minC, 60, "55 °C seria mais frouxo no quente");
  assert.equal(equipmentRange("AMBIENT", { maxC: 25 }).maxC, 25, "ambiente: vale a faixa do estabelecimento");
});

test("resumo pondera pelo tempo e não transforma buraco em 'dentro da faixa'", () => {
  const r = DEFAULT_RANGE.REFRIGERATOR;
  // 0–60 s: 3 °C; 60–120 s: 7 °C (fora); depois nada por 1 h.
  const s: TempSample[] = [{ at: at(0), c: 3 }, { at: at(60), c: 7 }];
  const sum = complianceSummary(s, r, at(0), at(3600), 600);
  assert.equal(sum.coveredSeconds, 60 + 600, "a última amostra vale no máximo 10 min");
  assert.equal(sum.inRangeSeconds, 60);
  assert.equal(sum.outRangeSeconds, 600);
  assert.equal(sum.inRangePct, Math.round((60 / 660) * 1000) / 10);
  assert.ok(sum.coveragePct < 20, "o resto da hora é sem dado");
  assert.equal(sum.excursions.length, 1);
  assert.equal(sum.excursions[0].seconds, 600);
  assert.equal(sum.excursions[0].peakC, 7);
  assert.equal(sum.excursions[0].ongoing, false, "acabou no buraco: não se afirma que continuou fora");
});

test("sem amostra não há porcentagem; amostra anterior à janela cobre o começo", () => {
  const r = DEFAULT_RANGE.REFRIGERATOR;
  assert.equal(complianceSummary([], r, at(0), at(600)).inRangePct, null);
  const sum = complianceSummary([{ at: at(-30), c: 2 }], r, at(0), at(600), 600);
  assert.equal(sum.coveredSeconds, 570, "vale até 10 min depois de ser lida, cortada no início da janela");
  assert.equal(sum.samples, 0, "a amostra de antes não conta como amostra da janela");
  assert.equal(sum.inRangePct, 100);
});

test("excursão em andamento no fim da janela e pico pelo lado certo (quente = mais frio)", () => {
  const hot = DEFAULT_RANGE.HOT_HOLDING;
  const sum = complianceSummary([{ at: at(0), c: 65 }, { at: at(60), c: 58 }, { at: at(120), c: 55 }], hot, at(0), at(180), 600);
  assert.equal(sum.excursions.length, 1);
  assert.equal(sum.excursions[0].peakC, 55);
  assert.equal(sum.excursions[0].ongoing, true);
  assert.equal(sum.excursions[0].seconds, 120);
});

test("estado atual e decisão de gravar", () => {
  const r = DEFAULT_RANGE.REFRIGERATOR;
  assert.equal(equipmentState(null, r, at(0)), "NO_DATA");
  assert.equal(equipmentState({ at: at(0), c: 3 }, r, at(601), 600), "NO_DATA", "leitura velha não é 'ok'");
  assert.equal(equipmentState({ at: at(0), c: 6 }, r, at(30)), "OUT_OF_RANGE");
  assert.equal(shouldPersist(undefined, at(0), true, 60), true, "primeira leitura sempre");
  assert.equal(shouldPersist({ at: at(0), inRange: true }, at(30), true, 60), false, "dentro do minuto e sem mudança: não grava");
  assert.equal(shouldPersist({ at: at(0), inRange: true }, at(30), false, 60), true, "saiu da faixa: grava na hora");
  assert.equal(shouldPersist({ at: at(0), inRange: true }, at(60), true, 60), true, "passou o minuto: grava");
});
