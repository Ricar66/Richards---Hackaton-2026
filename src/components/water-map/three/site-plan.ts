/**
 * Planejador PURO da maquete 3D (sem three.js): escala em metros, portas, paredes com vão, pose de cada louça,
 * traçado dos canos e móveis por tipo de cômodo. O construtor (site-scene.ts) só transforma isto em malhas.
 * Móveis e louças são ilustrativos: representam o TIPO do ponto e do cômodo, não a peça real.
 */
import { fixtureOf, floorOf, type Fixture, type LayoutNode, type LayoutRoom, type RoomType, type WaterLayout } from "@/modules/water-map/domain/layout";

export type Kind = WaterLayout["kind"];
/** Planta de cada tipo em metros (mesma proporção da planta 2D, ~1,58). */
export const FOOTPRINT: Record<Kind, { w: number; d: number }> = {
  HOUSE: { w: 12, d: 7.6 }, COMMERCE: { w: 18, d: 11.4 }, BUILDING: { w: 13, d: 8.2 }, CONSTRUCTION: { w: 13, d: 8.2 },
};
/** Paredes cortadas na altura do peito (planta humanizada): dá para ver os ambientes por dentro. */
export const WALL_H = 1.2, WALL_T = 0.075, SLAB_T = 0.22, PIPE_Y = 0.1;
/** Distância entre lajes na vista do prédio inteiro: maior que a real (~3 m) para enxergar dentro de cada andar
 * (com a câmera a ~29°, uma laje de 8,2 m de fundo deixa o andar de baixo à vista a partir de ~4,5 m). */
export const EXPLODE_STEP = 4.4;
export const floorY = (f: number) => f * EXPLODE_STEP;

export const toMeters = (kind: Kind, x: number, y: number) => { const f = FOOTPRINT[kind]; return { x: (x - 0.5) * f.w, z: (y - 0.5) * f.d }; };
export type Rect = { x0: number; z0: number; x1: number; z1: number };
export function roomRect(kind: Kind, r: Pick<LayoutRoom, "x" | "y" | "w" | "h">): Rect {
  const a = toMeters(kind, r.x, r.y), b = toMeters(kind, r.x + r.w, r.y + r.h);
  return { x0: a.x, z0: a.z, x1: b.x, z1: b.z };
}

/** Tipo do cômodo; planta antiga (sem tipo) é deduzida pelo nome, e no fim pelo tipo do lugar. */
export function roomTypeOf(kind: Kind, r: Pick<LayoutRoom, "type" | "label">): RoomType {
  if (r.type) return r.type;
  const s = r.label.toLocaleLowerCase("pt-BR");
  const has = (...w: string[]) => w.some(x => s.includes(x));
  if (has("banh", "sanit", "lavabo", "vestiár")) return "BATHROOM";
  if (has("cozinha", "preparo", "copa")) return "KITCHEN";
  if (has("serviço", "limpeza", "lavander")) return "LAUNDRY";
  if (has("canteiro", "laje", "pavimento", "frente")) return kind === "CONSTRUCTION" ? "SITE" : "APARTMENT";
  if (has("extern", "quintal", "jardim", "calçada", "acesso")) return "OUTDOOR";
  if (has("estoque", "depósito")) return "STOCK";
  if (has("venda", "operação", "loja", "salão")) return "SALES";
  if (has("quarto", "dormit")) return "BEDROOM";
  if (has("hall", "recepç", "portaria")) return "LOBBY";
  if (has("apto", "apartamento")) return "APARTMENT";
  if (has("escrit")) return "OFFICE";
  if (has("sala")) return "LIVING";
  return kind === "COMMERCE" ? "SALES" : kind === "BUILDING" ? "APARTMENT" : kind === "CONSTRUCTION" ? "SITE" : "LIVING";
}
/** Sem paredes: área externa e laje de obra. */
export const isOpen = (t: RoomType) => t === "OUTDOOR" || t === "SITE";

// ---------------------------------------------------------------------------------------------------------------
// Portas: árvore de ligação entre cômodos internos vizinhos (a maior parede compartilhada primeiro) + entrada.
// ---------------------------------------------------------------------------------------------------------------
export type Door = { floor: number; rooms: [string, string | null]; x: number; z: number; along: "x" | "z"; width: number };
type Shared = { a: string; b: string; along: "x" | "z"; at: number; lo: number; hi: number };
const TOL = 0.06;

function shared(a: Rect, b: Rect): Omit<Shared, "a" | "b"> | null {
  for (const [ea, eb] of [[a.x1, b.x0], [a.x0, b.x1]] as const) if (Math.abs(ea - eb) < TOL) {
    const lo = Math.max(a.z0, b.z0), hi = Math.min(a.z1, b.z1);
    if (hi - lo > 0) return { along: "z", at: ea, lo, hi };
  }
  for (const [ea, eb] of [[a.z1, b.z0], [a.z0, b.z1]] as const) if (Math.abs(ea - eb) < TOL) {
    const lo = Math.max(a.x0, b.x0), hi = Math.min(a.x1, b.x1);
    if (hi - lo > 0) return { along: "x", at: ea, lo, hi };
  }
  return null;
}

/**
 * Posição da porta no trecho compartilhado: o mais longe possível das louças encostadas naquela parede. Em parede
 * lateral (ao longo de z) a porta vai para a frente do cômodo, como numa casa real, e deixa o fundo para os móveis.
 */
function doorPos(s: Omit<Shared, "a" | "b">, width: number, nodes: { x: number; z: number }[]): number {
  const lo = s.lo + width / 2 + 0.15, hi = s.hi - width / 2 - 0.15;
  const mid = s.along === "z" ? Math.max(lo, hi - 0.25) : (s.lo + s.hi) / 2;
  if (hi <= lo) return (s.lo + s.hi) / 2;
  const near = nodes.filter(n => Math.abs((s.along === "z" ? n.x : n.z) - s.at) < 1.1).map(n => (s.along === "z" ? n.z : n.x));
  let best = mid, score = -Infinity;
  for (let p = lo; p <= hi + 1e-9; p += 0.1) {
    const clear = near.length ? Math.min(...near.map(v => Math.abs(v - p))) : 9;
    const sc = Math.min(clear, 1.4) * 10 - Math.abs(p - mid);
    if (sc > score) { score = sc; best = p; }
  }
  return Math.round(best * 100) / 100;
}

export function doorways(kind: Kind, layout: Pick<WaterLayout, "rooms" | "nodes">, poses?: Map<string, Pose>): Door[] {
  const doors: Door[] = [];
  const floors = [...new Set(layout.rooms.map(floorOf))];
  for (const f of floors) {
    const rooms = layout.rooms.filter(r => floorOf(r) === f).map(r => ({ r, rect: roomRect(kind, r), type: roomTypeOf(kind, r) }));
    const pts = layout.nodes.filter(n => floorOf(n) === f).map(n => poses?.get(n.id) ?? toMeters(kind, n.x, n.y));
    const inside = rooms.filter(x => !isOpen(x.type)), open = rooms.filter(x => x.type === "OUTDOOR");
    const pairs: (Shared & { len: number })[] = [];
    for (let i = 0; i < inside.length; i++) for (let j = i + 1; j < inside.length; j++) {
      const s = shared(inside[i].rect, inside[j].rect);
      if (s && s.hi - s.lo >= 1.0) pairs.push({ ...s, a: inside[i].r.id, b: inside[j].r.id, len: s.hi - s.lo });
    }
    // Árvore geradora máxima (Kruskal): todo cômodo interno alcançável, sem porta sobrando.
    pairs.sort((p, q) => q.len - p.len);
    const parent = new Map(inside.map(x => [x.r.id, x.r.id]));
    const find = (k: string): string => { let x = k; while (parent.get(x) !== x) x = parent.get(x)!; return x; };
    for (const p of pairs) {
      const ra = find(p.a), rb = find(p.b);
      if (ra === rb) continue;
      parent.set(ra, rb);
      const width = Math.min(0.9, p.len - 0.3), pos = doorPos(p, width, pts);
      doors.push({ floor: f, rooms: [p.a, p.b], along: p.along, width, x: p.along === "z" ? p.at : pos, z: p.along === "z" ? pos : p.at });
    }
    // Entrada: o cômodo interno com a maior parede voltada para a área externa (salão e hall preferidos).
    let entry: (Shared & { len: number; pref: number }) | null = null;
    for (const x of inside) for (const o of open) {
      const s = shared(x.rect, o.rect);
      if (!s || s.hi - s.lo < 1.2) continue;
      const pref = x.type === "SALES" || x.type === "LOBBY" || x.type === "LIVING" ? 1 : 0;
      const cand = { ...s, a: x.r.id, b: o.r.id, len: s.hi - s.lo, pref };
      if (!entry || cand.pref > entry.pref || (cand.pref === entry.pref && cand.len > entry.len)) entry = cand;
    }
    if (entry) {
      const t = inside.find(x => x.r.id === entry!.a)!.type;
      const width = Math.min(t === "SALES" ? 2.4 : t === "LOBBY" ? 1.6 : 1.0, entry.len - 0.4), pos = doorPos(entry, width, pts);
      doors.push({ floor: f, rooms: [entry.a, null], along: entry.along, width, x: entry.along === "z" ? entry.at : pos, z: entry.along === "z" ? pos : entry.at });
    }
    // Cômodo interno sem nenhuma porta (ex.: apartamento isolado pelo hall): porta na parede voltada para o centro.
    const withDoor = new Set(doors.filter(d => d.floor === f).flatMap(d => d.rooms));
    for (const x of inside) if (!withDoor.has(x.r.id)) {
      const { x0, x1, z0, z1 } = x.rect;
      const sides = [{ along: "z" as const, at: x0, d: Math.abs(x0) }, { along: "z" as const, at: x1, d: Math.abs(x1) }, { along: "x" as const, at: z0, d: Math.abs(z0) * 1.6 }, { along: "x" as const, at: z1, d: Math.abs(z1) * 1.6 }];
      const side = sides.sort((p, q) => p.d - q.d)[0];
      const s = side.along === "z" ? { along: "z" as const, at: side.at, lo: z0, hi: z1 } : { along: "x" as const, at: side.at, lo: x0, hi: x1 };
      const width = 0.9, pos = doorPos(s, width, pts);
      doors.push({ floor: f, rooms: [x.r.id, null], along: s.along, width, x: s.along === "z" ? s.at : pos, z: s.along === "z" ? pos : s.at });
    }
  }
  return doors;
}

// ---------------------------------------------------------------------------------------------------------------
// Paredes: cada cômodo interno levanta as 4 paredes POR DENTRO do próprio retângulo (vizinhos somam ~15 cm);
// o vão da porta sai das duas metades da parede compartilhada.
// ---------------------------------------------------------------------------------------------------------------
export type Box = { x0: number; z0: number; x1: number; z1: number; floor: number };
export function walls(kind: Kind, layout: Pick<WaterLayout, "rooms">, doors: Door[]): Box[] {
  const out: Box[] = [];
  for (const r of layout.rooms) {
    if (isOpen(roomTypeOf(kind, r))) continue;
    const f = floorOf(r), { x0, z0, x1, z1 } = roomRect(kind, r), t = WALL_T;
    const edges: { along: "x" | "z"; at: number; lo: number; hi: number; box: (lo: number, hi: number) => Box }[] = [
      { along: "x", at: z0, lo: x0, hi: x1, box: (lo, hi) => ({ x0: lo, x1: hi, z0, z1: z0 + t, floor: f }) },
      { along: "x", at: z1, lo: x0, hi: x1, box: (lo, hi) => ({ x0: lo, x1: hi, z0: z1 - t, z1, floor: f }) },
      { along: "z", at: x0, lo: z0, hi: z1, box: (lo, hi) => ({ x0, x1: x0 + t, z0: lo, z1: hi, floor: f }) },
      { along: "z", at: x1, lo: z0, hi: z1, box: (lo, hi) => ({ x0: x1 - t, x1, z0: lo, z1: hi, floor: f }) },
    ];
    for (const e of edges) {
      const gaps = doors.filter(d => d.floor === f && d.along === e.along && Math.abs((e.along === "x" ? d.z : d.x) - e.at) < TOL && d.rooms.includes(r.id))
        .map(d => { const c = e.along === "x" ? d.x : d.z; return [c - d.width / 2, c + d.width / 2] as const; })
        .sort((a, b) => a[0] - b[0]);
      let cur = e.lo;
      for (const [g0, g1] of gaps) { if (g0 - cur > 0.02) out.push(e.box(cur, g0)); cur = Math.max(cur, g1); }
      if (e.hi - cur > 0.02) out.push(e.box(cur, e.hi));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Louças: encostadas na parede mais próxima do cômodo (até ~1 m), viradas para dentro. Peça solta fica livre.
// ---------------------------------------------------------------------------------------------------------------
/** Profundidade de cada peça (frente-fundo), em metros. */
export const FIXTURE_DEPTH: Record<Fixture, number> = {
  HYDROMETER: 0.32, WATER_TANK: 1.5, MANIFOLD: 0.2, KITCHEN_SINK: 0.6, PREP_SINK: 0.7, BASIN: 0.48, TOILET: 0.68, SHOWER: 0.95,
  TANK: 0.56, WASHER: 0.62, GARDEN_TAP: 0.8, HOSE: 0.28, DRINKING: 0.36, MIXER: 1.3, TAP: 0.6,
};
/** Peças que ficam soltas no meio (não encostam). */
const FREE: ReadonlySet<Fixture> = new Set(["WATER_TANK", "MIXER"]);
export type Pose = { x: number; z: number; ry: number; floor: number; fixture: Fixture; room: string | null };

/** ry gira a peça (fundo no -z local) para o fundo encostar na parede: z0 → 0, x0 → π/2, x1 → −π/2, z1 → π. */
export function fixturePose(kind: Kind, n: LayoutNode, rooms: LayoutRoom[]): Pose {
  const p = toMeters(kind, n.x, n.y), f = floorOf(n), fixture = fixtureOf(n);
  const room = rooms.filter(r => floorOf(r) === f).map(r => ({ r, rect: roomRect(kind, r) }))
    .find(({ rect }) => p.x >= rect.x0 - 1e-6 && p.x <= rect.x1 + 1e-6 && p.z >= rect.z0 - 1e-6 && p.z <= rect.z1 + 1e-6);
  if (!room || FREE.has(fixture)) return { x: p.x, z: p.z, ry: 0, floor: f, fixture, room: room?.r.id ?? null };
  const { x0, x1, z0, z1 } = room.rect, half = FIXTURE_DEPTH[fixture] / 2;
  const out = isOpen(roomTypeOf(kind, room.r));
  const sides = [
    { d: p.z - z0, ry: 0, snap: { z: z0 + WALL_T + half } },
    { d: x1 - p.x, ry: -Math.PI / 2, snap: { x: x1 - WALL_T - half } },
    { d: p.x - x0, ry: Math.PI / 2, snap: { x: x0 + WALL_T + half } },
    { d: z1 - p.z, ry: Math.PI, snap: { z: z1 - WALL_T - half } },
  ].sort((a, b) => a.d - b.d);
  const near = sides[0];
  if (near.d > 1.05) return { x: p.x, z: p.z, ry: 0, floor: f, fixture, room: room.r.id };
  // Área externa não tem parede própria: a peça encosta na face de fora da parede do vizinho (sem a espessura).
  const back = out ? -WALL_T : 0, sx = near.snap.x, sz = near.snap.z;
  return { x: sx === undefined ? p.x : sx + (near.ry === -Math.PI / 2 ? -back : back), z: sz === undefined ? p.z : sz + (near.ry === Math.PI ? -back : back), ry: near.ry, floor: f, fixture, room: room.r.id };
}
export function poses(kind: Kind, layout: Pick<WaterLayout, "rooms" | "nodes">): Map<string, Pose> {
  return new Map(layout.nodes.map(n => [n.id, fixturePose(kind, n, layout.rooms)]));
}

// ---------------------------------------------------------------------------------------------------------------
// Canos: L no mesmo andar; entre andares, desce pela vertical do ponto de cima (prumada) e segue em L.
// ---------------------------------------------------------------------------------------------------------------
export type P3 = { x: number; y: number; z: number };
export function pipeRoute(a: Pose, b: Pose): P3[] {
  const ya = floorY(a.floor) + PIPE_Y, yb = floorY(b.floor) + PIPE_Y;
  const pts: P3[] = [{ x: a.x, y: ya, z: a.z }];
  if (b.floor < a.floor) pts.push({ x: a.x, y: yb, z: a.z });                       // desce pela prumada do ponto de cima
  const y = b.floor < a.floor ? yb : ya;
  if (Math.abs(a.x - b.x) > 1e-3 && Math.abs(a.z - b.z) > 1e-3) pts.push({ x: a.x, y, z: b.z });
  pts.push({ x: b.x, y, z: b.z });
  if (b.floor > a.floor) pts.push({ x: b.x, y: yb, z: b.z });                       // sobe até o ponto de cima
  // Remove pontos repetidos (trecho de comprimento zero).
  return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y, p.z - pts[i - 1].z) > 1e-3);
}

// ---------------------------------------------------------------------------------------------------------------
// Móveis por tipo de cômodo (primitivas em metros, y a partir do piso do andar). Desviam das louças e das portas.
// ---------------------------------------------------------------------------------------------------------------
export type Mat =
  | "fabric" | "fabricDark" | "wood" | "woodDark" | "woodLight" | "white" | "steel" | "black" | "stone" | "rug" | "mattress" | "pillow"
  | "plant" | "plantLight" | "plantDark" | "bark" | "pot" | "cardboard" | "rackOrange" | "rackBlue" | "concrete" | "brick" | "sand" | "net" | "container"
  | "p0" | "p1" | "p2" | "p3" | "p4" | "p5" | "fruitR" | "fruitO" | "fruitG" | "tile" | "glass" | "figure";
/** "person": figura de maquete (corpo e cabeça na cor neutra; `mat` diferente de "figure" pinta o capacete). */
export type Item = { shape: "box" | "cyl" | "sphere" | "cone" | "person" | "tree"; mat: Mat; x: number; y: number; z: number; sx: number; sy: number; sz: number; ry?: number };

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

export type FloorPlanInput = { kind: Kind; room: LayoutRoom; rect: Rect; type: RoomType; obstacles: { x: number; z: number; r: number }[]; rects?: Rect[]; bath?: Rect | null };
/** Retângulo (centro, meia-largura, meia-profundidade) livre de obstáculos e dentro do cômodo. */
export function isClear(i: FloorPlanInput, cx: number, cz: number, hx: number, hz: number, pad = 0.05) {
  const { x0, x1, z0, z1 } = i.rect;
  if (cx - hx < x0 + WALL_T - 1e-6 || cx + hx > x1 - WALL_T + 1e-6 || cz - hz < z0 + WALL_T - 1e-6 || cz + hz > z1 - WALL_T + 1e-6) return false;
  if ((i.rects ?? []).some(r => cx + hx > r.x0 - pad && cx - hx < r.x1 + pad && cz + hz > r.z0 - pad && cz - hz < r.z1 + pad)) return false;
  return i.obstacles.every(o => {
    const dx = Math.max(Math.abs(o.x - cx) - hx, 0), dz = Math.max(Math.abs(o.z - cz) - hz, 0);
    return Math.hypot(dx, dz) > o.r + pad;
  });
}

export function furnish(i: FloorPlanInput): Item[] {
  const items: Item[] = [], { x0, x1, z0, z1 } = i.rect, W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, m = WALL_T + 0.04;
  const rand = rng(i.room.id + i.kind);
  const box = (mat: Mat, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) => items.push({ shape: "box", mat, x, y: y + sy / 2, z, sx, sy, sz, ry });
  /** Peça só entra se couber livre; devolve se entrou. */
  const place = (hx: number, hz: number, x: number, z: number, add: () => void) => { if (!isClear(i, x, z, hx, hz)) return false; add(); i.obstacles.push({ x, z, r: Math.max(hx, hz) * 0.75 }); return true; };
  const tree = (x: number, z: number, s = 1) => place(0.6 * s, 0.6 * s, x, z, () => {
    items.push({ shape: "tree", mat: "plant", x, y: 0, z, sx: s, sy: s, sz: s, ry: rand() * Math.PI });
  });
  const pot = (x: number, z: number) => place(0.25, 0.25, x, z, () => {
    items.push({ shape: "cyl", mat: "pot", x, y: 0.2, z, sx: 0.36, sy: 0.4, sz: 0.36 });
    items.push({ shape: "cyl", mat: "bark", x, y: 0.405, z, sx: 0.28, sy: 0.018, sz: 0.28 });
    for (let k = 0; k < 7; k++) {
      const a = k * 2.39996, radius = 0.1 + rand() * 0.1;
      items.push({ shape: "sphere", mat: k % 2 ? "plantDark" : "plantLight", x: x + Math.cos(a) * radius, y: 0.56 + rand() * 0.2, z: z + Math.sin(a) * radius, sx: 0.12, sy: 0.35, sz: 0.08, ry: a });
    }
  });
  /** Pessoas de maquete (escala humana, como nas maquetes de arquitetura): até `n`, em pontos livres sorteados. */
  const people = (n: number, area: Rect = i.rect, helmet: Mat = "figure") => {
    let placed = 0;
    for (let t = 0; t < 40 && placed < n; t++) {
      const x = area.x0 + 0.5 + rand() * Math.max(0.01, area.x1 - area.x0 - 1), z = area.z0 + 0.5 + rand() * Math.max(0.01, area.z1 - area.z0 - 1), ry = rand() * Math.PI * 2;
      if (place(0.24, 0.24, x, z, () => items.push({ shape: "person", mat: helmet, x, y: 0, z, sx: 1, sy: 1, sz: 1, ry }))) placed++;
    }
  };
  /** Bancada de módulos de 60 cm ao longo da parede do fundo, pulando onde há louça. */
  const counterRun = (mats: [Mat, Mat], from: number, to: number, depth = 0.6, h = 0.9) => {
    for (let x = from; x + 0.6 <= to + 1e-6; x += 0.6) {
      const mx = x + 0.3, mz = z0 + WALL_T + depth / 2;
      place(0.3, depth / 2, mx, mz, () => { box(mats[0], mx, 0, mz, 0.6, h - 0.04, depth); box(mats[1], mx, h - 0.04, mz, 0.62, 0.04, depth + 0.02); });
    }
  };
  switch (i.type) {
    case "LIVING": {
      const sw = Math.min(2.2, W - 1.2), sz = z0 + m + 0.45;
      if (W > 2.2 && D > 2.6) {
        place(sw / 2, 0.45, cx, sz, () => {
          box("fabric", cx, 0.05, sz + 0.05, sw, 0.38, 0.8); box("fabric", cx, 0.05, z0 + m + 0.12, sw, 0.78, 0.22);
          box("fabricDark", cx - sw / 2 + 0.09, 0.05, sz, 0.18, 0.58, 0.9); box("fabricDark", cx + sw / 2 - 0.09, 0.05, sz, 0.18, 0.58, 0.9);
          box("pillow", cx - sw / 4, 0.43, z0 + m + 0.3, 0.42, 0.32, 0.14); box("pillow", cx + sw / 4, 0.43, z0 + m + 0.3, 0.42, 0.32, 0.14);
        });
        box("rug", cx, 0, cz + 0.2, Math.min(2.4, W - 1), 0.012, Math.min(1.8, D - 1.6));
        place(0.5, 0.3, cx, sz + 1.05, () => { box("woodDark", cx, 0, sz + 1.05, 1.0, 0.38, 0.55); });
        place(0.8, 0.22, cx, z1 - m - 0.22, () => { box("woodDark", cx, 0, z1 - m - 0.22, 1.6, 0.48, 0.42); box("black", cx, 0.5, z1 - m - 0.24, 1.15, 0.66, 0.05); });
      }
      pot(x0 + m + 0.3, z0 + m + 0.3); pot(x1 - m - 0.3, z0 + m + 0.3);
      break;
    }
    case "BEDROOM": {
      const bz = z0 + m + 1.02;
      if (D > 2.6 && W > 2.2) place(0.8, 1.02, cx, bz, () => {
        box("woodDark", cx, 0, bz, 1.55, 0.32, 2.0); box("mattress", cx, 0.32, bz + 0.02, 1.45, 0.2, 1.92);
        box("fabric", cx, 0.5, bz + 0.38, 1.5, 0.06, 1.15); box("woodDark", cx, 0, z0 + m + 0.04, 1.65, 1.0, 0.08);
        box("pillow", cx - 0.36, 0.52, z0 + m + 0.32, 0.58, 0.13, 0.36); box("pillow", cx + 0.36, 0.52, z0 + m + 0.32, 0.58, 0.13, 0.36);
      });
      for (const s of [-1, 1]) place(0.23, 0.2, cx + s * 1.1, z0 + m + 0.22, () => box("woodLight", cx + s * 1.1, 0, z0 + m + 0.22, 0.45, 0.5, 0.4));
      const wl = Math.min(2.0, D - 1.2);
      place(0.31, wl / 2, x0 + m + 0.31, z1 - m - wl / 2, () => box("woodLight", x0 + m + 0.31, 0, z1 - m - wl / 2, 0.6, 1.15, wl));
      box("rug", cx, 0, bz + 1.25, Math.min(2.2, W - 1.2), 0.012, 0.9);
      break;
    }
    case "KITCHEN": {
      if (i.kind === "COMMERCE") {
        counterRun(["steel", "steel"], x0 + m, x1 - m, 0.7);
        place(1.0, 0.45, cx, cz + 0.4, () => { box("steel", cx, 0, cz + 0.4, 2.0, 0.88, 0.9); box("black", cx, 0.88, cz + 0.4, 1.9, 0.02, 0.8); });
        place(0.45, 0.45, x0 + m + 0.47, z1 - m - 0.5, () => { box("steel", x0 + m + 0.47, 0, z1 - m - 0.5, 0.9, 1.15, 0.9); box("black", x0 + m + 0.47, 0.35, z1 - m - 0.04, 0.7, 0.55, 0.02); });
      } else {
        counterRun(["woodLight", "stone"], x0 + m, x1 - m);
        place(0.6, 0.4, cx, cz + 0.55, () => {
          box("wood", cx, 0.72, cz + 0.55, 1.2, 0.05, 0.8); for (const [dx, dz] of [[-0.5, -0.33], [0.5, -0.33], [-0.5, 0.33], [0.5, 0.33]]) box("woodDark", cx + dx, 0, cz + 0.55 + dz, 0.05, 0.72, 0.05);
          for (const [dx, dz] of [[-0.3, -0.62], [0.3, -0.62], [-0.3, 0.62], [0.3, 0.62]]) { box("woodDark", cx + dx, 0, cz + 0.55 + dz, 0.42, 0.45, 0.42); box("woodDark", cx + dx, 0.45, cz + 0.55 + dz + (dz > 0 ? 0.19 : -0.19), 0.42, 0.45, 0.04); }
        });
      }
      break;
    }
    case "BATHROOM":
      place(0.35, 0.22, cx, cz + 0.15, () => box("rug", cx, 0, cz + 0.15, 0.7, 0.012, 0.45));
      break;
    case "LAUNDRY":
      place(0.5, 0.2, cx, z1 - m - 0.2, () => box("white", cx, 0, z1 - m - 0.2, 1.0, 0.85, 0.4));
      place(0.2, 0.2, x0 + m + 0.25, z1 - m - 0.25, () => items.push({ shape: "cyl", mat: "woodLight", x: x0 + m + 0.25, y: 0.25, z: z1 - m - 0.25, sx: 0.4, sy: 0.5, sz: 0.4 }));
      break;
    case "OUTDOOR": {
      if (i.kind === "COMMERCE") {
        for (let x = x0 + 1.2; x < x1 - 1; x += 3.4) place(0.45, 0.25, x, z1 - 0.45, () => { box("concrete", x, 0, z1 - 0.45, 0.9, 0.45, 0.5); items.push({ shape: "sphere", mat: "plant", x, y: 0.62, z: z1 - 0.45, sx: 0.8, sy: 0.45, sz: 0.45 }); });
      } else if (i.kind === "CONSTRUCTION") {
        place(1.0, 1.0, x1 - 2.2, cz, () => items.push({ shape: "cone", mat: "sand", x: x1 - 2.2, y: 0.35, z: cz, sx: 1.9, sy: 0.7, sz: 1.9 }));
        place(0.6, 0.5, x0 + 4.2, cz + 0.3, () => { box("woodLight", x0 + 4.2, 0, cz + 0.3, 1.1, 0.12, 0.9); box("brick", x0 + 4.2, 0.12, cz + 0.3, 1.0, 0.75, 0.8); });
      } else {
        const t = [[x1 - 1.4, z1 - 1.0], [x0 + 1.6, z1 - 0.9], [cx + W * 0.2, z1 - 1.1]] as const;
        for (const [x, z] of t) tree(x, z, 0.9 + rand() * 0.3);
        for (let x = x0 + 0.6; x < x1 - 0.4; x += 0.9) if (rand() > 0.35) place(0.3, 0.3, x, z1 - 0.35, () => items.push({ shape: "sphere", mat: "plant", x, y: 0.25, z: z1 - 0.35, sx: 0.6, sy: 0.5, sz: 0.55 }));
      }
      break;
    }
    case "SALES": {
      // Gôndolas paralelas ao fundo, com produtos nos dois lados; caixas perto da entrada.
      const gx0 = x0 + 1.3, gx1 = x1 - 1.3, L = Math.min(7, gx1 - gx0);
      const rows: number[] = [];
      for (let z = z0 + 1.6; z < z1 - 3.0; z += 2.3) rows.push(z);
      for (const z of rows) place(L / 2, 0.45, cx, z, () => {
        box("steel", cx, 0, z, L, 0.12, 0.9); box("steel", cx, 0.12, z, L, 1.45, 0.05);
        for (const lv of [0.12, 0.52, 0.92]) for (const side of [-1, 1]) {
          box("white", cx, lv, z + side * 0.24, L, 0.025, 0.42);
          for (let x = cx - L / 2 + 0.16; x < cx + L / 2 - 0.1; x += 0.27) {
            const h = 0.16 + rand() * 0.18, mat = (`p${Math.floor(rand() * 6)}`) as Mat;
            box(mat, x, lv + 0.025, z + side * 0.25, 0.22, h, 0.3);
          }
        }
      });
      // Prateleira de parede no fundo.
      for (let x = x0 + 0.9; x + 1.2 <= x1 - 0.5; x += 1.25) place(0.6, 0.25, x + 0.6, z0 + m + 0.25, () => {
        box("steel", x + 0.6, 0, z0 + m + 0.25, 1.2, 1.5, 0.08);
        for (const lv of [0.1, 0.5, 0.9]) { box("white", x + 0.6, lv, z0 + m + 0.3, 1.2, 0.025, 0.4); for (let k = 0; k < 4; k++) box(`p${Math.floor(rand() * 6)}` as Mat, x + 0.2 + k * 0.28, lv + 0.025, z0 + m + 0.3, 0.22, 0.14 + rand() * 0.2, 0.28); }
      });
      // Bancas de hortifrúti ao lado.
      const hz = z1 - 2.2;
      place(0.8, 0.4, x0 + 1.4, hz, () => {
        box("wood", x0 + 1.4, 0, hz, 1.6, 0.72, 0.8);
        for (let k = 0; k < 24; k++) items.push({ shape: "sphere", mat: (["fruitR", "fruitO", "fruitG"] as const)[k % 3], x: x0 + 0.72 + (k % 8) * 0.19, y: 0.8, z: hz - 0.26 + Math.floor(k / 8) * 0.26, sx: 0.15, sy: 0.15, sz: 0.15 });
      });
      for (let k = 0; k < 2; k++) {
        const x = x1 - 1.6 - k * 2.4, z = z1 - 1.2;
        place(0.95, 0.45, x, z, () => { box("white", x, 0, z, 1.8, 0.78, 0.8); box("black", x, 0.78, z, 1.7, 0.03, 0.55); box("black", x + 0.6, 0.81, z - 0.25, 0.32, 0.3, 0.05); });
      }
      break;
    }
    case "STOCK": {
      const rack = (z: number, L: number) => place(L / 2, 0.45, cx, z, () => {
        for (const x of [cx - L / 2 + 0.05, cx + L / 2 - 0.05]) box("rackOrange", x, 0, z, 0.08, 1.7, 0.9);
        for (const lv of [0.12, 0.85]) {
          box("rackBlue", cx, lv, z, L, 0.08, 0.9);
          for (let x = cx - L / 2 + 0.4; x < cx + L / 2 - 0.3; x += 0.62) box("cardboard", x, lv + 0.08, z, 0.55, 0.38 + rand() * 0.2, 0.7);
        }
      });
      rack(z0 + m + 0.5, Math.min(3.2, W - 1.2));
      place(0.6, 0.5, cx, cz + 0.6, () => { box("woodLight", cx, 0, cz + 0.6, 1.2, 0.14, 1.0); for (const [dx, dz] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) box("cardboard", cx + dx, 0.14, cz + 0.6 + dz, 0.55, 0.45, 0.45); box("cardboard", cx, 0.59, cz + 0.6, 0.55, 0.4, 0.45); });
      break;
    }
    case "LOBBY": {
      place(1.0, 0.35, cx, z0 + m + 1.0, () => { box("woodDark", cx, 0, z0 + m + 1.0, 2.0, 1.05, 0.6); box("stone", cx, 1.05, z0 + m + 1.0, 2.1, 0.04, 0.7); });
      place(0.6, 0.12, cx, z0 + m + 0.1, () => box("steel", cx, 0, z0 + m + 0.1, 1.2, 1.18, 0.1));
      for (const s of [-1, 1]) place(0.4, 0.4, cx + s * 1.3, cz + 0.8, () => { box("fabricDark", cx + s * 1.3, 0, cz + 0.8, 0.75, 0.42, 0.75); box("fabricDark", cx + s * 1.3, 0.42, cz + 0.8 - 0.3, 0.75, 0.38, 0.14); });
      pot(x0 + m + 0.35, z1 - m - 0.35); pot(x1 - m - 0.35, z1 - m - 0.35);
      break;
    }
    case "OFFICE":
      place(0.7, 0.35, cx, z0 + m + 0.4, () => { box("woodLight", cx, 0.72, z0 + m + 0.4, 1.4, 0.04, 0.7); box("black", cx, 0.76, z0 + m + 0.2, 0.55, 0.36, 0.04); box("fabricDark", cx, 0, z0 + m + 1.0, 0.5, 0.48, 0.5); });
      break;
    case "APARTMENT": {
      // Banheiro fechado (paredes em planSite) no canto do chuveiro; bancada no fundo; sofá e cama do outro lado.
      counterRun(["woodLight", "stone"], x0 + m, x1 - m);
      const bath = i.bath, away = bath ? ((bath.x0 + bath.x1) / 2 > cx ? -1 : 1) : 1;
      if (W > 3.5 && D > 4) {
        const sx = cx + away * W * 0.2, sw = Math.min(2.0, W * 0.34), sz = z1 - m - 1.5;
        place(sw / 2, 0.45, sx, sz, () => {
          box("fabric", sx, 0.05, sz + 0.05, sw, 0.38, 0.8); box("fabric", sx, 0.05, sz - 0.33, sw, 0.78, 0.2);
          box("rug", sx, 0, sz + 0.75, sw + 0.3, 0.012, 0.9); box("woodDark", sx, 0, sz + 0.85, 0.9, 0.36, 0.5);
        });
        const bx = cx - away * W * 0.22, bz = cz + 0.4;
        place(0.75, 1.0, bx, bz, () => { box("woodDark", bx, 0, bz, 1.45, 0.32, 1.95); box("mattress", bx, 0.32, bz + 0.02, 1.38, 0.2, 1.88); box("fabric", bx, 0.5, bz + 0.35, 1.42, 0.06, 1.1); box("pillow", bx, 0.52, bz - 0.75, 1.1, 0.12, 0.34); });
      }
      break;
    }
    case "SITE": {
      // Laje de obra: pilares, fôrmas e tela de proteção na borda dos pavimentos de cima.
      const columns: number[] = [];
      for (let x = x0 + 0.4; x <= x1 - 0.3; x += Math.max(3, (W - 0.8) / Math.max(1, Math.round((W - 0.8) / 4)))) {
        columns.push(x);
        for (const z of [z0 + 0.4, z1 - 0.4]) {
          box("concrete", x, 0, z, 0.3, 2.7, 0.3);
          for (const dx of [-0.07, 0.07]) for (const dz of [-0.07, 0.07]) box("steel", x + dx, 2.65, z + dz, 0.012, 0.48, 0.012);
        }
      }
      if (columns.length > 1) for (const z of [z0 + 0.4, z1 - 0.4]) box("concrete", (columns[0] + columns.at(-1)!) / 2, 2.4, z, columns.at(-1)! - columns[0] + 0.3, 0.3, 0.25);
      if (floorOf(i.room) > 0) {
        // Guarda-corpo e tela vazada, em vez de três placas alaranjadas maciças.
        for (let x = x0 + 0.15; x < x1; x += 1.5) box("rackOrange", x, 0, z1 - 0.1, 0.035, 1.12, 0.035);
        for (const h of [0.15, 0.6, 1.08]) box("rackOrange", cx, h, z1 - 0.1, W, 0.025, 0.025);
        box("net", cx, 0.12, z1 - 0.08, W, 0.94, 0.008);
        place(0.6, 0.4, cx - W * 0.25, cz, () => { for (let k = 0; k < 6; k++) items.push({ shape: "cyl", mat: "rackOrange", x: cx - W * 0.25 - 0.5 + k * 0.2, y: 0.05, z: cz, sx: 0.04, sy: 1.6, sz: 0.04, ry: Math.PI / 2 }); });
        place(0.5, 0.5, cx + W * 0.28, cz - 0.4, () => box("woodLight", cx + W * 0.28, 0, cz - 0.4, 1.0, 0.5, 1.0));
      } else {
        place(1.25, 3.0, x0 + 1.7, cz, () => {
          box("container", x0 + 1.7, 0, cz, 2.4, 2.5, 5.8);
          for (let zz = cz - 2.7; zz < cz + 2.8; zz += 0.18) box("rackBlue", x0 + 2.91, 0.08, zz, 0.025, 2.32, 0.04);
          box("white", x0 + 2.93, 0.85, cz - 0.9, 0.025, 0.85, 1.2);
          box("glass", x0 + 2.95, 0.9, cz - 0.9, 0.01, 0.75, 1.1);
          box("white", x0 + 1.7, 2.5, cz, 2.5, 0.08, 5.9);
        });
      }
      break;
    }
  }
  // Escala humana depois dos móveis, nos espaços que sobraram (obra: capacete laranja).
  const pop: Partial<Record<RoomType, number>> = { SALES: 4, LOBBY: 1, LIVING: 1, KITCHEN: i.kind === "COMMERCE" ? 1 : 0, OUTDOOR: i.kind === "COMMERCE" ? 2 : 1, SITE: floorOf(i.room) === 0 ? 2 : 1, APARTMENT: rand() > 0.5 ? 1 : 0 };
  if (pop[i.type]) people(pop[i.type]!, i.rect, i.type === "SITE" || (i.type === "OUTDOOR" && i.kind === "CONSTRUCTION") ? "rackOrange" : "figure");
  return items;
}

// ---------------------------------------------------------------------------------------------------------------
// Plano completo da maquete: o construtor 3D consome só isto.
// ---------------------------------------------------------------------------------------------------------------
/** Largura (lado a lado) de cada peça: obstáculo para os móveis. */
export const FIXTURE_WIDTH: Record<Fixture, number> = {
  HYDROMETER: 0.56, WATER_TANK: 1.5, MANIFOLD: 0.5, KITCHEN_SINK: 1.22, PREP_SINK: 1.4, BASIN: 0.55, TOILET: 0.42, SHOWER: 0.95,
  TANK: 0.6, WASHER: 0.6, GARDEN_TAP: 1.2, HOSE: 0.72, DRINKING: 0.36, MIXER: 1.2, TAP: 0.35,
};
export type FloorMat = "wood" | "porcelain" | "bathTile" | "grass" | "pavers" | "dirt" | "concrete" | "stone";
export function floorMat(kind: Kind, t: RoomType): FloorMat {
  if (t === "BATHROOM" || t === "LAUNDRY") return "bathTile";
  if (t === "OUTDOOR") return kind === "COMMERCE" ? "pavers" : kind === "CONSTRUCTION" ? "dirt" : "grass";
  if (t === "STOCK" || t === "SITE") return "concrete";
  if (t === "LOBBY") return "stone";
  if (t === "KITCHEN" || t === "SALES") return "porcelain";
  return "wood";
}

/** Banheiro fechado do apartamento: no canto mais perto do chuveiro/vaso, até 2,3 × 1,9 m. */
export function bathEnclosure(rect: Rect, wet: { x: number; z: number }[]): Rect | null {
  if (!wet.length) return null;
  const { x0, x1, z0, z1 } = rect, bw = Math.min(2.3, (x1 - x0) * 0.42), bd = Math.min(1.9, (z1 - z0) * 0.36);
  const w = wet[0], left = w.x - x0 < x1 - w.x, back = w.z - z0 < z1 - w.z;
  const r = { x0: left ? x0 : x1 - bw, x1: left ? x0 + bw : x1, z0: back ? z0 : z1 - bd, z1: back ? z0 + bd : z1 };
  // Todas as peças molhadas precisam caber dentro; senão, sem cercado (planta editada à mão).
  return wet.every(p => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1) ? r : null;
}

export type PlanRoom = { id: string; label: string; floor: number; type: RoomType; rect: Rect; mat: FloorMat; bath: Rect | null };
export type SitePlan = {
  kind: Kind; floors: number[]; rooms: PlanRoom[]; doors: Door[]; walls: Box[]; poses: Map<string, Pose>;
  pipes: { from: string; to: string; points: P3[] }[];
  items: { floor: number; room: string; item: Item }[];
};

export function planSite(layout: WaterLayout): SitePlan {
  const kind = layout.kind, ps = poses(kind, layout);
  const floors = [...new Set([...layout.rooms.map(floorOf), ...layout.nodes.map(floorOf)])].sort((a, b) => a - b);
  const rooms: PlanRoom[] = layout.rooms.map(r => {
    const type = roomTypeOf(kind, r), rect = roomRect(kind, r);
    const wet = type === "APARTMENT" ? [...ps.values()].filter(p => p.room === r.id && (p.fixture === "SHOWER" || p.fixture === "TOILET")) : [];
    return { id: r.id, label: r.label, floor: floorOf(r), type, rect, mat: floorMat(kind, type), bath: bathEnclosure(rect, wet) };
  });
  const doors = doorways(kind, layout, ps);
  const wallBoxes = walls(kind, layout, doors);
  // Cercado do banheiro: as duas paredes internas; a porta (0,7 m) fica na parede paralela ao fundo.
  for (const r of rooms) if (r.bath) {
    const b = r.bath, t = WALL_T;
    const innerX = b.x0 > r.rect.x0 + 0.01 ? { x0: b.x0, x1: b.x0 + t } : { x0: b.x1 - t, x1: b.x1 };
    const innerZ = b.z0 > r.rect.z0 + 0.01 ? { z0: b.z0, z1: b.z0 + t } : { z0: b.z1 - t, z1: b.z1 };
    const gap = 0.7, gc = (b.x0 + b.x1) / 2;
    wallBoxes.push({ ...innerX, z0: b.z0, z1: b.z1, floor: r.floor });
    wallBoxes.push({ x0: b.x0, x1: gc - gap / 2, ...innerZ, floor: r.floor }, { x0: gc + gap / 2, x1: b.x1, ...innerZ, floor: r.floor });
  }
  const items: SitePlan["items"] = [];
  for (const r of rooms) {
    const fixtures = [...ps.values()].filter(p => p.floor === r.floor && p.room === r.id);
    const room = layout.rooms.find(x => x.id === r.id)!;

    // Pegada real de cada louça (girada) e um corredor de 60 cm na frente de cada porta.
    const rects: Rect[] = [
      ...fixtures.map(p => { const w = FIXTURE_WIDTH[p.fixture] / 2 + 0.05, d = FIXTURE_DEPTH[p.fixture] / 2 + 0.05, side = Math.abs(Math.sin(p.ry)) > 0.5; const hx = side ? d : w, hz = side ? w : d; return { x0: p.x - hx, x1: p.x + hx, z0: p.z - hz, z1: p.z + hz }; }),
      ...doors.filter(d => d.floor === r.floor && d.rooms.includes(r.id)).map(d => d.along === "z"
        ? { x0: d.x - 0.6, x1: d.x + 0.6, z0: d.z - d.width / 2, z1: d.z + d.width / 2 }
        : { x0: d.x - d.width / 2, x1: d.x + d.width / 2, z0: d.z - 0.6, z1: d.z + 0.6 }),
      ...(r.bath ? [r.bath] : []),
    ];
    for (const item of furnish({ kind, room, rect: r.rect, type: r.type, obstacles: [], rects, bath: r.bath })) items.push({ floor: r.floor, room: r.id, item });
  }
  const pipes = layout.edges.flatMap(e => { const a = ps.get(e.from), b = ps.get(e.to); return a && b ? [{ from: e.from, to: e.to, points: pipeRoute(a, b) }] : []; });
  return { kind, floors, rooms, doors, walls: wallBoxes, poses: ps, pipes, items };
}
