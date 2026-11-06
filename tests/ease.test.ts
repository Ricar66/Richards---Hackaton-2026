import { test } from "node:test";
import assert from "node:assert/strict";
import { easedValue, frameDelta, progress } from "../src/lib/ease";

test("KPI animado: quadro com tempo ANTERIOR ao início não empurra o número para fora do intervalo (A2b, 6.231 → 904)", () => {
  // O 1º quadro do rAF pode vir alguns ms antes do performance.now() do efeito. Sem a trava: 6.231 + 5.327 × 0,041 = 6.450,3.
  for (const early of [-1, -4.3, -16, -100]) {
    const v = easedValue(6231, 904, early);
    assert.equal(v, 6231, `${early} ms: fica no valor antigo, não sobe para ${v}`);
  }
  for (const [from, to] of [[6231, 904], [904, 6231], [8.5, 4.4], [0, 12]]) {
    let prev = from;
    for (let t = -20; t <= 340; t += 4) {
      const v = easedValue(from, to, t);
      assert.ok(v >= Math.min(from, to) && v <= Math.max(from, to), `${from}→${to} em ${t} ms: ${v} fora do intervalo`);
      assert.ok(to >= from ? v >= prev : v <= prev, `${from}→${to} em ${t} ms: ida e volta (${prev} → ${v})`);
      prev = v;
    }
    assert.equal(easedValue(from, to, 320), to);
  }
});

test("laço de quadro: delta nunca negativo (a água não anda para trás) e com teto", () => {
  assert.equal(frameDelta(1000, 1004.3), 0);
  assert.ok(Math.abs(frameDelta(1016.7, 1000) - 0.0167) < 1e-9);
  assert.equal(frameDelta(5000, 1000), 0.1);
  assert.equal(progress(-5, 700), 0); assert.equal(progress(350, 700), 0.5); assert.equal(progress(900, 700), 1);
});
