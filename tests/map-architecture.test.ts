import test from "node:test";
import assert from "node:assert/strict";
import { Box3, Mesh, MeshStandardMaterial, PerspectiveCamera, Raycaster, Vector3 } from "three";
import { FIXTURES, template } from "../src/modules/water-map/domain/layout";
import { architecture, CEILING_H, floorElevation, upperWallVisible } from "../src/components/water-map/three/architecture";
import { fitCamera } from "../src/components/water-map/three/camera-fit";
import { fixtureModel, type FixtureMaterial } from "../src/components/water-map/three/fixture-model";
import { buildingDetails } from "../src/components/water-map/three/model-details";
import { EXPLODE_STEP, FIXTURE_DEPTH, FIXTURE_WIDTH, planSite, WALL_H, type Mat } from "../src/components/water-map/three/site-plan";

const kinds = ["HOUSE", "COMMERCE", "BUILDING", "CONSTRUCTION"] as const;

test("arquitetura: quatro plantas com volume finito, vãos de porta livres até 2,1 m e corte separado", () => {
  for (const kind of kinds) {
    const layout = template(kind), before = JSON.stringify(layout), plan = planSite(layout), walls = architecture(plan);
    assert.equal(JSON.stringify(layout), before, `${kind}: renderização não altera o cadastro`);
    for (const wall of walls) {
      for (const [list, upper] of [[wall.lower, false], [wall.upper, true]] as const) for (const part of list) {
        assert.ok(Object.values(part).filter(v => typeof v === "number").every(Number.isFinite), `${kind}: nenhuma geometria NaN`);
        assert.ok(part.sx > 0 && part.sy > 0 && part.sz > 0);
        assert.ok(part.y - part.sy / 2 >= -1e-6 && part.y + part.sy / 2 <= CEILING_H + 0.03);
        if (upper) assert.ok(part.y - part.sy / 2 >= WALL_H - 0.031);
      }
    }
    // O centro do vão, antes da folha girada, continua transitável. Não basta desenhar uma porta sobre uma parede.
    for (const door of plan.doors) for (const y of [0.4, 1, 1.7, 2.05]) {
      const blocking = walls.flatMap(w => w.floor === door.floor ? [...w.lower, ...w.upper] : []).filter(b => b.material === "plaster" || b.material === "tile").some(b => Math.abs(door.x - b.x) < b.sx / 2 - 1e-5 && Math.abs(door.z - b.z) < b.sz / 2 - 1e-5 && Math.abs(y - b.y) < b.sy / 2 - 1e-5);
      assert.equal(blocking, false, `${kind}: vão livre a ${y} m`);
    }
    if (kind !== "CONSTRUCTION") assert.ok(walls.some(w => w.outward && w.upper.some(b => b.material === "glass")), `${kind}: janelas com vidro na altura real`);
  }
});

test("corte: fachadas próximas abrem, fundo permanece inteiro, tangência não pisca, volume reúne os andares", () => {
  assert.equal(upperWallVisible("inspection", { x: 0, z: 1 }, { x: 0, z: 10 }), false);
  assert.equal(upperWallVisible("inspection", { x: 0, z: -1 }, { x: 0, z: 10 }), true);
  assert.equal(upperWallVisible("inspection", null, { x: 0, z: 10 }), false);
  assert.equal(upperWallVisible("volume", null, { x: 0, z: 10 }), true);
  assert.equal(upperWallVisible("inspection", { x: 1, z: 0 }, { x: 0.01, z: 10 }, true), true);
  assert.equal(upperWallVisible("inspection", { x: 1, z: 0 }, { x: -0.01, z: 10 }, false), false);
  assert.equal(floorElevation(3, "volume"), 9);
  assert.equal(floorElevation(3, "inspection"), 3 * EXPLODE_STEP);
});

test("câmera: quatro modelos, desktop/retrato e três vistas mantêm o conteúdo dentro do quadro", () => {
  for (const kind of kinds) for (const mode of ["inspection", "volume"] as const) {
    const plan = planSite(template(kind)), pts: Vector3[] = [];
    for (const floor of plan.floors) for (const x of [-10, 10]) for (const z of [-6, 6]) for (const h of [-0.6, 3.2]) pts.push(new Vector3(x, floorElevation(floor, mode) + h, z));
    for (const aspect of [2.1, 1.5, 1, 0.7, 0.45]) for (const preset of ["inspection", "volume", "top"] as const) {
      const fit = fitCamera(pts, aspect, preset, plan.floors.length > 1, 32, aspect < 1 ? { top: 160, height: 430 } : undefined), c = new PerspectiveCamera(32, aspect, 0.01, 10000);
      c.position.copy(fit.position); c.lookAt(fit.target); c.updateMatrixWorld();
      assert.ok(Number.isFinite(fit.distance) && fit.distance > 0);
      for (const p of pts) {
        const v = p.clone().project(c);
        assert.ok(Math.abs(v.x) <= fit.limits.side + 1e-6 && v.y <= fit.limits.top + 1e-6 && v.y >= -fit.limits.bottom - 1e-6, `${kind}/${mode}/${preset}/${aspect}: conteúdo recortado`);
      }
    }
  }
});

const material = new MeshStandardMaterial();
// A geometria não lê propriedades dos materiais; um único material basta no teste sem DOM/GPU.
const palette = new Proxy({}, { get: () => material }) as Record<Mat, MeshStandardMaterial>;
const fixturePalette = new Proxy({}, { get: () => material }) as Record<FixtureMaterial, MeshStandardMaterial>;

test("15 peças: malhas finitas, normais/UV válidas, âncora acima da peça e orçamento de triângulos limitado", () => {
  for (const kind of kinds) for (const fixture of FIXTURES) {
    const model = fixtureModel(fixture, kind, 0, palette, fixturePalette), bounds = new Box3();
    let triangles = 0;
    for (const part of model.parts) {
      const pos = part.geo.attributes.position;
      assert.ok(Array.from(pos.array).every(Number.isFinite), `${fixture}: posição finita`);
      assert.ok(Array.from(part.geo.attributes.normal.array).every(Number.isFinite), `${fixture}: normal finita`);
      assert.ok(part.geo.attributes.uv);
      triangles += (part.geo.index?.count ?? pos.count) / 3;
      part.geo.computeBoundingBox(); bounds.union(part.geo.boundingBox!.clone().applyMatrix4(part.m));
      part.geo.dispose();
    }
    assert.ok(bounds.max.y <= model.top + 0.035, `${fixture}: o rótulo ficaria dentro da peça (${bounds.max.y} > ${model.top})`);
    assert.ok(bounds.min.y >= -0.06, `${fixture}: peça abaixo da laje`);
    assert.ok(bounds.max.x <= FIXTURE_WIDTH[fixture] / 2 + 0.06 && bounds.min.x >= -FIXTURE_WIDTH[fixture] / 2 - 0.06, `${fixture}: largura diferente do obstáculo planejado`);
    assert.ok(bounds.max.z <= FIXTURE_DEPTH[fixture] / 2 + 0.06 && bounds.min.z >= -FIXTURE_DEPTH[fixture] / 2 - 0.06, `${fixture}: profundidade diferente do obstáculo planejado`);
    assert.ok(triangles < 13000, `${fixture}: ${triangles} triângulos`);
  }
});

test("louças: raio vertical entra na cuba e encontra o fundo, sem plano tampando a cavidade", () => {
  for (const [fixture, z, ceiling] of [["KITCHEN_SINK", 0.02, 0.83], ["PREP_SINK", 0.03, 0.8], ["BASIN", 0.02, 0.8], ["TANK", 0.015, 0.78], ["TOILET", 0.055, 0.37]] as const) {
    const model = fixtureModel(fixture, "HOUSE", 0, palette, fixturePalette);
    const meshes = model.parts.map(p => { const m = new Mesh(p.geo, p.mat); m.applyMatrix4(p.m); m.updateMatrixWorld(); return m; });
    const ray = new Raycaster(new Vector3(0, 3, z), new Vector3(0, -1, 0));
    const hits = ray.intersectObjects(meshes);
    assert.ok(hits.length && hits[0].point.y < ceiling, `${fixture}: cuba tampada a ${hits[0]?.point.y} m`);
    for (const p of model.parts) p.geo.dispose();
  }
});

test("prédio: nova circulação deixa espaço para os hidrômetros; planta antiga estreita não ganha escada sobre os pontos", () => {
  const layout = template("BUILDING"), plan = planSite(layout), items = buildingDetails(plan);
  assert.ok(items.length > 30);
  for (const { floor, item } of items.filter(v => v.item.mat === "concrete")) for (const p of plan.poses.values()) if (p.floor === floor) {
    assert.ok(Math.abs(p.x - item.x) > FIXTURE_WIDTH[p.fixture] / 2 + item.sx / 2 || Math.abs(p.z - item.z) > FIXTURE_DEPTH[p.fixture] / 2 + item.sz / 2, "escada sobre medidor/louça");
  }
  const old = template("BUILDING"); old.rooms = old.rooms.map(r => r.type !== "APARTMENT" ? r : r.x < 0.5 ? { ...r, w: 0.43 } : { ...r, x: 0.54, w: 0.43 });
  assert.equal(buildingDetails(planSite(old)).length, 0);
});
