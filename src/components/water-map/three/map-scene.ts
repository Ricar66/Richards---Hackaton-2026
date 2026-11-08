/**
 * Maquete 3D do lugar (three imperativo, carregado só na vista 3D): planta humanizada em escala de metros.
 * - O que desenhar vem de `planSite` (puro e testado): pisos, paredes cortadas com portas, louças por tipo de ponto,
 *   móveis por tipo de cômodo, canos e pavimentos. Móveis e louças ILUSTRAM o tipo; não são a peça real.
 * - Água só se move no ramal e na torneira do ponto com medidor vinculado e leitura recente acima de zero; a
 *   velocidade acompanha a vazão MEDIDA. Ramal sem medidor nunca se move (sem inferência).
 * - Sem laço quando nada se move: desenha só quando o estado, a câmera ou o tamanho mudam. Sombra calculada uma vez.
 * - Orçamento de quadro igual ao gêmeo da Sala: nível 1 reduz o DPR, nível 2 desiste e a tela volta à perspectiva 2D.
 */
import {
  ACESFilmicToneMapping, Box3, BoxGeometry, BufferGeometry, CanvasTexture, ClampToEdgeWrapping, Color, ConeGeometry, CurvePath,
  CylinderGeometry, DirectionalLight, DoubleSide, Euler, Float32BufferAttribute, Group, HemisphereLight, LineBasicMaterial, LineCurve3,
  LineSegments, Material, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PCFShadowMap, PerspectiveCamera,
  PlaneGeometry, PMREMGenerator, QuadraticBezierCurve3, Quaternion, RepeatWrapping, RingGeometry, Scene, SphereGeometry, SRGBColorSpace,
  Texture, TorusGeometry, TubeGeometry, Vector3, WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { budgetRestart, budgetStart, frameBudgetStep, median, type BudgetState } from "@/components/stage/stage-logic";
import { floorOf, type Fixture, type WaterLayout } from "@/modules/water-map/domain/layout";
import { FIXTURE_DEPTH, FIXTURE_WIDTH, FOOTPRINT, floorY, planSite, SLAB_T, WALL_H, type FloorMat, type Mat } from "./site-plan";

export type MapNodeState = "FLOW" | "IDLE" | "STALE" | "NO_READING" | "UNMETERED";
export type MapNodeView = { state: MapNodeState; flowLpm: number | null; alert: boolean };
export type FloorMode = number | "all";
export type MapSceneInput = {
  layout: WaterLayout;
  nodes: Record<string, MapNodeView>;
  simulated: boolean;
  selected: string;
  /** Pausa do operador ou "reduzir movimento": nada anda, o estado continua aparecendo. */
  still: boolean;
  visible: boolean;
  /** Prédio: todos os pavimentos (vista explodida) ou um só. */
  floor?: FloorMode;
  /** Girar e aproximar com o mouse/dedo. Desligado, o toque rola a página. */
  interactive?: boolean;
};
export type MapSceneStats = { fps: number; p50: number; p95: number; calls: number; triangles: number; dpr: number; level: number };
export type ScreenPoint = { x: number; y: number };
export type MapProjection = { nodes: Record<string, ScreenPoint>; rooms: Record<string, ScreenPoint>; floors: Record<string, ScreenPoint>; size: { w: number; h: number } };
export type MapScene = { ready: Promise<void>; update(i: MapSceneInput): void; project(): MapProjection; resetView(): void; zoom(factor: number): void; dispose(): void };
type Callbacks = { onLost(): void; onBudget(): void; onStats?(s: MapSceneStats): void; onFrame?(): void; onView?(): void };

/** Planta normalizada (0..1) → mundo, na escala da casa (compatível com a versão esquemática). */
export const MAP_W = FOOTPRINT.HOUSE.w, MAP_D = FOOTPRINT.HOUSE.d;
export const toWorld = (x: number, y: number) => ({ x: (x - 0.5) * MAP_W, z: (y - 0.5) * MAP_D });

const COLORS = { flow: "#63ebbf", flowSim: "#c9a5ff", idle: "#2e8f78", stale: "#b08a4a", none: "#566c75", warn: "#ffb071", select: "#8af3d2", water: "#bfeaff" };
/** Repetições da faixa por segundo, proporcional à vazão medida (zero = parado; teto para não piscar). */
export function stripeSpeed(flowLpm: number | null): number {
  return flowLpm !== null && Number.isFinite(flowLpm) && flowLpm > 0 ? Math.min(2.4, 0.18 + flowLpm * 0.22) : 0;
}
/** Cor de exibição usada também na legenda e nos rótulos (mesma regra do visor). */
export function nodeColor(v: MapNodeView | undefined, simulated: boolean): string {
  if (!v) return COLORS.none;
  if (v.alert) return COLORS.warn;
  if (v.state === "FLOW") return simulated ? COLORS.flowSim : COLORS.flow;
  if (v.state === "IDLE") return COLORS.idle;
  if (v.state === "STALE") return COLORS.stale;
  return COLORS.none;
}

// ---------------------------------------------------------------------------------------------------------------
// Texturas geradas em código (sem arquivo, sem CDN). Pseudoaleatório fixo: a maquete sai igual em toda máquina.
// ---------------------------------------------------------------------------------------------------------------
function lcg(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number, r: () => number) => void, aniso: number, srgb = true) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  draw(c.getContext("2d")!, size, lcg(size * 7 + draw.length));
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping; t.anisotropy = aniso;
  if (srgb) t.colorSpace = SRGBColorSpace;
  return t;
}
const shade = (hex: string, k: number) => { const c = new Color(hex); c.offsetHSL(0, 0, k); return `#${c.getHexString()}`; };
function speckle(g: CanvasRenderingContext2D, s: number, r: () => number, base: string, amt: number, n: number, size = 2) {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) { g.fillStyle = shade(base, (r() - 0.5) * amt); const z = 1 + r() * size; g.fillRect(r() * s, r() * s, z, z); }
}
/** Lado real (m) que cada textura cobre: a UV do piso é escalada por isto. */
const TILE_M: Record<FloorMat, number> = { wood: 2, porcelain: 2.4, bathTile: 1.2, grass: 3, pavers: 1.6, dirt: 3, concrete: 3, stone: 2.4 };
function floorTextures(aniso: number): Record<FloorMat, Texture> {
  return {
    wood: canvasTex(512, (g, s, r) => {
      const rows = 8, h = s / rows;
      for (let i = 0; i < rows; i++) {
        let x = -r() * 200;
        while (x < s) {
          const len = 140 + r() * 220, base = shade("#b5845a", (r() - 0.5) * 0.12);
          g.fillStyle = base; g.fillRect(x, i * h, len, h);
          for (let k = 0; k < 9; k++) { g.strokeStyle = shade(base, -0.06 - r() * 0.06); g.globalAlpha = 0.35; g.lineWidth = 1; g.beginPath(); const y = i * h + r() * h; g.moveTo(x, y); g.bezierCurveTo(x + len / 3, y + (r() - 0.5) * 6, x + len * 2 / 3, y + (r() - 0.5) * 6, x + len, y); g.stroke(); }
          g.globalAlpha = 1; g.fillStyle = "#5e4128"; g.fillRect(x, i * h, 2, h);
          x += len;
        }
        g.fillStyle = "#5e4128"; g.fillRect(0, i * h, s, 2);
      }
    }, aniso),
    porcelain: canvasTex(512, (g, s, r) => {
      const n = 4, t = s / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const base = shade("#d8d2c8", (r() - 0.5) * 0.03); g.fillStyle = base; g.fillRect(i * t, j * t, t, t); for (let k = 0; k < 260; k++) { g.fillStyle = shade(base, (r() - 0.5) * 0.06); g.fillRect(i * t + r() * t, j * t + r() * t, 2, 2); } }
      g.fillStyle = "#b3aa9d"; for (let i = 0; i <= n; i++) { g.fillRect(i * t - 1.5, 0, 3, s); g.fillRect(0, i * t - 1.5, s, 3); }
    }, aniso),
    bathTile: canvasTex(512, (g, s, r) => {
      const n = 8, t = s / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = shade("#e9eeee", (r() - 0.5) * 0.03); g.fillRect(i * t, j * t, t, t); }
      g.fillStyle = "#bcc6c8"; for (let i = 0; i <= n; i++) { g.fillRect(i * t - 1.5, 0, 3, s); g.fillRect(0, i * t - 1.5, s, 3); }
    }, aniso),
    grass: canvasTex(256, (g, s, r) => speckle(g, s, r, "#4f7a39", 0.18, 9000, 2), aniso),
    pavers: canvasTex(512, (g, s, r) => {
      const rows = 8, h = s / rows, w = s / 4;
      for (let i = 0; i < rows; i++) for (let k = -1; k < 5; k++) { const x = k * w + (i % 2) * w / 2; g.fillStyle = shade("#a29e95", (r() - 0.5) * 0.08); g.fillRect(x + 2, i * h + 2, w - 4, h - 4); }
      g.globalCompositeOperation = "destination-over"; g.fillStyle = "#77736c"; g.fillRect(0, 0, s, s); g.globalCompositeOperation = "source-over";
    }, aniso),
    dirt: canvasTex(256, (g, s, r) => speckle(g, s, r, "#7b5f44", 0.2, 7000, 3), aniso),
    concrete: canvasTex(256, (g, s, r) => { speckle(g, s, r, "#a3a19a", 0.08, 6000, 2); for (let k = 0; k < 18; k++) { g.fillStyle = "rgba(90,88,82,0.06)"; g.beginPath(); g.arc(r() * s, r() * s, 10 + r() * 40, 0, 7); g.fill(); } }, aniso),
    stone: canvasTex(512, (g, s, r) => {
      speckle(g, s, r, "#d6d0c4", 0.04, 3000, 2);
      g.strokeStyle = "rgba(150,140,125,0.35)"; g.lineWidth = 1.2;
      for (let k = 0; k < 7; k++) { g.beginPath(); let x = r() * s, y = 0; g.moveTo(x, y); while (y < s) { x += (r() - 0.5) * 40; y += 20 + r() * 30; g.lineTo(x, y); } g.stroke(); }
      g.fillStyle = "#b9b1a3"; g.fillRect(0, s / 2 - 1, s, 2); g.fillRect(s / 2 - 1, 0, 2, s);
    }, aniso),
  };
}
/** Faixa de fluxo (chevrons) e gotas da água: claras, tingidas pelo material (sensor × simulado). */
function stripeTexture(): CanvasTexture {
  const c = document.createElement("canvas"); c.width = 128; c.height = 32;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(255,255,255,0.22)"; g.fillRect(0, 0, 128, 32);
  g.strokeStyle = "rgba(255,255,255,0.98)"; g.lineWidth = 6; g.lineJoin = "round"; g.lineCap = "round";
  for (const x of [14, 78]) { g.beginPath(); g.moveTo(x, 3); g.lineTo(x + 22, 16); g.lineTo(x, 29); g.stroke(); }
  const t = new CanvasTexture(c); t.wrapS = RepeatWrapping; t.wrapT = ClampToEdgeWrapping; t.colorSpace = SRGBColorSpace;
  return t;
}
function waterTexture(): CanvasTexture {
  const c = document.createElement("canvas"); c.width = 16; c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, "rgba(255,255,255,0.95)"); grad.addColorStop(0.45, "rgba(255,255,255,0.35)"); grad.addColorStop(0.55, "rgba(255,255,255,0.8)"); grad.addColorStop(1, "rgba(255,255,255,0.3)");
  g.fillStyle = grad; g.fillRect(0, 0, 16, 64);
  const t = new CanvasTexture(c); t.wrapS = ClampToEdgeWrapping; t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------------------------------------------
// Lote de geometria por material: tudo que não se move vira UMA malha por material e por pavimento (poucas chamadas).
// ---------------------------------------------------------------------------------------------------------------
class Batch {
  private parts = new Map<Material, BufferGeometry[]>();
  add(geo: BufferGeometry, mat: Material, m: Matrix4) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute("uv", new Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
    g.applyMatrix4(m);
    const list = this.parts.get(mat) ?? []; list.push(g); this.parts.set(mat, list);
  }
  flush(into: Group, owned: Set<{ dispose(): void }>, shadows = true) {
    for (const [mat, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      owned.add(merged);
      const mesh = new Mesh(merged, mat);
      const transparent = (mat as MeshStandardMaterial).transparent;
      mesh.castShadow = shadows && !transparent; mesh.receiveShadow = !transparent;
      into.add(mesh);
    }
    this.parts.clear();
  }
}
const M4 = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(rx, ry, rz)), new Vector3(sx, sy, sz));

type Part = { geo: BufferGeometry; mat: Material; m: Matrix4 };
type FixtureModel = { parts: Part[]; top: number; spouts: { a: Vector3; b: Vector3 }[]; sensor: Vector3 };

export function createMapScene(host: HTMLElement, cb: Callbacks): MapScene {
  // Canvas novo a cada montagem: um canvas cujo contexto foi perdido nunca ganha outro.
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:pan-y";
  host.appendChild(canvas);
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: true });
  } catch (e) { canvas.remove(); throw e; }
  let dpr = Math.min(window.devicePixelRatio || 1, host.clientWidth < 600 ? 1.25 : 1.5);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;   // cena parada: a sombra é calculada só quando a maquete muda
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envRT = pmrem.fromScene(room, 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();
  room.traverse(o => { const m = o as Mesh; m.geometry?.dispose(); (m.material as Material | undefined)?.dispose?.(); });

  scene.add(new HemisphereLight("#eef6ff", "#1a2a30", 0.75));
  const sun = new DirectionalLight("#fff1dc", 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  const camera = new PerspectiveCamera(32, 1, 0.1, 400);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.enableZoom = false;               // zoom só com Ctrl/⌘ + roda ou pelos botões: a roda continua rolando a página
  controls.screenSpacePanning = true;
  controls.minPolarAngle = 0.18; controls.maxPolarAngle = 1.32;
  controls.enabled = false;

  // ---------- materiais ----------
  const std = (color: string, roughness = 0.8, metalness = 0, extra: Partial<ConstructorParameters<typeof MeshStandardMaterial>[0]> = {}) => new MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const ftex = floorTextures(aniso);
  const floorMats: Record<FloorMat, MeshStandardMaterial> = Object.fromEntries(Object.entries(ftex).map(([k, t]) => [k, std("#ffffff", k === "stone" || k === "porcelain" ? 0.35 : k === "bathTile" ? 0.3 : 0.85, 0, { map: t })])) as Record<FloorMat, MeshStandardMaterial>;
  const D: Record<Mat, MeshStandardMaterial> = {
    fabric: std("#8a97a0", 0.95), fabricDark: std("#56636b", 0.95), wood: std("#a87c52", 0.6), woodDark: std("#5c4130", 0.55), woodLight: std("#d8bc96", 0.6),
    white: std("#f1f0eb", 0.4), steel: std("#c4ccd0", 0.32, 0.85), black: std("#20262a", 0.45), stone: std("#e2ddd4", 0.28), rug: std("#c9b8a2", 1),
    mattress: std("#f5f3ee", 0.9), pillow: std("#ebe5d9", 0.95), plant: std("#4c8a3f", 0.85), bark: std("#6a4a31", 0.9), pot: std("#b8693f", 0.75),
    cardboard: std("#c79c6b", 0.9), rackOrange: std("#e47a24", 0.5, 0.3), rackBlue: std("#2f5f9e", 0.5, 0.3), concrete: std("#a7a59e", 0.95),
    brick: std("#b6533b", 0.9), sand: std("#d9c08c", 1), net: std("#ff7a1a", 0.8, 0, { transparent: true, opacity: 0.35, side: DoubleSide, depthWrite: false }),
    container: std("#2f6fae", 0.55, 0.3), p0: std("#e04b3a", 0.6), p1: std("#f0b431", 0.6), p2: std("#3a8fd9", 0.6), p3: std("#48b06a", 0.6), p4: std("#9a5bb5", 0.6), p5: std("#f4f2ec", 0.6),
    fruitR: std("#d23a2c", 0.5), fruitO: std("#f08a26", 0.5), fruitG: std("#7cb342", 0.55), tile: std("#e9eeee", 0.3),
    glass: std("#cfeaf3", 0.05, 0, { transparent: true, opacity: 0.22, depthWrite: false }),
  };
  const F = {
    ceramic: std("#f8f8f6", 0.22), chrome: std("#eef2f4", 0.12, 1), basinIn: std("#dfe5e7", 0.2), bronze: std("#a37b3c", 0.35, 0.8),
    tankBlue: std("#1f7fc4", 0.55), tankLid: std("#17639a", 0.5), dial: std("#e8f6ff", 0.05, 0, { transparent: true, opacity: 0.85 }),
    valveRed: std("#d33b2c", 0.5), valveBlue: std("#2f72c4", 0.5), hose: std("#2f8d3a", 0.6), orange: std("#ef7a1d", 0.5, 0.2), drain: std("#5c666b", 0.4, 0.7),
  };
  const wallMat = std("#efebe4", 0.92), capMat = std("#33424a", 0.7), slabMat = std("#cfccc4", 0.9), plinthMat = std("#0f1e25", 0.95), edgeMat = std("#9aa3a6", 0.9);
  const pipeMat = new MeshBasicMaterial({ color: "#8fd3ec", transparent: true, opacity: 0.62, depthTest: false, depthWrite: false });
  const guideMat = new LineBasicMaterial({ color: "#5b7b86", transparent: true, opacity: 0.45 });
  const shared = new Set<{ dispose(): void }>([...Object.values(ftex), ...Object.values(floorMats), ...Object.values(D), ...Object.values(F), wallMat, capMat, slabMat, plinthMat, edgeMat, pipeMat, guideMat]);
  const stripe = stripeTexture(), water = waterTexture();
  shared.add(stripe); shared.add(water);

  // ---------- conteúdo (reconstruído quando a planta muda) ----------
  type NodeParts = { ring: MeshBasicMaterial; ringMesh: Mesh; led: MeshBasicMaterial | null; alert: Mesh; select: Mesh; anchor: Vector3; floor: number; streams: { mesh: Mesh; tex: Texture; mat: MeshBasicMaterial; phase: number }[] };
  type EdgeParts = { from: string; to: string; floors: [number, number]; pipe: Mesh; sleeve: Mesh; mat: MeshBasicMaterial; tex: Texture; phase: number };
  let root = new Group(); scene.add(root);
  let floorGroups = new Map<number, Group>();
  let nodeParts = new Map<string, NodeParts>();
  let edgeParts: EdgeParts[] = [];
  let roomAnchors = new Map<string, { v: Vector3; floor: number }>();
  let floorAnchors = new Map<number, Vector3>();
  let guides: LineSegments | null = null;
  const owned = new Set<{ dispose(): void }>();
  const own = <T extends { dispose(): void }>(r: T): T => { owned.add(r); return r; };

  function clearSite() {
    scene.remove(root);
    for (const r of owned) r.dispose();
    owned.clear();
    root = new Group(); scene.add(root);
    floorGroups = new Map(); nodeParts = new Map(); edgeParts = []; roomAnchors = new Map(); floorAnchors = new Map(); guides = null;
  }

  function fixtureModel(fx: Fixture, kind: WaterLayout["kind"], floor: number): FixtureModel {
    const parts: Part[] = [], d = FIXTURE_DEPTH[fx], w = FIXTURE_WIDTH[fx], back = -d / 2;
    const put = (geo: BufferGeometry, mat: Material, m: Matrix4) => parts.push({ geo, mat, m });
    const box = (sx: number, sy: number, sz: number, mat: Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => put(new BoxGeometry(sx, sy, sz), mat, M4(x, y, z, rx, ry, rz));
    const cyl = (rt: number, rb: number, h: number, mat: Material, x: number, y: number, z: number, rx = 0, rz = 0, seg = 20, sz = 1) => put(new CylinderGeometry(rt, rb, h, seg), mat, M4(x, y, z, rx, 0, rz, 1, 1, sz));
    const tor = (r: number, t: number, mat: Material, x: number, y: number, z: number, rx = 0, ry = 0, arc = Math.PI * 2, sz = 1) => put(new TorusGeometry(r, t, 8, 24, arc), mat, M4(x, y, z, rx, ry, 0, 1, 1, sz));
    const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
    let top = 1, spouts: FixtureModel["spouts"] = [], sensor = V(-w / 2 - 0.12, 0.14, back + 0.1);
    switch (fx) {
      case "KITCHEN_SINK":
        box(1.2, 0.86, 0.58, D.woodLight, 0, 0.43, 0); box(1.22, 0.04, 0.6, D.stone, 0, 0.88, 0);
        box(0.6, 0.006, 0.44, D.steel, 0, 0.903, 0.02); box(0.54, 0.008, 0.38, F.drain, 0, 0.906, 0.02);
        box(0.005, 0.7, 0.003, D.woodDark, 0, 0.44, 0.292);
        cyl(0.022, 0.026, 0.06, F.chrome, 0, 0.93, -0.2); cyl(0.013, 0.013, 0.3, F.chrome, 0, 1.08, -0.2);
        tor(0.09, 0.013, F.chrome, 0, 1.23, -0.11, 0, Math.PI / 2, Math.PI);
        spouts = [{ a: V(0, 1.21, -0.02), b: V(0, 0.91, -0.02) }]; top = 1.33; break;
      case "PREP_SINK":
        for (const [x, z] of [[-0.65, -0.3], [0.65, -0.3], [-0.65, 0.3], [0.65, 0.3]]) cyl(0.02, 0.02, 0.86, D.steel, x, 0.43, z);
        box(1.4, 0.05, 0.7, D.steel, 0, 0.885, 0); box(1.34, 0.02, 0.62, D.steel, 0, 0.2, 0); box(1.4, 0.18, 0.03, D.steel, 0, 0.99, -0.335);
        for (const x of [-0.33, 0.33]) box(0.52, 0.012, 0.44, F.drain, x, 0.912, 0.03);
        cyl(0.015, 0.015, 0.55, F.chrome, -0.33, 1.17, -0.3); box(0.02, 0.02, 0.25, F.chrome, -0.33, 1.44, -0.19); cyl(0.012, 0.012, 0.14, F.chrome, -0.33, 1.37, -0.07);
        spouts = [{ a: V(-0.33, 1.3, -0.07), b: V(-0.33, 0.915, -0.07) }]; top = 1.5; break;
      case "BASIN":
        cyl(0.08, 0.11, 0.7, F.ceramic, 0, 0.35, -0.08); put(new RoundedBoxGeometry(0.52, 0.16, 0.42, 2, 0.05), F.ceramic, M4(0, 0.78, 0));
        cyl(0.18, 0.18, 0.01, F.basinIn, 0, 0.862, 0.02, 0, 0, 24, 0.8);
        cyl(0.018, 0.02, 0.1, F.chrome, 0, 0.91, -0.16); box(0.02, 0.02, 0.1, F.chrome, 0, 0.95, -0.12);
        spouts = [{ a: V(0, 0.94, -0.07), b: V(0, 0.865, -0.07) }]; top = 1.0; break;
      case "TOILET":
        box(0.4, 0.36, 0.17, F.ceramic, 0, 0.6, -0.255); cyl(0.13, 0.16, 0.36, F.ceramic, 0, 0.18, 0.04, 0, 0, 24, 1.2);
        cyl(0.19, 0.17, 0.08, F.ceramic, 0, 0.4, 0.06, 0, 0, 28, 1.25); tor(0.14, 0.035, F.ceramic, 0, 0.45, 0.06, Math.PI / 2, 0, Math.PI * 2, 1.2);
        cyl(0.025, 0.025, 0.012, F.chrome, 0, 0.785, -0.255); top = 0.85; break;
      case "SHOWER":
        box(0.92, 0.05, 0.92, F.ceramic, 0, 0.025, 0); cyl(0.04, 0.04, 0.006, F.drain, 0, 0.053, 0.1);
        box(0.92, 1.15, 0.012, D.glass, 0, 0.63, 0.455); box(0.012, 1.15, 0.92, D.glass, 0.455, 0.63, 0);
        cyl(0.012, 0.012, 1.7, F.chrome, 0, 0.9, -0.44); box(0.02, 0.02, 0.25, F.chrome, 0, 1.74, -0.33); cyl(0.1, 0.1, 0.025, F.chrome, 0, 1.72, -0.21);
        cyl(0.03, 0.03, 0.06, F.chrome, 0, 1.0, -0.43, Math.PI / 2);
        spouts = Array.from({ length: 9 }, (_, k) => { const t = (k / 9) * Math.PI * 2, rr = k === 0 ? 0 : 0.06; return { a: V(Math.cos(t) * rr, 1.7, -0.21 + Math.sin(t) * rr), b: V(Math.cos(t) * rr * 2.6, 0.06, -0.15 + Math.sin(t) * rr * 2.6) }; });
        sensor = V(-0.55, 0.14, -0.4); top = 1.85; break;
      case "TANK":
        box(0.5, 0.62, 0.4, D.white, 0, 0.31, -0.02); box(0.6, 0.24, 0.56, D.white, 0, 0.74, 0); box(0.5, 0.01, 0.42, F.basinIn, 0, 0.865, 0.03);
        cyl(0.015, 0.015, 0.12, F.chrome, 0, 1.02, -0.22, Math.PI / 2); cyl(0.012, 0.012, 0.05, F.chrome, 0, 1.0, -0.16);
        spouts = [{ a: V(0, 0.975, -0.16), b: V(0, 0.87, -0.16) }]; top = 1.1; break;
      case "WASHER":
        box(0.6, 0.86, 0.6, D.white, 0, 0.43, 0); cyl(0.21, 0.21, 0.012, D.glass, 0, 0.866, 0.03); box(0.6, 0.08, 0.08, D.white, 0, 0.9, -0.26);
        box(0.12, 0.03, 0.01, D.black, 0, 0.91, -0.215); cyl(0.015, 0.015, 0.08, F.chrome, 0.22, 1.0, -0.3, Math.PI / 2); top = 1.0; break;
      case "GARDEN_TAP":
        cyl(0.015, 0.015, 0.6, F.bronze, 0, 0.3, -0.06); cyl(0.02, 0.02, 0.08, F.chrome, 0, 0.62, -0.03, Math.PI / 2); box(0.07, 0.012, 0.012, F.chrome, 0, 0.66, -0.03);
        cyl(0.012, 0.012, 0.06, F.chrome, 0, 0.6, 0.01); tor(0.22, 0.022, F.hose, 0.34, 0.03, 0.14, Math.PI / 2);
        spouts = [{ a: V(0, 0.57, 0.015), b: V(0, 0.01, 0.06) }]; top = 0.75; break;
      case "HOSE":
        cyl(0.015, 0.015, 0.6, F.bronze, -0.14, 0.3, -0.07); cyl(0.02, 0.02, 0.08, F.chrome, -0.14, 0.62, -0.04, Math.PI / 2); box(0.07, 0.012, 0.012, F.chrome, -0.14, 0.66, -0.04);
        cyl(0.2, 0.2, 0.1, D.rackOrange, 0.14, 0.55, -0.04, Math.PI / 2); cyl(0.12, 0.12, 0.11, F.hose, 0.14, 0.55, -0.04, Math.PI / 2);
        spouts = [{ a: V(-0.14, 0.58, 0.0), b: V(-0.14, 0.01, 0.07) }]; top = 0.82; break;
      case "DRINKING":
        box(0.34, 0.92, 0.32, D.steel, 0, 0.46, 0); box(0.3, 0.03, 0.26, F.drain, 0, 0.935, 0.01); cyl(0.012, 0.012, 0.05, F.chrome, 0, 0.97, -0.05);
        box(0.06, 0.06, 0.02, D.black, 0.1, 0.8, 0.165);
        spouts = [{ a: V(0, 0.995, -0.05), b: V(0, 0.945, 0.03) }]; top = 1.05; break;
      case "MIXER":
        put(new CylinderGeometry(0.28, 0.42, 0.62, 28, 1, false), F.orange, M4(0, 0.98, 0.05, -0.6)); tor(0.42, 0.03, F.orange, 0, 0.98, 0.05, Math.PI / 2 - 0.6);
        box(0.8, 0.06, 1.0, D.black, 0, 0.55, 0); for (const [x, z] of [[-0.35, -0.4], [0.35, -0.4], [-0.35, 0.4], [0.35, 0.4]]) box(0.06, 0.55, 0.06, D.black, x, 0.27, z);
        for (const x of [-0.46, 0.46]) tor(0.17, 0.05, D.black, x, 0.18, -0.35, 0, Math.PI / 2);
        box(0.25, 0.25, 0.3, D.black, 0.35, 0.72, -0.4); cyl(0.025, 0.025, 1.3, F.bronze, -0.55, 0.65, 0.4); box(0.02, 0.02, 0.22, F.chrome, -0.55, 1.3, 0.5);
        spouts = [{ a: V(-0.55, 1.28, 0.6), b: V(-0.12, 1.12, 0.35) }]; sensor = V(-0.7, 0.14, 0.4); top = 1.45; break;
      case "TAP":
        cyl(0.02, 0.02, 0.7, F.bronze, 0, 0.35, -0.04); cyl(0.02, 0.02, 0.08, F.chrome, 0, 0.7, 0, Math.PI / 2); box(0.07, 0.012, 0.012, F.chrome, 0, 0.74, 0);
        put(new CylinderGeometry(0.15, 0.12, 0.3, 20, 1, true), D.black, M4(0, 0.15, 0.13)); cyl(0.12, 0.12, 0.01, D.black, 0, 0.005, 0.13);
        spouts = [{ a: V(0, 0.68, 0.045), b: V(0, 0.28, 0.12) }]; top = 0.85; break;
      case "HYDROMETER":
        box(0.56, 0.72, 0.06, D.concrete, 0, 0.36, -0.13); for (const x of [-0.18, 0.18]) cyl(0.022, 0.022, 0.5, D.steel, x, 0.25, -0.04);
        cyl(0.022, 0.022, 0.4, D.steel, 0, 0.5, -0.04, 0, Math.PI / 2); cyl(0.07, 0.07, 0.14, D.black, 0, 0.5, -0.04, 0, Math.PI / 2);
        cyl(0.075, 0.075, 0.06, F.bronze, 0, 0.56, -0.04); cyl(0.065, 0.065, 0.012, F.dial, 0, 0.596, -0.04); box(0.08, 0.015, 0.015, F.valveRed, 0.12, 0.56, -0.04);
        sensor = V(0, 0.62, -0.04); top = 0.8; break;
      case "WATER_TANK": {
        const h = floor === 0 && (kind === "HOUSE" || kind === "CONSTRUCTION") ? 1.7 : 0.25;
        for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) box(0.09, h, 0.09, D.concrete, x, h / 2, z);
        box(1.45, 0.08, 1.45, D.concrete, 0, h + 0.04, 0);
        put(new CylinderGeometry(0.62, 0.5, 0.82, 40), F.tankBlue, M4(0, h + 0.49, 0)); cyl(0.66, 0.66, 0.06, F.tankLid, 0, h + 0.93, 0, 0, 0, 40); cyl(0.2, 0.2, 0.05, F.tankLid, 0, h + 0.98, 0);
        cyl(0.025, 0.025, h + 0.12, D.steel, 0.3, (h + 0.12) / 2, 0.45);
        sensor = V(0.5, h + 0.5, 0.45); top = h + 1.1; break;
      }
      default: // MANIFOLD
        box(0.08, 0.45, 0.08, D.concrete, 0, 0.225, -0.05); cyl(0.025, 0.025, 0.5, D.steel, 0, 0.45, -0.05, 0, Math.PI / 2);
        box(0.07, 0.02, 0.02, F.valveRed, -0.12, 0.5, -0.05); box(0.07, 0.02, 0.02, F.valveBlue, 0.12, 0.5, -0.05); top = 0.65;
    }
    return { parts, top, spouts, sensor };
  }

  function buildSite(layout: WaterLayout) {
    clearSite();
    const p = planSite(layout);
    const fp = FOOTPRINT[layout.kind];
    const batches = new Map<number, Batch>();
    const batch = (f: number) => { let b = batches.get(f); if (!b) { b = new Batch(); batches.set(f, b); } return b; };
    const group = (f: number) => { let g = floorGroups.get(f); if (!g) { g = new Group(); floorGroups.set(f, g); root.add(g); } return g; };

    // Base da maquete (placa escura sob o térreo) e laje de cada pavimento.
    const plinth = own(new RoundedBoxGeometry(fp.w + 1.6, 0.32, fp.d + 1.6, 2, 0.12));
    const base = new Mesh(plinth, plinthMat); base.position.y = -SLAB_T - 0.16; base.receiveShadow = true; group(0).add(base);
    for (const f of p.floors) {
      const y = floorY(f);
      floorAnchors.set(f, new Vector3(-fp.w / 2 - 0.35, y + 0.05, 0));
      if (!p.rooms.some(r => r.floor === f) && f > 0) {
        // Cobertura sem cômodos: só a plataforma do barrilete sob as peças (uma laje cheia taparia o andar de baixo).
        const ps = layout.nodes.filter(n => floorOf(n) === f).map(n => p.poses.get(n.id)!);
        const x0 = Math.min(...ps.map(q => q.x)) - 1.3, x1 = Math.max(...ps.map(q => q.x)) + 1.3, z0 = Math.min(...ps.map(q => q.z)) - 1.3, z1 = Math.max(...ps.map(q => q.z)) + 1.3;
        batch(f).add(new BoxGeometry(x1 - x0, SLAB_T, z1 - z0), edgeMat, M4((x0 + x1) / 2, y - SLAB_T / 2, (z0 + z1) / 2));
        for (const [sx, sz, x, z] of [[x1 - x0, 0.1, (x0 + x1) / 2, z0 + 0.05], [x1 - x0, 0.1, (x0 + x1) / 2, z1 - 0.05], [0.1, z1 - z0, x0 + 0.05, (z0 + z1) / 2], [0.1, z1 - z0, x1 - 0.05, (z0 + z1) / 2]] as const)
          batch(f).add(new BoxGeometry(sx, 0.4, sz), wallMat, M4(x, y + 0.2, z));
        continue;
      }
      batch(f).add(new BoxGeometry(fp.w + 0.3, SLAB_T, fp.d + 0.3), f === 0 ? slabMat : edgeMat, M4(0, y - SLAB_T / 2, 0));
    }
    // Pisos (textura em escala real: a UV é multiplicada pelo tamanho em metros).
    for (const r of p.rooms) {
      const w = r.rect.x1 - r.rect.x0, dd = r.rect.z1 - r.rect.z0, s = TILE_M[r.mat];
      const geo = new PlaneGeometry(w, dd);
      const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / s, (uv.getY(i) * dd) / s);
      batch(r.floor).add(geo, floorMats[r.mat], M4((r.rect.x0 + r.rect.x1) / 2, floorY(r.floor) + 0.004, (r.rect.z0 + r.rect.z1) / 2, -Math.PI / 2));
      if (r.bath) {
        const bw = r.bath.x1 - r.bath.x0, bd = r.bath.z1 - r.bath.z0, g2 = new PlaneGeometry(bw, bd), u2 = g2.attributes.uv;
        for (let i = 0; i < u2.count; i++) u2.setXY(i, (u2.getX(i) * bw) / TILE_M.bathTile, (u2.getY(i) * bd) / TILE_M.bathTile);
        batch(r.floor).add(g2, floorMats.bathTile, M4((r.bath.x0 + r.bath.x1) / 2, floorY(r.floor) + 0.007, (r.bath.z0 + r.bath.z1) / 2, -Math.PI / 2));
      }
      roomAnchors.set(r.id, { v: new Vector3(r.rect.x0 + 0.25, floorY(r.floor) + 0.05, r.rect.z0 + 0.32), floor: r.floor });
    }
    // Paredes cortadas na altura do peito, com a "tampa" escura do corte (padrão de planta humanizada).
    for (const w of p.walls) {
      const sx = w.x1 - w.x0, sz = w.z1 - w.z0, cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2, y = floorY(w.floor);
      batch(w.floor).add(new BoxGeometry(sx, WALL_H, sz), wallMat, M4(cx, y + WALL_H / 2, cz));
      batch(w.floor).add(new BoxGeometry(sx + 0.002, 0.02, sz + 0.002), capMat, M4(cx, y + WALL_H + 0.01, cz));
    }
    // Folha da porta aberta a 90° (portas comuns; a entrada larga do salão fica livre).
    for (const d of p.doors) if (d.width <= 1.05) {
      const r0 = p.rooms.find(r => r.id === d.rooms[0])!, y = floorY(d.floor), h = WALL_H - 0.06;
      const inward = d.along === "x" ? Math.sign((r0.rect.z0 + r0.rect.z1) / 2 - d.z) || 1 : Math.sign((r0.rect.x0 + r0.rect.x1) / 2 - d.x) || 1;
      if (d.along === "x") batch(d.floor).add(new BoxGeometry(0.04, h, d.width - 0.05), D.woodLight, M4(d.x - d.width / 2 + 0.03, y + h / 2, d.z + inward * (d.width / 2)));
      else batch(d.floor).add(new BoxGeometry(d.width - 0.05, h, 0.04), D.woodLight, M4(d.x + inward * (d.width / 2), y + h / 2, d.z - d.width / 2 + 0.03));
    }
    // Móveis.
    const unit = { sphere: new SphereGeometry(0.5, 14, 10), cone: new ConeGeometry(0.5, 1, 20) };
    for (const { floor, item: it } of p.items) {
      const y = floorY(floor) + it.y, mat = D[it.mat];
      if (it.shape === "box") batch(floor).add(new BoxGeometry(it.sx, it.sy, it.sz), mat, M4(it.x, y, it.z, 0, it.ry ?? 0));
      else if (it.shape === "cyl") batch(floor).add(new CylinderGeometry(it.sx / 2, it.sx / 2, it.sy, 16), mat, M4(it.x, y, it.z, it.ry ? Math.PI / 2 : 0, 0, 0));
      else batch(floor).add(unit[it.shape], mat, M4(it.x, y, it.z, 0, 0, 0, it.sx, it.sy, it.sz));
    }
    unit.sphere.dispose(); unit.cone.dispose();

    // Louças e o que é dinâmico em cada ponto (anel de estado, LED do sensor, água).
    const ringGeo = own(new RingGeometry(0.42, 0.5, 48)), alertGeo = own(new RingGeometry(0.56, 0.64, 48)), selGeo = own(new RingGeometry(0.5, 0.56, 48));
    const ledGeo = own(new SphereGeometry(0.03, 12, 8)), sensorGeo = own(new CylinderGeometry(0.035, 0.035, 0.12, 14)), splashGeo = own(new RingGeometry(0.02, 0.07, 20));
    for (const n of layout.nodes) {
      const pose = p.poses.get(n.id)!, f = floorOf(n), y = floorY(f), g = group(f);
      const model = fixtureModel(pose.fixture, layout.kind, f);
      const place = new Matrix4().compose(new Vector3(pose.x, y, pose.z), new Quaternion().setFromEuler(new Euler(0, pose.ry, 0)), new Vector3(1, 1, 1));
      for (const part of model.parts) { batch(f).add(part.geo, part.mat, place.clone().multiply(part.m)); part.geo.dispose(); }
      const toWorldPt = (v: Vector3) => v.clone().applyMatrix4(place);
      const scale = Math.max(0.7, Math.max(FIXTURE_WIDTH[pose.fixture], FIXTURE_DEPTH[pose.fixture]) / 0.9);
      const ring = own(new MeshBasicMaterial({ color: COLORS.none, transparent: true, opacity: 0.5, depthWrite: false }));
      const ringMesh = new Mesh(ringGeo, ring); ringMesh.rotation.x = -Math.PI / 2; ringMesh.position.set(pose.x, y + 0.012, pose.z); ringMesh.scale.setScalar(scale); g.add(ringMesh);
      const alertMat = own(new MeshBasicMaterial({ color: COLORS.warn, transparent: true, opacity: 0.9, side: DoubleSide, depthWrite: false }));
      const alert = new Mesh(alertGeo, alertMat); alert.rotation.x = -Math.PI / 2; alert.position.set(pose.x, y + 0.014, pose.z); alert.scale.setScalar(scale); alert.visible = false; g.add(alert);
      const selMat = own(new MeshBasicMaterial({ color: COLORS.select, transparent: true, opacity: 0.95, side: DoubleSide, depthWrite: false }));
      const select = new Mesh(selGeo, selMat); select.rotation.x = -Math.PI / 2; select.position.set(pose.x, y + 0.016, pose.z); select.scale.setScalar(scale * 1.08); select.visible = false; g.add(select);
      let led: MeshBasicMaterial | null = null;
      if (n.deviceId) {
        const s = toWorldPt(model.sensor);
        if (pose.fixture !== "HYDROMETER") { const body = new Mesh(sensorGeo, D.black); body.position.copy(s); body.rotation.z = Math.PI / 2; body.castShadow = true; g.add(body); }
        led = own(new MeshBasicMaterial({ color: COLORS.none }));
        const l = new Mesh(ledGeo, led); l.position.copy(s).add(new Vector3(0, pose.fixture === "HYDROMETER" ? 0.03 : 0.05, 0)); g.add(l);
      }
      const streams: NodeParts["streams"] = [];
      for (const sp of model.spouts) {
        const a = toWorldPt(sp.a), b = toWorldPt(sp.b), len = a.distanceTo(b);
        if (len < 0.02) continue;
        const geo = own(new CylinderGeometry(0.009, 0.015, len, 10, 1, true));
        const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len * 5);
        const tex = own(water.clone()); tex.needsUpdate = true;
        const mat = own(new MeshBasicMaterial({ color: COLORS.water, map: tex, transparent: true, opacity: 0.85, depthWrite: false }));
        const mesh = new Mesh(geo, mat);
        mesh.position.copy(a).add(b).multiplyScalar(0.5);
        mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), a.clone().sub(b).normalize());
        mesh.visible = false; mesh.renderOrder = 3; g.add(mesh);
        const splash = new Mesh(splashGeo, mat); splash.rotation.x = -Math.PI / 2; splash.position.copy(b).add(new Vector3(0, 0.004, 0)); mesh.attach(splash);
        streams.push({ mesh, tex, mat, phase: 0 });
      }
      nodeParts.set(n.id, { ring, ringMesh, led, alert, select, anchor: new Vector3(pose.x, y + model.top + 0.3, pose.z), floor: f, streams });
    }
    for (const [f, b] of batches) b.flush(group(f), owned);

    // Canos em "raio-x" (sempre visíveis, por cima de tudo) + manga com chevrons quando o destino mede fluxo.
    for (const pipe of p.pipes) {
      if (pipe.points.length < 2) continue;
      const pts = pipe.points.map(q => new Vector3(q.x, q.y, q.z));
      const path = new CurvePath<Vector3>();
      let cur = pts[0].clone();
      for (let i = 1; i < pts.length; i++) {
        const q = pts[i];
        if (i < pts.length - 1) {
          const a = q.clone().sub(cur), b = pts[i + 1].clone().sub(q), rr = Math.min(0.22, a.length() / 2, b.length() / 2);
          const p1 = q.clone().sub(a.normalize().multiplyScalar(rr)), p2 = q.clone().add(b.normalize().multiplyScalar(rr));
          if (cur.distanceTo(p1) > 1e-4) path.add(new LineCurve3(cur, p1));
          path.add(new QuadraticBezierCurve3(p1, q.clone(), p2));
          cur = p2;
        } else path.add(new LineCurve3(cur, q.clone()));
      }
      const len = path.getLength(), segs = Math.max(16, Math.round(len * 10));
      const tube = new Mesh(own(new TubeGeometry(path, segs, 0.035, 10, false)), pipeMat); tube.renderOrder = 4; root.add(tube);
      const tex = own(stripe.clone()); tex.needsUpdate = true; tex.repeat.set(Math.max(1, len * 1.6), 1);
      const mat = own(new MeshBasicMaterial({ color: COLORS.flow, map: tex, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }));
      const sleeve = new Mesh(own(new TubeGeometry(path, segs, 0.052, 10, false)), mat); sleeve.visible = false; sleeve.renderOrder = 5; root.add(sleeve);
      const fa = floorOf(layout.nodes.find(n => n.id === pipe.from)!), fb = floorOf(layout.nodes.find(n => n.id === pipe.to)!);
      edgeParts.push({ from: pipe.from, to: pipe.to, floors: [fa, fb], pipe: tube, sleeve, mat, tex, phase: 0 });
    }
    // Prédio: guias verticais nos cantos ligando as lajes (leitura de "andares empilhados").
    if (p.floors.length > 1) {
      const top = floorY(Math.max(...p.rooms.map(r => r.floor))), pts: number[] = [];
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pts.push(x * (fp.w / 2 + 0.15), -SLAB_T, z * (fp.d / 2 + 0.15), x * (fp.w / 2 + 0.15), top, z * (fp.d / 2 + 0.15));
      const geo = own(new BufferGeometry()); geo.setAttribute("position", new Float32BufferAttribute(pts, 3));
      guides = new LineSegments(geo, guideMat); root.add(guides);
    }
  }

  // ---------- estado ----------
  const state: Required<MapSceneInput> = { layout: { kind: "HOUSE", rooms: [], nodes: [], edges: [] }, nodes: {}, simulated: false, selected: "", still: false, visible: true, floor: "all", interactive: false };
  let raf = false, last = 0, disposed = false, siteKey = "", floorKey = "";
  let budget: BudgetState = budgetStart(performance.now());
  const deltas: number[] = [];
  let lastStatsAt = 0, lastBudgetAt = 0;
  const home = { target: new Vector3(), position: new Vector3(), dist: 10 };

  const floorVisible = (f: number) => state.floor === "all" || state.floor === f;
  const moving = () => edgeParts.some(e => e.sleeve.visible) || [...nodeParts.values()].some(n => n.streams.some(s => s.mesh.visible));
  const applyLook = () => {
    const flowColor = state.simulated ? COLORS.flowSim : COLORS.flow;
    for (const [id, parts] of nodeParts) {
      const v = state.nodes[id] ?? { state: "UNMETERED", flowLpm: null, alert: false };
      const c = nodeColor(v, state.simulated);
      parts.ring.color.set(c); parts.ring.opacity = v.state === "UNMETERED" ? 0.22 : 0.6;
      parts.led?.color.set(v.state === "FLOW" || v.state === "IDLE" ? flowColor : v.state === "STALE" ? COLORS.stale : COLORS.none);
      parts.alert.visible = v.alert;
      parts.select.visible = state.selected === id;
      const flowing = v.state === "FLOW" && stripeSpeed(v.flowLpm) > 0;
      for (const s of parts.streams) { s.mesh.visible = flowing && floorVisible(parts.floor); s.mat.color.set(state.simulated ? COLORS.flowSim : COLORS.water); }
    }
    for (const e of edgeParts) {
      const v = state.nodes[e.to];
      const shown = floorVisible(e.floors[0]) || floorVisible(e.floors[1]);
      e.pipe.visible = shown;
      e.sleeve.visible = shown && !!v && v.state === "FLOW" && stripeSpeed(v.flowLpm) > 0;
      e.mat.color.set(v?.alert ? COLORS.warn : flowColor);
    }
  };

  const visibleBox = () => {
    const box = new Box3();
    for (const [f, g] of floorGroups) if (floorVisible(f)) box.expandByObject(g);
    if (box.isEmpty()) box.setFromObject(root);
    return box;
  };
  /** Vista de três quartos que enquadra o que está visível (um pavimento ou o prédio inteiro). */
  function fitView() {
    // Pontos que importam no enquadramento: cantos da laje (e da base), topo das paredes e o alto de cada peça.
    // (Os cantos da caixa da cena inteira superestimam: a torre da caixa d'água "subiria" a planta toda.)
    const fp = FOOTPRINT[state.layout.kind], pts: Vector3[] = [];
    for (const f of floorGroups.keys()) if (floorVisible(f)) {
      const y = floorY(f), m = f === 0 ? 0.8 : 0.15;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        pts.push(new Vector3(sx * (fp.w / 2 + m), y - SLAB_T - (f === 0 ? 0.32 : 0), sz * (fp.d / 2 + m)));
        pts.push(new Vector3(sx * fp.w / 2, y + WALL_H, sz * fp.d / 2));
      }
    }
    for (const n of nodeParts.values()) if (floorVisible(n.floor)) pts.push(n.anchor.clone());
    const box = pts.length ? new Box3().setFromPoints(pts) : visibleBox(), center = box.getCenter(new Vector3());
    const stacked = state.floor === "all" && floorGroups.size > 1;
    // Prédio inteiro: câmera mais baixa (~29°) para enxergar dentro de cada andar sob a laje de cima.
    const el = stacked ? 0.5 : camera.aspect < 1.2 ? 0.92 : 0.72, az = -0.5;
    const dir = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    // Enquadramento exato: para cada canto da caixa, a distância mínima para ele caber no campo de visão (com margem
    // em cima para os rótulos). Base da câmera: frente = -dir, direita e cima ortogonais.
    const fwd = dir.clone().negate(), right = new Vector3().crossVectors(fwd, new Vector3(0, 1, 0)).normalize(), up = new Vector3().crossVectors(right, fwd);
    const tanV = Math.tan((camera.fov * Math.PI) / 360), tanH = tanV * camera.aspect, TOP = 0.86, BOT = 0.97, SIDE = 0.95;
    const fitPts = pts.length ? pts : [box.min, box.max];
    // Distância mínima para todo ponto caber (profundidade na câmera = dist + along) e, em seguida, recentraliza:
    // o centro da caixa não é o centro na tela (o que está perto da câmera desce mais). 5 rodadas equilibram as bordas.
    const target = center.clone();
    let dist = 1;
    for (let k = 0; k < 5; k++) {
      dist = 1;
      for (const q of fitPts) {
        const v = q.clone().sub(target), along = v.dot(fwd), sx = Math.abs(v.dot(right)), sy = v.dot(up);
        dist = Math.max(dist, sx / (tanH * SIDE) - along, (sy > 0 ? sy / (tanV * TOP) : -sy / (tanV * BOT)) - along);
      }
      camera.position.copy(target).addScaledVector(dir, dist); camera.lookAt(target); camera.updateMatrixWorld();
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const q of fitPts) { const s = q.clone().project(camera); x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y); }
      target.addScaledVector(right, ((x0 + x1) / 2) * tanH * dist).addScaledVector(up, ((y0 + y1) / 2 - (TOP - BOT) / 2) * tanV * dist);
    }
    home.target.copy(target);
    home.position.copy(target).addScaledVector(dir, dist);
    home.dist = dist;
    controls.minDistance = dist * 0.25; controls.maxDistance = dist * 2.4;
    camera.position.copy(home.position); controls.target.copy(home.target); controls.update();
    camera.near = Math.max(0.05, dist / 200); camera.far = dist * 20; camera.updateProjectionMatrix();
    // Sombra: luz do sol enquadra a cena inteira (todos os pavimentos), calculada uma vez.
    const all = new Box3().setFromObject(root), c = all.getCenter(new Vector3()), r = all.getSize(new Vector3()).length() / 2;
    sun.position.copy(c).add(new Vector3(-0.55, 1, 0.45).normalize().multiplyScalar(r * 2)); sun.target.position.copy(c);
    const sc = sun.shadow.camera; sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 0.1; sc.far = r * 4; sc.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;
  }

  const fit = () => {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };

  const draw = () => { if (!disposed && state.visible && document.visibilityState === "visible") { renderer.render(scene, camera); cb.onFrame?.(); } };
  const wantsLoop = () => !disposed && state.visible && !state.still && document.visibilityState === "visible" && moving();
  const tick = (now: number) => {
    const dtMs = last ? Math.max(0, now - last) : 16.7;
    last = Math.max(last, now);
    const dt = Math.min(0.1, dtMs / 1000);
    for (const e of edgeParts) {
      if (!e.sleeve.visible) continue;
      // Fase acumulada por quadro (nunca tempo × velocidade): mudar a vazão muda o ritmo sem pular de posição.
      e.phase = (e.phase + stripeSpeed(state.nodes[e.to]?.flowLpm ?? null) * dt) % 1;
      e.tex.offset.x = -e.phase;
    }
    for (const [id, n] of nodeParts) for (const s of n.streams) {
      if (!s.mesh.visible) continue;
      s.phase = (s.phase + stripeSpeed(state.nodes[id]?.flowLpm ?? null) * 1.6 * dt) % 1;
      s.tex.offset.y = s.phase;
    }
    renderer.render(scene, camera);
    deltas.push(dtMs); if (deltas.length > 90) deltas.shift();
    if (now - lastBudgetAt > 500) {
      lastBudgetAt = now;
      const next = frameBudgetStep(budget, now, median(deltas));
      if (next.level !== budget.level) {
        budget = next;
        if (budget.level === 1) { dpr = 1; renderer.setPixelRatio(1); fit(); }
        else if (budget.level === 2) { stopLoop(); cb.onBudget(); return; }
      } else budget = next;
    }
    if (cb.onStats && now - lastStatsAt > 500) {
      lastStatsAt = now;
      const s = [...deltas].sort((a, b) => a - b), q = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0;
      cb.onStats({ fps: s.length ? 1000 / (deltas.reduce((a, b) => a + b, 0) / deltas.length) : 0, p50: q(0.5), p95: q(0.95), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, dpr, level: budget.level });
    }
    if (!wantsLoop()) stopLoop();
  };
  const startLoop = () => { if (raf || !wantsLoop()) return; raf = true; last = 0; deltas.length = 0; budget = budgetRestart(budget, performance.now()); renderer.setAnimationLoop(tick); };
  function stopLoop() { if (!raf) return; raf = false; renderer.setAnimationLoop(null); }
  const refresh = () => { if (wantsLoop()) startLoop(); else { stopLoop(); draw(); } };

  controls.addEventListener("change", () => { if (!raf) draw(); cb.onView?.(); });
  const zoom = (factor: number) => {
    const dir = camera.position.clone().sub(controls.target);
    const len = Math.min(controls.maxDistance, Math.max(controls.minDistance, dir.length() * factor));
    camera.position.copy(controls.target).add(dir.setLength(len));
    controls.update();
  };
  const onWheel = (e: WheelEvent) => { if (!state.interactive || !(e.ctrlKey || e.metaKey)) return; e.preventDefault(); zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12); };
  canvas.addEventListener("wheel", onWheel, { passive: false });
  const onVisibility = () => refresh();
  document.addEventListener("visibilitychange", onVisibility);
  const onLost = (e: Event) => { e.preventDefault(); stopLoop(); if (!disposed) cb.onLost(); };
  canvas.addEventListener("webglcontextlost", onLost);
  const ro = new ResizeObserver(() => { fit(); draw(); cb.onView?.(); });
  ro.observe(host);
  fit();

  const ready = renderer.compileAsync(scene, camera).then(() => { if (!disposed) refresh(); });
  const toScreen = (v: Vector3): ScreenPoint => { const p = v.clone().project(camera); return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 }; };
  const inFront = (v: Vector3) => v.clone().applyMatrix4(camera.matrixWorldInverse).z < 0;

  return {
    ready,
    update(i) {
      Object.assign(state, { floor: "all", interactive: false, ...i });
      const keyNow = JSON.stringify([i.layout.kind, i.layout.rooms, i.layout.nodes.map(n => [n.id, n.kind, n.x, n.y, n.fixture, n.floor, !!n.deviceId]), i.layout.edges]);
      let refit = false;
      if (keyNow !== siteKey) {
        siteKey = keyNow;
        buildSite(i.layout);
        refit = true;
        // Peças novas: compila antes do próximo desenho (sem travar o primeiro quadro com a cena nova).
        void renderer.compileAsync(scene, camera).then(() => { if (!disposed) { applyLook(); refresh(); } });
      }
      const fk = String(state.floor);
      if (fk !== floorKey || refit) {
        floorKey = fk;
        for (const [f, g] of floorGroups) g.visible = floorVisible(f);
        if (guides) guides.visible = state.floor === "all";
        fitView(); refit = true;
      }
      controls.enabled = !!state.interactive;
      canvas.style.touchAction = state.interactive ? "none" : "pan-y";
      canvas.style.cursor = state.interactive ? "grab" : "default";
      applyLook();
      refresh();
      if (refit) cb.onView?.();
    },
    project() {
      camera.updateMatrixWorld();
      const nodes: Record<string, ScreenPoint> = {}, rooms: Record<string, ScreenPoint> = {}, floors: Record<string, ScreenPoint> = {};
      for (const [id, parts] of nodeParts) if (floorVisible(parts.floor) && inFront(parts.anchor)) nodes[id] = toScreen(parts.anchor);
      for (const [id, a] of roomAnchors) if (floorVisible(a.floor) && inFront(a.v)) rooms[id] = toScreen(a.v);
      if (state.floor === "all" && floorAnchors.size > 1) for (const [f, v] of floorAnchors) if (inFront(v)) floors[String(f)] = toScreen(v);
      return { nodes, rooms, floors, size: { w: host.clientWidth, h: host.clientHeight } };
    },
    resetView() { camera.position.copy(home.position); controls.target.copy(home.target); controls.update(); },
    zoom,
    dispose() {
      if (disposed) return;
      disposed = true;
      stopLoop();
      ro.disconnect();
      controls.dispose();
      canvas.removeEventListener("wheel", onWheel);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      const resources = new Set<{ dispose(): void }>([...owned, ...shared]);
      scene.traverse((o: Object3D) => { const m = o as Mesh; if (m.isMesh) { resources.add(m.geometry); const mat = m.material as Material | Material[]; (Array.isArray(mat) ? mat : [mat]).forEach(x => resources.add(x)); } });
      for (const r of resources) r.dispose();
      (envRT.texture as Texture).dispose();
      envRT.dispose();
      sun.shadow.map?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
