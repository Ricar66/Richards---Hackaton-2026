import test from "node:test";
import assert from "node:assert/strict";
import { fixtureOf, floorLabel, floorsOf, layoutSchema, template, type WaterLayout } from "../src/modules/water-map/domain/layout";

const KINDS = ["HOUSE", "COMMERCE", "BUILDING", "CONSTRUCTION"] as const;

test("modelos realistas: válidos, em árvore, sem medidor presumido e com peça e tipo de cômodo definidos", () => {
  for (const k of KINDS) {
    const l = template(k);
    assert.ok(layoutSchema.safeParse(l).success, k);
    assert.equal(l.edges.length, l.nodes.length - 1, `${k}: árvore`);
    assert.ok(l.nodes.every(n => n.deviceId === null), `${k}: todo ponto começa não instrumentado`);
    assert.ok(l.nodes.every(n => n.fixture) && l.rooms.every(r => r.type), `${k}: peça e cômodo tipados`);
  }
  assert.equal(template("HOUSE").nodes.length, 9);
  assert.ok(template("COMMERCE").nodes.some(n => n.fixture === "BASIN" && /preparo/i.test(n.label)), "lavatório exclusivo de mãos no preparo (RDC 216)");
});

test("prédio: térreo, 3 andares com 2 apartamentos e cobertura; um hidrômetro individual por apartamento", () => {
  const l = template("BUILDING");
  assert.deepEqual(floorsOf(l), [0, 1, 2, 3, 4]);
  assert.deepEqual(floorsOf(l).map(f => floorLabel(l, f)), ["Térreo", "1º pavimento", "2º pavimento", "3º pavimento", "Cobertura"]);
  const meters = l.nodes.filter(n => n.kind === "JUNCTION" && n.fixture === "HYDROMETER");
  assert.equal(meters.length, 6);
  const tank = l.nodes.find(n => n.fixture === "WATER_TANK")!;
  assert.equal(tank.floor, 4);
  // Cada hidrômetro individual sai da caixa superior e alimenta só os pontos do próprio apartamento (mesmo andar).
  for (const m of meters) {
    assert.ok(l.edges.some(e => e.from === tank.id && e.to === m.id));
    const kids = l.edges.filter(e => e.from === m.id).map(e => l.nodes.find(n => n.id === e.to)!);
    assert.equal(kids.length, 2);
    assert.ok(kids.every(k => k.floor === m.floor));
  }
});

test("planta antiga (sem tipo, pavimento nem peça) continua válida e ganha peça padrão pelo papel do ponto", () => {
  const old: WaterLayout = {
    kind: "HOUSE", rooms: [{ id: "r", label: "Sala", x: .1, y: .1, w: .3, h: .3 }],
    nodes: [{ id: "s", label: "Entrada", kind: "SUPPLY", x: .2, y: .2, deviceId: null }, { id: "j", label: "Coletor", kind: "JUNCTION", x: .25, y: .25, deviceId: null }, { id: "p", label: "Pia", kind: "OUTLET", x: .3, y: .3, deviceId: null }],
    edges: [{ from: "s", to: "j" }, { from: "j", to: "p" }],
  };
  assert.ok(layoutSchema.safeParse(old).success);
  assert.deepEqual(old.nodes.map(fixtureOf), ["HYDROMETER", "MANIFOLD", "TAP"]);
  assert.deepEqual(floorsOf(old), [0]);
  assert.ok(!layoutSchema.safeParse({ ...old, nodes: old.nodes.map(n => ({ ...n, floor: 8 })) }).success, "pavimento acima do limite");
  assert.ok(!layoutSchema.safeParse({ ...old, nodes: old.nodes.map(n => ({ ...n, fixture: "PISCINA" })) }).success, "peça desconhecida");
});
