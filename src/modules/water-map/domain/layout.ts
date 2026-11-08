import { z } from "zod";

/**
 * Planta hidráulica do lugar: cômodos, pontos (entrada, distribuição e uso) e ramais em árvore.
 * Desde 08/11 cada cômodo pode ter TIPO e PAVIMENTO e cada ponto pode ter TIPO DE PEÇA e PAVIMENTO: a maquete 3D
 * desenha a louça certa no lugar certo. Os campos são opcionais; planta salva antes continua válida.
 */
export const ROOM_TYPES = ["LIVING", "BEDROOM", "KITCHEN", "BATHROOM", "LAUNDRY", "OUTDOOR", "SALES", "STOCK", "OFFICE", "LOBBY", "APARTMENT", "SITE"] as const;
export type RoomType = typeof ROOM_TYPES[number];
export const ROOM_LABEL: Record<RoomType, string> = {
  LIVING: "Sala", BEDROOM: "Quarto", KITCHEN: "Cozinha", BATHROOM: "Banheiro", LAUNDRY: "Área de serviço", OUTDOOR: "Área externa",
  SALES: "Salão de vendas", STOCK: "Estoque", OFFICE: "Escritório", LOBBY: "Hall", APARTMENT: "Apartamento", SITE: "Canteiro / laje",
};
export const FIXTURES = ["HYDROMETER", "WATER_TANK", "MANIFOLD", "KITCHEN_SINK", "PREP_SINK", "BASIN", "TOILET", "SHOWER", "TANK", "WASHER", "GARDEN_TAP", "HOSE", "DRINKING", "MIXER", "TAP"] as const;
export type Fixture = typeof FIXTURES[number];
export const FIXTURE_LABEL: Record<Fixture, string> = {
  HYDROMETER: "Hidrômetro", WATER_TANK: "Caixa d'água", MANIFOLD: "Registro / distribuição", KITCHEN_SINK: "Pia de cozinha",
  PREP_SINK: "Pia industrial", BASIN: "Lavatório", TOILET: "Vaso sanitário", SHOWER: "Chuveiro", TANK: "Tanque", WASHER: "Máquina de lavar",
  GARDEN_TAP: "Torneira de jardim", HOSE: "Torneira de limpeza", DRINKING: "Bebedouro", MIXER: "Betoneira", TAP: "Torneira",
};
export const MAX_FLOOR = 7;

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), label = z.string().trim().min(2).max(70), coord = z.number().finite().min(.02).max(.98);
const floor = z.number().int().min(0).max(MAX_FLOOR).optional();
export const layoutSchema = z.object({
  kind: z.enum(["HOUSE", "COMMERCE", "BUILDING", "CONSTRUCTION"]),
  rooms: z.array(z.object({ id, label, x: coord, y: coord, w: z.number().positive().max(.95), h: z.number().positive().max(.95), type: z.enum(ROOM_TYPES).optional(), floor }).strict()).min(1).max(20),
  nodes: z.array(z.object({ id, label, kind: z.enum(["SUPPLY", "JUNCTION", "OUTLET"]), x: coord, y: coord, deviceId: id.nullable(), fixture: z.enum(FIXTURES).optional(), floor }).strict()).min(2).max(32),
  edges: z.array(z.object({ from: id, to: id }).strict()).min(1).max(40),
}).strict().superRefine((l, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message }), ids = new Set(l.nodes.map(n => n.id));
  if (ids.size !== l.nodes.length || new Set(l.rooms.map(r => r.id)).size !== l.rooms.length) fail("Identificadores duplicados");
  if (l.rooms.some(r => r.x + r.w > 1 || r.y + r.h > 1)) fail("Ambiente fora da planta");
  const assigned = l.nodes.flatMap(n => n.deviceId ? [n.deviceId] : []); if (new Set(assigned).size !== assigned.length) fail("Um medidor só pode representar um ponto nesta planta");
  const roots = l.nodes.filter(n => n.kind === "SUPPLY"); if (roots.length !== 1) fail("Use exatamente uma entrada");
  const incoming = new Map<string, number>(), paths = new Set<string>();
  for (const e of l.edges) { if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to) fail("Ramal inválido"); const k = e.from + ":" + e.to; if (paths.has(k)) fail("Ramal duplicado"); paths.add(k); incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1); }
  if (roots[0] && incoming.has(roots[0].id)) fail("A entrada não pode receber ramal");
  for (const n of l.nodes) if (n.kind !== "SUPPLY" && incoming.get(n.id) !== 1) fail("Cada ponto deve ter um único ramal de entrada");
  const seen = new Set<string>(), visiting = new Set<string>();
  function walk(n: string) { if (visiting.has(n)) { fail("A planta não pode ter ciclos"); return; } if (seen.has(n)) return; seen.add(n); visiting.add(n); for (const e of l.edges) if (e.from === n) walk(e.to); visiting.delete(n); }
  if (roots[0]) walk(roots[0].id); if (seen.size !== ids.size) fail("Todos os pontos devem estar conectados à entrada");
});
export type WaterLayout = z.infer<typeof layoutSchema>;
export type LayoutRoom = WaterLayout["rooms"][number];
export type LayoutNode = WaterLayout["nodes"][number];
export const saveMapSchema = z.object({ siteId: id, version: z.number().int().min(-1), name: label, layout: layoutSchema }).strict();
export const KIND_LABEL = { HOUSE: "Casa", COMMERCE: "Comércio", BUILDING: "Prédio", CONSTRUCTION: "Edifício em construção" } as const;

export const floorOf = (x: { floor?: number }) => x.floor ?? 0;
/** Peça desenhada quando o ponto não diz qual é (plantas antigas). */
export const fixtureOf = (n: Pick<LayoutNode, "kind" | "fixture">): Fixture => n.fixture ?? (n.kind === "SUPPLY" ? "HYDROMETER" : n.kind === "JUNCTION" ? "MANIFOLD" : "TAP");
/** Pavimentos usados pela planta, em ordem (0 = térreo). */
export function floorsOf(l: Pick<WaterLayout, "rooms" | "nodes">): number[] {
  return [...new Set([...l.rooms.map(floorOf), ...l.nodes.map(floorOf)])].sort((a, b) => a - b);
}
/** "Térreo", "2º pavimento" ou "Cobertura" (o pavimento mais alto sem cômodo, onde ficam caixa d'água e barrilete). */
export function floorLabel(l: Pick<WaterLayout, "rooms" | "nodes">, f: number): string {
  const floors = floorsOf(l);
  if (f === 0) return "Térreo";
  if (f === floors[floors.length - 1] && !l.rooms.some(r => floorOf(r) === f)) return "Cobertura";
  return `${f}º pavimento`;
}

type R = [string, RoomType, number, number, number, number, number?];
type N = [string, "SUPPLY" | "JUNCTION" | "OUTLET", Fixture, number, number, number?];
const build = (kind: WaterLayout["kind"], rooms: R[], nodes: N[], edges: [number, number][]): WaterLayout => layoutSchema.parse({
  kind,
  rooms: rooms.map(([label, type, x, y, w, h, f], i) => ({ id: `room-${i}`, label, type, x, y, w, h, ...(f ? { floor: f } : {}) })),
  nodes: nodes.map(([label, k, fixture, x, y, f], i) => ({ id: i === 0 ? "supply" : `point-${i}`, label, kind: k, fixture, x, y, deviceId: null, ...(f ? { floor: f } : {}) })),
  edges: edges.map(([a, b]) => ({ from: a === 0 ? "supply" : `point-${a}`, to: `point-${b}` })),
});

/**
 * Modelos realistas (sem medidor presumido: todo ponto começa "não instrumentado").
 * Coordenadas normalizadas sobre a planta de cada tipo (escala em metros em `site-plan.ts`).
 */
export function template(kind: WaterLayout["kind"]): WaterLayout {
  if (kind === "HOUSE") return build(kind, [
    ["Quarto", "BEDROOM", .03, .05, .27, .57], ["Sala", "LIVING", .30, .05, .25, .57], ["Cozinha", "KITCHEN", .55, .05, .21, .57],
    ["Banheiro", "BATHROOM", .76, .05, .21, .33], ["Área de serviço", "LAUNDRY", .76, .38, .21, .24], ["Quintal", "OUTDOOR", .03, .62, .94, .33],
  ], [
    ["Hidrômetro · cavalete", "SUPPLY", "HYDROMETER", .06, .90], ["Caixa d'água", "JUNCTION", "WATER_TANK", .90, .80],
    ["Pia da cozinha", "OUTLET", "KITCHEN_SINK", .64, .09], ["Vaso sanitário", "OUTLET", "TOILET", .845, .085], ["Chuveiro", "OUTLET", "SHOWER", .93, .11],
    ["Lavatório", "OUTLET", "BASIN", .785, .27], ["Tanque", "OUTLET", "TANK", .80, .43], ["Máquina de lavar", "OUTLET", "WASHER", .925, .43],
    ["Torneira do jardim", "OUTLET", "GARDEN_TAP", .40, .665],
  ], [[0, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7], [1, 8]]);
  if (kind === "COMMERCE") return build(kind, [
    ["Salão de vendas", "SALES", .03, .05, .57, .70], ["Preparo · padaria", "KITCHEN", .60, .05, .37, .34], ["Estoque", "STOCK", .60, .39, .19, .36],
    ["Sanitário · clientes", "BATHROOM", .79, .39, .18, .18], ["Sanitário · equipe", "BATHROOM", .79, .57, .18, .18], ["Calçada", "OUTDOOR", .03, .75, .94, .20],
  ], [
    ["Hidrômetro · cavalete", "SUPPLY", "HYDROMETER", .05, .90], ["Caixa d'água · barrilete", "JUNCTION", "WATER_TANK", .645, .69],
    ["Pia industrial · preparo", "OUTLET", "PREP_SINK", .70, .085], ["Lavatório de mãos · preparo", "OUTLET", "BASIN", .93, .075],
    ["Bebedouro · clientes", "OUTLET", "DRINKING", .56, .08], ["Torneira de limpeza", "OUTLET", "HOSE", .77, .46],
    ["Lavatório · clientes", "OUTLET", "BASIN", .81, .44], ["Vaso · clientes", "OUTLET", "TOILET", .935, .425],
    ["Lavatório · equipe", "OUTLET", "BASIN", .81, .62], ["Vaso · equipe", "OUTLET", "TOILET", .935, .605],
    ["Lavagem da calçada", "OUTLET", "GARDEN_TAP", .45, .785],
  ], [[0, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7], [1, 8], [1, 9], [1, 10]]);
  if (kind === "BUILDING") {
    const rooms: R[] = [["Hall de entrada", "LOBBY", .30, .05, .40, .55], ["Jardim", "OUTDOOR", .03, .60, .94, .35]];
    const nodes: N[] = [["Hidrômetro geral", "SUPPLY", "HYDROMETER", .08, .90], ["Caixa d'água superior", "JUNCTION", "WATER_TANK", .50, .50, 4]];
    const edges: [number, number][] = [[0, 1]];
    for (const f of [1, 2, 3]) {
      rooms.push([`Apto ${f}01`, "APARTMENT", .03, .05, .43, .90, f], [`Apto ${f}02`, "APARTMENT", .54, .05, .43, .90, f]);
      for (const [a, side] of [[1, -1], [2, 1]] as const) {
        const meter = nodes.length;
        nodes.push([`Hidrômetro ${f}0${a}`, "JUNCTION", "HYDROMETER", .50, a === 1 ? .18 : .34, f]);
        nodes.push([`Pia ${f}0${a}`, "OUTLET", "KITCHEN_SINK", .5 + side * .40, .09, f], [`Chuveiro ${f}0${a}`, "OUTLET", "SHOWER", .5 + side * .10, .10, f]);
        edges.push([1, meter], [meter, meter + 1], [meter, meter + 2]);
      }
    }
    return build(kind, rooms, nodes, edges);
  }
  return build(kind, [
    ["Canteiro · apoio", "SITE", .03, .05, .94, .55], ["Acesso de obra", "OUTDOOR", .03, .60, .94, .35],
    ["1º pavimento · laje", "SITE", .03, .05, .94, .90, 1], ["2º pavimento · laje", "SITE", .03, .05, .94, .90, 2],
  ], [
    ["Hidrômetro provisório", "SUPPLY", "HYDROMETER", .06, .90], ["Caixa d'água provisória", "JUNCTION", "WATER_TANK", .18, .68],
    ["Betoneira", "OUTLET", "MIXER", .42, .32], ["Lava-rodas", "OUTLET", "HOSE", .80, .86], ["Vestiário · chuveiro", "OUTLET", "SHOWER", .90, .12],
    ["Bebedouro da obra", "OUTLET", "DRINKING", .62, .10], ["Ponto de cura · 1º pav", "OUTLET", "TAP", .50, .50, 1], ["Ponto de cura · 2º pav", "OUTLET", "TAP", .50, .50, 2],
  ], [[0, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7]]);
}

export function flowState(reading: { at: string; flowLpm: number; source: string } | null, now: number) {
  if (!reading || !Number.isFinite(reading.flowLpm) || reading.flowLpm < 0 || !Number.isFinite(Date.parse(reading.at))) return "NO_READING";
  const age = now - Date.parse(reading.at);
  if (age < -5000 || age > 120000) return "STALE";
  return reading.flowLpm > 0 ? "FLOW" : "IDLE";
}
