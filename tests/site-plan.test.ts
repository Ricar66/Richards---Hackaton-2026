import test from "node:test";
import assert from "node:assert/strict";
import { template } from "../src/modules/water-map/domain/layout";
import { fixturePose, FIXTURE_DEPTH, FOOTPRINT, isClear, pipeRoute, planSite, roomRect, roomTypeOf, WALL_T, EXPLODE_STEP, PIPE_Y, type SitePlan } from "../src/components/water-map/three/site-plan";

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
function connected(plan: SitePlan, floor: number) {
  const inside = plan.rooms.filter(r => r.floor === floor && r.type !== "OUTDOOR" && r.type !== "SITE").map(r => r.id);
  const adj = new Map(inside.map(id => [id, new Set<string>()]));
  for (const d of plan.doors.filter(d => d.floor === floor && d.rooms[1])) { adj.get(d.rooms[0])?.add(d.rooms[1]!); adj.get(d.rooms[1]!)?.add(d.rooms[0]); }
  const seen = new Set<string>(), stack = inside.slice(0, 1);
  while (stack.length) { const x = stack.pop()!; if (seen.has(x)) continue; seen.add(x); stack.push(...(adj.get(x) ?? [])); }
  return { inside, seen };
}

test("casa: escala real, portas ligam todos os cômodos internos e há uma entrada pelo quintal", () => {
  const plan = planSite(template("HOUSE"));
  const quarto = plan.rooms.find(r => r.label === "Quarto")!;
  assert.ok(near(quarto.rect.x1 - quarto.rect.x0, 0.27 * FOOTPRINT.HOUSE.w), "quarto com 3,24 m de largura");
  const { inside, seen } = connected(plan, 0);
  assert.equal(seen.size, inside.length, "do quarto se chega a todos os cômodos internos");
  assert.equal(plan.doors.filter(d => d.rooms[1] === null).length, 1, "uma porta de entrada");
  assert.ok(plan.doors.every(d => d.width >= 0.6 && d.width <= 2.4));
  assert.deepEqual(plan.rooms.map(r => r.mat), ["wood", "wood", "porcelain", "bathTile", "bathTile", "grass"]);
});

test("paredes: vão da porta nas DUAS metades da parede compartilhada e nenhuma parede na área externa", () => {
  const plan = planSite(template("HOUSE"));
  const quintal = plan.rooms.find(r => r.type === "OUTDOOR")!.rect;
  assert.ok(!plan.walls.some(w => w.z0 >= quintal.z0 + WALL_T && w.z1 <= quintal.z1 && w.x0 >= quintal.x0 && w.x1 <= quintal.x1), "quintal sem parede");
  for (const d of plan.doors.filter(d => d.rooms[1])) {
    // Nenhuma parede ocupa o centro do vão.
    const blocking = plan.walls.filter(w => w.floor === d.floor && d.x > w.x0 + 1e-3 && d.x < w.x1 - 1e-3 && d.z > w.z0 - 1e-3 && d.z < w.z1 + 1e-3);
    assert.equal(blocking.length, 0, `porta entre ${d.rooms.join(" e ")} sem parede no vão`);
  }
});

test("louças encostam na parede certa, viradas para dentro; torneira de jardim encosta por fora da casa", () => {
  const l = template("HOUSE"), ps = planSite(l).poses;
  const pia = ps.get(l.nodes.find(n => n.label === "Pia da cozinha")!.id)!;
  const cozinha = roomRect("HOUSE", l.rooms.find(r => r.label === "Cozinha")!);
  assert.equal(pia.ry, 0, "fundo da pia na parede do fundo");
  assert.ok(near(pia.z, cozinha.z0 + WALL_T + 0.3), "pia encostada");
  const jardim = ps.get(l.nodes.find(n => n.fixture === "GARDEN_TAP")!.id)!;
  const quintal = roomRect("HOUSE", l.rooms.find(r => r.type === "OUTDOOR")!);
  assert.equal(jardim.ry, 0);
  assert.ok(near(jardim.z, quintal.z0 + FIXTURE_DEPTH.GARDEN_TAP / 2), "encostada na face de fora da parede da casa, incluindo a mangueira na pegada");
  // Peça solta (caixa d'água) não gira nem encosta.
  const caixa = ps.get(l.nodes.find(n => n.fixture === "WATER_TANK")!.id)!;
  assert.equal(caixa.ry, 0);
  // Peça no meio do cômodo, longe das paredes, fica onde está.
  const meio = fixturePose("HOUSE", { ...l.nodes[2], x: .42, y: .3 }, l.rooms);
  assert.equal(meio.ry, 0); assert.ok(near(meio.x, (0.42 - 0.5) * 12));
});

test("móveis nunca ocupam louça nem vão de porta e ficam dentro do cômodo", () => {
  for (const kind of ["HOUSE", "COMMERCE", "BUILDING", "CONSTRUCTION"] as const) {
    const plan = planSite(template(kind));
    assert.ok(plan.items.length > 20, `${kind}: maquete mobiliada (${plan.items.length} peças)`);
    for (const { room, item } of plan.items) {
      if (item.mat === "rug" || item.mat === "net" || item.shape !== "box" || item.mat === "concrete") continue;
      const r = plan.rooms.find(x => x.id === room)!;
      const hx = item.sx / 2, hz = item.sz / 2;
      assert.ok(item.x - hx >= r.rect.x0 - 0.05 && item.x + hx <= r.rect.x1 + 0.05 && item.z - hz >= r.rect.z0 - 0.05 && item.z + hz <= r.rect.z1 + 0.05, `${kind}: ${item.mat} dentro de ${r.label}`);
      for (const p of plan.poses.values()) if (p.room === room && p.fixture !== "WATER_TANK")
        assert.ok(Math.hypot(Math.max(Math.abs(p.x - item.x) - hx, 0), Math.max(Math.abs(p.z - item.z) - hz, 0)) > 0.12, `${kind}: ${item.mat} longe de ${p.fixture}`);
    }
  }
  // isClear recusa sair do cômodo e encostar no obstáculo.
  const rect = { x0: 0, z0: 0, x1: 4, z1: 4 }, base = { kind: "HOUSE" as const, room: template("HOUSE").rooms[0], rect, type: "LIVING" as const };
  assert.equal(isClear({ ...base, obstacles: [] }, 2, 2, 0.5, 0.5), true);
  assert.equal(isClear({ ...base, obstacles: [] }, 0.3, 2, 0.5, 0.5), false);
  assert.equal(isClear({ ...base, obstacles: [{ x: 2, z: 2.7, r: 0.3 }] }, 2, 2, 0.5, 0.5), false, "obstáculo a 0,2 m da borda (< 0,3 + folga)");
  assert.equal(isClear({ ...base, obstacles: [{ x: 2, z: 2.9, r: 0.3 }] }, 2, 2, 0.5, 0.5), true, "a 0,4 m já passa");
});

test("prédio: andares empilhados, banheiro fechado em cada apartamento e prumada vertical até cada hidrômetro", () => {
  const l = template("BUILDING"), plan = planSite(l);
  assert.deepEqual(plan.floors, [0, 1, 2, 3, 4]);
  const aptos = plan.rooms.filter(r => r.type === "APARTMENT");
  assert.equal(aptos.length, 6);
  assert.ok(aptos.every(a => a.bath), "cada apartamento com banheiro fechado no canto do chuveiro");
  const tank = l.nodes.find(n => n.fixture === "WATER_TANK")!;
  for (const m of l.nodes.filter(n => n.kind === "JUNCTION" && n.fixture === "HYDROMETER")) {
    const pts = plan.pipes.find(p => p.from === tank.id && p.to === m.id)!.points;
    assert.ok(near(pts[0].y, 4 * EXPLODE_STEP + PIPE_Y), "sai da cobertura");
    assert.ok(near(pts[1].y, m.floor! * EXPLODE_STEP + PIPE_Y) && near(pts[1].x, pts[0].x) && near(pts[1].z, pts[0].z), "desce na vertical (prumada)");
    // Todo trecho é reto num eixo só.
    for (let i = 1; i < pts.length; i++) {
      const moved = [pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z].filter(v => Math.abs(v) > 1e-6).length;
      assert.equal(moved, 1);
    }
  }
});

test("rota de cano: mesmo andar em L; subir termina na vertical; planta antiga deduz o tipo pelo nome", () => {
  const a = { x: 0, z: 0, ry: 0, floor: 0, fixture: "HYDROMETER" as const, room: null }, b = { ...a, x: 3, z: 2, fixture: "TAP" as const };
  assert.deepEqual(pipeRoute(a, b).map(p => [p.x, p.z]), [[0, 0], [0, 2], [3, 2]]);
  const up = pipeRoute(a, { ...b, floor: 2 });
  assert.equal(up[up.length - 1].y, 2 * EXPLODE_STEP + PIPE_Y);
  assert.equal(up[up.length - 2].y, PIPE_Y);
  assert.equal(roomTypeOf("COMMERCE", { label: "Sanitário de clientes" }), "BATHROOM");
  assert.equal(roomTypeOf("COMMERCE", { label: "Área de operação" }), "SALES");
  assert.equal(roomTypeOf("CONSTRUCTION", { label: "1º pavimento · frente B" }), "SITE");
  assert.equal(roomTypeOf("HOUSE", { label: "Qualquer coisa" }), "LIVING");
});
