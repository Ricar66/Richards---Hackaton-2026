import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUDGET_HOLD_MS, BUDGET_SLOW_30HZ_MS, BUDGET_WARMUP_MS, WATER_MAX_SPEED, WATER_PER_LPM, advancePhase, alarmMode, budgetLimit, budgetRestart, budgetStart,
  contextLossPolicy, digitCells, frameBudgetStep, median, twinCapability, twinSimulated, waterSpeed,
} from "../src/components/stage/stage-logic";

// ---------- água do gêmeo: a mesma conta para o SVG e para o 3D ----------
test("água: velocidade proporcional à vazão MEDIDA; sem leitura, zero, negativo ou NaN = parada", () => {
  assert.equal(waterSpeed(null), 0);
  assert.equal(waterSpeed(0), 0);
  assert.equal(waterSpeed(-2), 0);
  assert.equal(waterSpeed(Number.NaN), 0);
  assert.equal(waterSpeed(2), 2 * WATER_PER_LPM);
  assert.equal(waterSpeed(1000), WATER_MAX_SPEED, "teto: vazão absurda não vira borrão");
});

test("água: fase acumula velocidade × dt e não salta quando a vazão muda", () => {
  let p = 0;
  p = advancePhase(p, 60, 0.016, 46);
  assert.ok(Math.abs(p - 0.96) < 1e-9);
  // Vazão muda de 2 para 8 L/min: a fase continua de onde estava (só o ritmo muda).
  const before = p;
  p = advancePhase(p, waterSpeed(8), 0.016, 46);
  assert.ok(p > before && p - before < 5, "um quadro anda pouco, nunca salta");
  // Volta do laço sem emenda, sempre no intervalo [0, período).
  assert.ok(Math.abs(advancePhase(45, 100, 0.02, 46) - 1) < 1e-9);
  // dt grande (aba voltou do fundo) é limitado a 0,1 s; dt negativo ou NaN não anda para trás.
  assert.equal(advancePhase(0, 100, 5, 46), 10);
  assert.equal(advancePhase(3, 100, -1, 46), 3);
  assert.equal(advancePhase(3, 100, Number.NaN, 46), 3);
  assert.equal(advancePhase(3, 0, 0.5, 46), 3, "sem vazão a água não se mexe");
});

// ---------- alarme ISA-18.2 ----------
test("alarme: pisca com ocorrência aberta do próprio sensor, fixo depois de assumida, nada sem ocorrência", () => {
  assert.equal(alarmMode("OCORRENCIA_ABERTA", "OPEN", false), "pulse");
  assert.equal(alarmMode("OCORRENCIA_ABERTA", null, false), "pulse", "sem snapshot ainda: acabou de abrir, é OPEN");
  assert.equal(alarmMode("OCORRENCIA_ABERTA", "ACKNOWLEDGED", false), "steady");
  assert.equal(alarmMode("BLOQUEADO_REGRA_5", "OPEN", false), "pulse", "ocorrência ativa do mesmo sensor bloqueando a regra");
  assert.equal(alarmMode("BLOQUEADO_REGRA_5", "ACKNOWLEDGED", false), "steady");
  for (const s of ["OBSERVANDO", "CONTANDO", "INTERROMPIDO"] as const) assert.equal(alarmMode(s, "OPEN", false), null, s);
});

test("alarme: ocorrência de OUTRA origem não acende o cano (o selo dela fica no anel)", () => {
  assert.equal(alarmMode("OCORRENCIA_ABERTA", "OPEN", true), null);
  assert.equal(alarmMode("BLOQUEADO_REGRA_5", "ACKNOWLEDGED", true), null);
});

// ---------- troca de dígito ----------
test("dígitos: primeiro valor não anima; depois só a posição que mudou, alinhada à direita", () => {
  assert.deepEqual(digitCells(null, "1,85").map(c => c.changed), [false, false, false, false]);
  const cells = digitCells("1,85", "1,92");
  assert.deepEqual(cells.map(c => c.ch).join(""), "1,92");
  assert.deepEqual(cells.map(c => c.changed), [false, false, true, true]);
  assert.deepEqual(cells.map(c => c.prev), ["1", ",", "8", "5"]);
});

test("dígitos: número que cresce compara centésimo com centésimo; a posição nova não tem anterior", () => {
  const cells = digitCells("9,85", "12,85");
  assert.deepEqual(cells.map(c => [c.ch, c.prev, c.changed]), [["1", null, true], ["2", "9", true], [",", ",", false], ["8", "8", false], ["5", "5", false]]);
});

test("dígitos: o texto exibido é sempre o valor novo inteiro (nunca um intermediário)", () => {
  for (const [a, b] of [["—", "0,43"], ["0,43", "—"], ["6,0", "12,25"], ["2", "1"], ["1.234,5", "999,9"]] as const)
    assert.equal(digitCells(a, b).map(c => c.ch).join(""), b);
  assert.deepEqual(digitCells("3", "3").map(c => c.changed), [false]);
});

// ---------- gêmeo 3D: cadeia de reserva ----------
const GPU = { webgl2: true, caveatOk: true, renderer: "ANGLE (Intel, Intel(R) Graphics (0x0000A7AC) Direct3D11 vs_5_0 ps_5_0, D3D11)" };
test("3D: chave desligada vence; depois reduzir movimento; depois sem WebGL2; depois software", () => {
  assert.equal(twinCapability({ ...GPU, flag: false, reduced: true }), "off");
  assert.equal(twinCapability({ ...GPU, flag: true, reduced: true }), "reduced");
  assert.equal(twinCapability({ ...GPU, webgl2: false, flag: true, reduced: false }), "no-webgl");
  assert.equal(twinCapability({ ...GPU, caveatOk: false, flag: true, reduced: false }), "software", "failIfMajorPerformanceCaveat recusou");
  for (const r of ["ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11)", "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))", "llvmpipe (LLVM 15.0.7, 256 bits)"])
    assert.equal(twinCapability({ webgl2: true, caveatOk: true, renderer: r, flag: true, reduced: false }), "software", r);
  assert.equal(twinCapability({ ...GPU, flag: true, reduced: false }), "ok");
  assert.equal(twinCapability({ ...GPU, renderer: null, flag: true, reduced: false }), "ok", "sem o nome do renderer, vale a recusa do caveat");
});

test("3D: orçamento ignora o aquecimento, grava a cadência, desce um nível por vez com 3 s lentos e nunca sobe", () => {
  let s = budgetStart(0);
  s = frameBudgetStep(s, BUDGET_WARMUP_MS - 1, 80);
  assert.equal(s.baseMs, null, "aquecimento ignorado");
  s = frameBudgetStep(s, 1000, 16.7); assert.equal(s.baseMs, 16.7, "cadência-base de 60 Hz");
  s = frameBudgetStep(s, 1100, 25); assert.equal(s.slowSince, 1100);
  s = frameBudgetStep(s, 1100 + BUDGET_HOLD_MS - 1, 25); assert.equal(s.level, 0);
  s = frameBudgetStep(s, 1100 + BUDGET_HOLD_MS, 25); assert.equal(s.level, 1, "DPR 1");
  const t1 = 1100 + BUDGET_HOLD_MS;
  assert.equal(s.slowSince, null); assert.equal(s.baseMs, null, "aquece de novo depois de descer");
  s = frameBudgetStep(s, t1 + 1000, 16.7); s = frameBudgetStep(s, t1 + 1100, 25); s = frameBudgetStep(s, t1 + 1100 + BUDGET_HOLD_MS, 25);
  assert.equal(s.level, 2, "volta ao SVG");
  assert.equal(frameBudgetStep(s, t1 + 99_999, 5).level, 2, "não volta sozinho");
  let ok = budgetStart(0);
  ok = frameBudgetStep(ok, 1000, 16.7); ok = frameBudgetStep(ok, 1500, 25); ok = frameBudgetStep(ok, 2000, 12);
  assert.equal(ok.slowSince, null, "um quadro bom zera a contagem");
  assert.equal(frameBudgetStep(ok, 9000, Number.NaN).level, 0, "sem amostra não decide");
  assert.equal(median([3, 1, 2]), 2); assert.equal(median([4, 1, 3, 2]), 2.5); assert.ok(Number.isNaN(median([])));
});

test("3D: tela de 30 Hz não derruba o 3D com a GPU ociosa; já lento no aquecimento cai", () => {
  let s = budgetStart(0);
  s = frameBudgetStep(s, 1000, 33.3); assert.equal(s.baseMs, 33.3);
  assert.equal(budgetLimit(s.baseMs), BUDGET_SLOW_30HZ_MS);
  for (let t = 1100; t <= 1100 + 3 * BUDGET_HOLD_MS; t += 500) s = frameBudgetStep(s, t, 33.4);
  assert.equal(s.level, 0, "33 ms numa tela de 30 Hz é a cadência, não lentidão");
  for (let t = 20_000; t <= 20_000 + BUDGET_HOLD_MS + 500; t += 500) s = frameBudgetStep(s, t, 50);
  assert.equal(s.level, 1, "abaixo de 24 fps numa tela de 30 Hz desce");
  let slow = budgetStart(0);
  slow = frameBudgetStep(slow, 1000, 45);
  assert.equal(budgetLimit(slow.baseMs), 20, "já nasce lento: limite de 60 Hz");
  const r = budgetRestart({ level: 1, startedAt: 0, slowSince: 500, baseMs: 16.7 }, 9000);
  assert.deepEqual(r, { level: 1, startedAt: 9000, slowSince: null, baseMs: null }, "retomar mantém o nível e aquece de novo");
});

test("gêmeo: carimbo de simulado também pela ocorrência que acende o alarme", () => {
  assert.equal(twinSimulated(true, null, null), true, "leitura simulada");
  assert.equal(twinSimulated(false, "pulse", "SIMULATED"), true, "ocorrência do seed aberta sem leitura recente");
  assert.equal(twinSimulated(false, "steady", "SIMULATED"), true);
  assert.equal(twinSimulated(false, "pulse", "DEVICE"), false);
  assert.equal(twinSimulated(false, null, "SIMULATED"), false, "sem alarme no cano, o selo fica só no anel");
});

test("3D: 1ª perda de contexto remonta; 2 perdas em 60 s ficam no SVG", () => {
  assert.equal(contextLossPolicy([1000], 1000), "remount");
  assert.equal(contextLossPolicy([1000, 30_000], 30_000), "stay-svg");
  assert.equal(contextLossPolicy([1000, 70_000], 70_000), "remount", "a primeira já saiu da janela");
});
