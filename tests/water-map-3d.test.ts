import test from "node:test";
import assert from "node:assert/strict";
import { stripeSpeed, toWorld, MAP_W, MAP_D } from "../src/components/water-map/three/map-scene";

test("mapa 3D: a faixa só anda com vazão medida acima de zero e acompanha a leitura, com teto", () => {
  assert.equal(stripeSpeed(null), 0, "sem leitura = parado");
  assert.equal(stripeSpeed(0), 0, "zero real = parado");
  assert.equal(stripeSpeed(-1), 0, "valor inválido = parado");
  assert.equal(stripeSpeed(Number.NaN), 0);
  assert.ok(stripeSpeed(0.5) > 0 && stripeSpeed(2.4) > stripeSpeed(0.5), "mais vazão, faixa mais rápida");
  assert.equal(stripeSpeed(500), 2.4, "teto para não piscar");
});

test("mapa 3D: a planta normalizada vira coordenadas do mundo centradas na laje", () => {
  assert.deepEqual(toWorld(0.5, 0.5), { x: 0, z: 0 });
  assert.deepEqual(toWorld(0, 0), { x: -MAP_W / 2, z: -MAP_D / 2 });
  assert.deepEqual(toWorld(1, 1), { x: MAP_W / 2, z: MAP_D / 2 });
});
