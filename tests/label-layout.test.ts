import test from "node:test";
import assert from "node:assert/strict";
import { fitLabelAnchor, hit, labelRect, layoutLabels, type LabelInput } from "../src/components/water-map/label-layout";

const L = (id: string, x: number, y: number, priority = 400, selected = false): LabelInput => ({ id, x, y, title: `Ponto ${id}`, sub: "não instrumentado", priority, selected });

test("selecionado: nome cabe nas bordas do celular, abaixo dos comandos, sem mover o ponto 3D", () => {
  for (const width of [264, 304, 390, 900]) for (const x of [-100, 0, width, width + 100]) for (const y of [-200, 0, 500]) {
    const l = L("a", x, y, 0, true), original = { ...l }, p = fitLabelAnchor(l, width, 430, 150);
    const rect = labelRect({ ...l, ...p }, "full");
    assert.ok(rect.x0 >= 7 && rect.x1 <= width - 7 && rect.y0 >= 150 && rect.y1 <= 390);
    assert.deepEqual(l, original);
  }
});

test("rótulos: separados ficam cheios; nenhum ponto some (no pior caso vira ponto colorido)", () => {
  const m = layoutLabels([L("a", 100, 200), L("b", 500, 200)], { narrow: false });
  assert.equal(m.get("a"), "full"); assert.equal(m.get("b"), "full");
  const crowd = layoutLabels([L("a", 300, 200, 1), L("b", 305, 202, 2), L("c", 310, 204, 3)], { narrow: false });
  assert.deepEqual([...crowd.values()].sort(), ["dot", "dot", "full"], "o mais importante leva o rótulo; os outros continuam visíveis");
  assert.equal(crowd.get("a"), "full");
});

test("rótulos: selecionado sempre cheio, mesmo no meio da multidão; tela estreita fica só com números", () => {
  const m = layoutLabels([L("a", 300, 200, 1), L("b", 304, 200, 9, true)], { narrow: false });
  assert.equal(m.get("b"), "full");
  assert.notEqual(m.get("a"), "full");
  const n = layoutLabels([L("a", 100, 200), L("b", 400, 200)], { narrow: true });
  assert.deepEqual([...n.values()], ["mini", "mini"]);
});

test("rótulos: faixa reservada (barra de ferramentas e etiquetas de pavimento) não recebe rótulo cheio", () => {
  const m = layoutLabels([L("a", 300, 40)], { narrow: false, reserved: [{ x0: 0, y0: 0, x1: 1000, y1: 46 }] });
  assert.equal(m.get("a"), "dot");
  // Retângulos coerentes com o CSS: cheio acima da âncora e centrado; número também.
  const r = labelRect({ x: 100, y: 100, title: "Pia", sub: "2,4 L/min" }, "full");
  assert.ok(r.y1 === 100 && r.y0 < 100 && Math.abs((r.x0 + r.x1) / 2 - 100) < 1e-9);
  assert.ok(hit(r, { x0: 99, y0: 90, x1: 101, y1: 95 }) && !hit(r, { x0: 99, y0: 101, x1: 101, y1: 110 }));
});
