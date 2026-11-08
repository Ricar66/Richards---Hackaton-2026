import { FOOTPRINT, type Item, type Mat, type SitePlan } from "./site-plan";

/** Detalhes discretos, em metros; nunca cria equipamento instrumentado ou número de operação. */
export function furnitureDetails(it: Item): Item[] {
  if (it.shape !== "box" || it.ry) return [];
  const out: Item[] = [];
  const box = (mat: Mat, x: number, y: number, z: number, sx: number, sy: number, sz: number) => out.push({ shape: "box", mat, x, y, z, sx, sy, sz });
  if (["woodLight", "woodDark", "white"].includes(it.mat) && it.sy >= 0.42 && it.sy <= 1.2 && it.sx >= 0.55 && it.sz >= 0.35) {
    const front = it.z + it.sz / 2 + 0.004, bottom = it.y - it.sy / 2;
    box("black", it.x, bottom + 0.035, front - 0.015, it.sx - 0.055, 0.055, 0.015);
    const n = Math.max(1, Math.round(it.sx / 0.6));
    for (let k = 1; k < n; k++) box("woodDark", it.x - it.sx / 2 + it.sx * k / n, it.y + 0.015, front, 0.004, it.sy - 0.1, 0.004);
    for (let k = 0; k < n; k++) box("steel", it.x - it.sx / 2 + it.sx * (k + 0.5) / n, it.y + it.sy * 0.24, front + 0.016, Math.min(0.14, it.sx / n * 0.4), 0.014, 0.024);
  }
  if (it.mat === "cardboard" && it.sy > 0.25) {
    box("woodLight", it.x, it.y + it.sy / 2 + 0.001, it.z, 0.055, 0.003, it.sz);
    box("white", it.x + it.sx * 0.15, it.y + 0.02, it.z + it.sz / 2 + 0.001, it.sx * 0.3, it.sy * 0.25, 0.003);
  }
  if (it.mat === "fabric" && it.sy > 0.3 && it.sz > 0.6 && it.sx > 1.3) {
    for (const dx of [-it.sx * 0.35, it.sx * 0.35]) for (const dz of [-it.sz * 0.32, it.sz * 0.32]) box("black", it.x + dx, 0.04, it.z + dz, 0.035, 0.08, 0.035);
    box("fabricDark", it.x, it.y + it.sy / 2 + 0.001, it.z + 0.04, 0.008, 0.004, it.sz * 0.7);
  }
  return out;
}

/** Circulação central e guarda-corpo do prédio, separados com os andares (a distância explodida é ilustrativa). */
export function buildingDetails(plan: SitePlan): { floor: number; item: Item }[] {
  if (plan.kind !== "BUILDING") return [];
  const out: { floor: number; item: Item }[] = [];
  const box = (floor: number, mat: Mat, x: number, y: number, z: number, sx: number, sy: number, sz: number) => out.push({ floor, item: { shape: "box", mat, x, y, z, sx, sy, sz } });
  const fp = FOOTPRINT.BUILDING;
  for (const floor of plan.floors) {
    const rooms = plan.rooms.filter(r => r.floor === floor);
    if (!rooms.some(r => r.type === "APARTMENT")) continue;
    const left = rooms.filter(r => r.rect.x1 <= 0).map(r => r.rect.x1), right = rooms.filter(r => r.rect.x0 >= 0).map(r => r.rect.x0);
    if (!left.length || !right.length || Math.min(...right) - Math.max(...left) < 2.1) continue;
    // Só insere no vão central existente. Planta editada que ocupou o vão não recebe escada presumida.
    if (rooms.some(r => r.rect.x0 < 1 && r.rect.x1 > 0.1 && r.rect.z0 < 2 && r.rect.z1 > -2.5)) continue;
    const steps = 16, tread = 0.25, rise = 0.175;
    for (let s = 0; s < steps; s++) box(floor, "concrete", 0.55, rise * (s + 1) / 2, 1.7 - s * tread, 0.88, rise * (s + 1), tread);
    // Patamar e corrimãos acompanham a inclinação; acima da escada, a próxima laje está afastada para inspeção.
    box(floor, "stone", 0.55, 2.82, -2.3, 0.96, 0.06, 0.55);
    for (const side of [-1, 1]) for (let s = 0; s < steps; s += 3) box(floor, "steel", 0.55 + side * 0.43, rise * (s + 1) + 0.48, 1.7 - s * tread, 0.025, 0.96, 0.025);
    // Piso de circulação: não herda madeira de um apartamento vizinho.
    box(floor, "tile", 0, 0.006, fp.d * 0.35, 0.98, 0.012, 1.3);
  }
  return out;
}
