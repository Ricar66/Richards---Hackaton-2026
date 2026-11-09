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
  Box3, BoxGeometry, BufferGeometry, CanvasTexture, CapsuleGeometry, ClampToEdgeWrapping, Color, ConeGeometry, CurvePath,
  CylinderGeometry, DirectionalLight, DoubleSide, Euler, Float32BufferAttribute, Group, HalfFloatType, HemisphereLight, IcosahedronGeometry, LineBasicMaterial, LineCurve3,
  LineSegments, Material, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, NeutralToneMapping, NoBlending, Object3D, PCFShadowMap, PerspectiveCamera,
  PlaneGeometry, PMREMGenerator, QuadraticBezierCurve3, Quaternion, RepeatWrapping, RingGeometry, Scene, SphereGeometry, SRGBColorSpace,
  Texture, TubeGeometry, Vector3, WebGLRenderer, WebGLRenderTarget,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { budgetRestart, budgetStart, frameBudgetStep, median, type BudgetState } from "@/components/stage/stage-logic";
import { floorOf, type WaterLayout } from "@/modules/water-map/domain/layout";
import { EXPLODE_STEP, FIXTURE_DEPTH, FIXTURE_WIDTH, FOOTPRINT, PIPE_Y, planSite, SLAB_T, type FloorMat, type Mat } from "./site-plan";
import { architecture, CEILING_H, floorElevation, upperWallVisible, type SectionMode, type WallAssembly, type ArchitectureMaterial } from "./architecture";
import { surfaceMaps } from "./surface-maps";
import { buildingDetails, furnitureDetails } from "./model-details";
import { fitCamera, type CameraPreset } from "./camera-fit";
import { fixtureModel } from "./fixture-model";

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
  section?: SectionMode;
  insetTop?: number;
};
export type { CameraPreset } from "./camera-fit";
export type MapSceneStats = { fps: number; p50: number; p95: number; calls: number; triangles: number; dpr: number; level: number };
export type ScreenPoint = { x: number; y: number };
export type MapProjection = { nodes: Record<string, ScreenPoint>; rooms: Record<string, ScreenPoint>; floors: Record<string, ScreenPoint>; size: { w: number; h: number } };
export type MapScene = { ready: Promise<void>; update(i: MapSceneInput): void; project(): MapProjection; resetView(): void; setCamera(preset: CameraPreset): void; focusNode(id: string): void; zoom(factor: number): void; dispose(): void };
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
        let x = -(i % 2) * s / 4;
        while (x < s) {
          const len = s / 2, base = shade("#bd9a73", (r() - 0.5) * 0.075);
          g.fillStyle = base; g.fillRect(x, i * h, len, h);
          for (let k = 0; k < 9; k++) { g.strokeStyle = shade(base, -0.06 - r() * 0.06); g.globalAlpha = 0.35; g.lineWidth = 1; g.beginPath(); const y = i * h + r() * h; g.moveTo(x, y); g.bezierCurveTo(x + len / 3, y + (r() - 0.5) * 6, x + len * 2 / 3, y + (r() - 0.5) * 6, x + len, y); g.stroke(); }
          g.globalAlpha = 1; g.fillStyle = "#8c7157"; g.fillRect(x, i * h, 1.2, h);
          x += len;
        }
        g.fillStyle = "#8c7157"; g.fillRect(0, i * h, s, 1.5);
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
    grass: canvasTex(256, (g, s, r) => speckle(g, s, r, "#657852", 0.1, 9000, 2), aniso),
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
      // Vidro/tela vazada não viram uma placa opaca no passe de normais do AO.
      if (transparent || mat.alphaTest > 0) mesh.layers.set(OVERLAY);
      into.add(mesh);
    }
    this.parts.clear();
  }
}
/**
 * Oclusão de ambiente (GTAO do próprio three) com cache. A geometria da maquete é parada: o AO só muda com a câmera,
 * o tamanho ou a planta. Nos quadros em que só a água anda, reaproveita o AO já calculado e refaz só a mistura.
 * Canos em raio-x, água e anéis ficam na camada 1, fora das normais e da profundidade do AO (não "sujam" o piso).
 */
class CachedGTAO extends GTAOPass {
  dirty = true;
  private quad = new FullScreenQuad();
  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget, deltaTime: number, maskActive: boolean) {
    if (this.dirty) {
      const mask = this.camera.layers.mask;
      this.camera.layers.set(0);
      super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
      this.camera.layers.mask = mask;
      this.dirty = false;
      return;
    }
    const auto = renderer.autoClear;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    renderer.autoClear = false;
    this.copyMaterial.uniforms.tDiffuse.value = readBuffer.texture; this.copyMaterial.blending = NoBlending;
    this.quad.material = this.copyMaterial; this.quad.render(renderer);
    this.blendMaterial.uniforms.intensity.value = this.blendIntensity; this.blendMaterial.uniforms.tDiffuse.value = this.pdRenderTarget.texture;
    this.quad.material = this.blendMaterial; this.quad.render(renderer);
    renderer.autoClear = auto;
  }
  dispose() { this.quad.dispose(); super.dispose(); }
}
const OVERLAY = 1;
/** Faixa da rua na frente do lote (calçada + pista), em metros. */
const STREET = 2.8;
const overlay = <T extends Object3D>(o: T): T => { o.layers.set(OVERLAY); return o; };

const M4 = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(rx, ry, rz)), new Vector3(sx, sy, sz));


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
  // Khronos PBR Neutral: mantém a cor real dos materiais (ACES escurece e dessatura madeira e tecido).
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.info.autoReset = false;  // diagnóstico soma cena + passes; o último passe sozinho só reportaria um quad
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;   // cena parada: a sombra é calculada só quando a maquete muda
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envRT = pmrem.fromScene(room, 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.7;
  pmrem.dispose();
  room.traverse(o => { const m = o as Mesh; m.geometry?.dispose(); (m.material as Material | undefined)?.dispose?.(); });

  scene.add(new HemisphereLight("#eef6ff", "#7c8174", 1.0));
  const sun = new DirectionalLight("#fff3e5", 2.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  const camera = new PerspectiveCamera(32, 1, 0.1, 400);
  camera.layers.enable(OVERLAY);
  // Pós-processamento (tudo do próprio three, sem dependência nova): MSAA 4x, AO com cache e saída com tom/cor.
  const composer = new EffectComposer(renderer, new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 }));
  const renderPass = new RenderPass(scene, camera);
  const ao = new CachedGTAO(scene, camera, 1, 1);
  ao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.3, thickness: 1.2, scale: 1, samples: 16 });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 16 });
  ao.blendIntensity = 0.95;
  const outputPass = new OutputPass();
  composer.addPass(renderPass); composer.addPass(ao); composer.addPass(outputPass);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.enableZoom = false;               // zoom só com Ctrl/⌘ + roda ou pelos botões: a roda continua rolando a página
  controls.screenSpacePanning = true;
  controls.minPolarAngle = 0.18; controls.maxPolarAngle = 1.32;
  controls.enabled = false;

  // ---------- materiais ----------
  const std = (color: string, roughness = 0.8, metalness = 0, extra: Partial<ConstructorParameters<typeof MeshStandardMaterial>[0]> = {}) => new MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const ftex = floorTextures(aniso);
  const relief = Object.fromEntries(Object.keys(ftex).map(k => [k, surfaceMaps(k as FloorMat, aniso)])) as Record<FloorMat, ReturnType<typeof surfaceMaps>>;
  const floorMats: Record<FloorMat, MeshStandardMaterial> = Object.fromEntries(Object.entries(ftex).map(([k, t]) => {
    const maps = relief[k as FloorMat];
    return [k, std("#ffffff", 1, 0, { map: t, bumpMap: maps.bump, bumpScale: maps.depth, roughnessMap: maps.roughness })];
  })) as Record<FloorMat, MeshStandardMaterial>;
  const D: Record<Mat, MeshStandardMaterial> = {
    fabric: std("#8a97a0", 0.95), fabricDark: std("#56636b", 0.95), wood: std("#a87c52", 0.6), woodDark: std("#5c4130", 0.55), woodLight: std("#d8bc96", 0.6),
    white: std("#f1f0eb", 0.4), steel: std("#c4ccd0", 0.32, 0.85), black: std("#20262a", 0.45), stone: std("#e2ddd4", 0.28), rug: std("#c9b8a2", 1),
    mattress: std("#f5f3ee", 0.9), pillow: std("#ebe5d9", 0.95), plant: std("#52734b", 0.92), plantLight: std("#789068", 0.9), plantDark: std("#354f3c", 0.95), bark: std("#65523f", 0.9), pot: std("#b17b5d", 0.85),
    cardboard: std("#c79c6b", 0.9), rackOrange: std("#e47a24", 0.5, 0.3), rackBlue: std("#2f5f9e", 0.5, 0.3), concrete: std("#a7a59e", 0.95),
    brick: std("#b6533b", 0.9), sand: std("#d9c08c", 1), net: std("#ff7a1a", 0.8, 0, { transparent: true, opacity: 0.35, side: DoubleSide, depthWrite: false }),
    container: std("#2f6fae", 0.55, 0.3), p0: std("#e04b3a", 0.6), p1: std("#f0b431", 0.6), p2: std("#3a8fd9", 0.6), p3: std("#48b06a", 0.6), p4: std("#9a5bb5", 0.6), p5: std("#f4f2ec", 0.6),
    fruitR: std("#d23a2c", 0.5), fruitO: std("#f08a26", 0.5), fruitG: std("#7cb342", 0.55), tile: std("#e9eeee", 0.3),
    glass: std("#cfeaf3", 0.05, 0, { transparent: true, opacity: 0.22, depthWrite: false }),
    figure: std("#ece8e0", 0.85),
  };
  const netTex = canvasTex(128, (g, s) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, s, s); g.strokeStyle = "#fff"; g.lineWidth = 1.2;
    for (let k = 0; k <= s; k += 8) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, s); g.moveTo(0, k); g.lineTo(s, k); g.stroke(); }
  }, aniso, false);
  netTex.repeat.set(5, 1);
  D.net.alphaMap = netTex; D.net.alphaTest = 0.35; D.net.transparent = false; D.net.opacity = 1; D.net.depthWrite = true;
  // A marcenaria também recebe veio/relevo, sem multiplicar materiais por móvel.
  for (const mat of [D.wood, D.woodDark, D.woodLight]) { mat.map = ftex.wood; mat.bumpMap = relief.wood.bump; mat.bumpScale = 0.002; }
  D.wood.color.set("#dfd0bd"); D.woodLight.color.set("#fff4df"); D.woodDark.color.set("#9e8b78");
  D.concrete.map = ftex.concrete; D.concrete.bumpMap = relief.concrete.bump; D.concrete.bumpScale = 0.008;
  D.stone.map = ftex.stone; D.stone.roughnessMap = relief.stone.roughness;
  const F = {
    ceramic: std("#f8f8f6", 0.22), chrome: std("#eef2f4", 0.12, 1), basinIn: std("#dfe5e7", 0.2), bronze: std("#a37b3c", 0.35, 0.8),
    tankBlue: std("#1f7fc4", 0.55), tankLid: std("#17639a", 0.5), dial: std("#e8f6ff", 0.05, 0, { transparent: true, opacity: 0.85 }),
    valveRed: std("#d33b2c", 0.5), valveBlue: std("#2f72c4", 0.5), hose: std("#2f8d3a", 0.6), orange: std("#ef7a1d", 0.5, 0.2), drain: std("#5c666b", 0.4, 0.7),
  };
  const wallMat = std("#efebe4", 0.92), capMat = std("#33424a", 0.7), slabMat = std("#cfccc4", 0.9), plinthMat = std("#0f1e25", 0.95), edgeMat = std("#9aa3a6", 0.9);
  const asphalt = std("#444a4b", 0.95), sidewalk = std("#c9c5bc", 0.9), laneMat = std("#f2efe6", 0.6), frameMat = std("#4c575b", 0.4, 0.6);
  const wallTile = std("#ffffff", 0.7, 0, { map: ftex.bathTile, bumpMap: relief.bathTile.bump, bumpScale: 0.004 });
  const architectureMats: Record<ArchitectureMaterial, Material> = { plaster: wallMat, cut: capMat, frame: frameMat, glass: D.glass, sill: D.stone, skirting: D.white, tile: wallTile, door: D.woodLight };
  const pipeMat = new MeshBasicMaterial({ color: "#8fd3ec", transparent: true, opacity: 0.5, depthTest: false, depthWrite: false });
  const guideMat = new LineBasicMaterial({ color: "#5b7b86", transparent: true, opacity: 0.45 });
  const shared = new Set<{ dispose(): void }>([netTex, ...Object.values(ftex), ...Object.values(relief).flatMap(m => [m.bump, m.roughness]), ...Object.values(floorMats), ...Object.values(D), ...Object.values(F), wallMat, wallTile, capMat, slabMat, plinthMat, edgeMat, pipeMat, guideMat, asphalt, sidewalk, laneMat, frameMat]);
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
  let floorHeights = new Map<number, number>();
  let guides: LineSegments | null = null;
  let cutWalls: { floor: number; outward: WallAssembly["outward"]; upper: Group; cap: Group }[] = [];
  const owned = new Set<{ dispose(): void }>();
  const own = <T extends { dispose(): void }>(r: T): T => { owned.add(r); return r; };
  const floorY = (f: number) => floorElevation(f, state.section);

  function clearSite() {
    scene.remove(root);
    for (const r of owned) r.dispose();
    owned.clear();
    root = new Group(); scene.add(root);
    floorGroups = new Map(); nodeParts = new Map(); edgeParts = []; roomAnchors = new Map(); floorAnchors = new Map(); floorHeights = new Map(); guides = null; cutWalls = [];
  }

  function buildSite(layout: WaterLayout) {
    clearSite();
    const p = planSite(layout);
    const fp = FOOTPRINT[layout.kind];
    const batches = new Map<number, Batch>();
    const batch = (f: number) => { let b = batches.get(f); if (!b) { b = new Batch(); batches.set(f, b); } return b; };
    const group = (f: number) => { let g = floorGroups.get(f); if (!g) { g = new Group(); floorGroups.set(f, g); root.add(g); } return g; };

    // Base da maquete (placa escura sob o térreo) e laje de cada pavimento.
    // Recorte urbano discreto: calçada e só parte da pista. O lote ocupa o quadro; a rua é contexto.
    const plinth = own(new RoundedBoxGeometry(fp.w + 1.6, 0.32, fp.d + 1.6 + STREET, 2, 0.12));
    const base = new Mesh(plinth, plinthMat); base.position.set(0, -SLAB_T - 0.16, STREET / 2); base.receiveShadow = true; group(0).add(base);
    {
      const z0 = fp.d / 2 + 0.8, top = -SLAB_T, W = fp.w + 1.4;
      batch(0).add(new BoxGeometry(W, 0.05, 0.9), sidewalk, M4(0, top + 0.025, z0 + 0.45));
      batch(0).add(new BoxGeometry(W, 0.07, 0.1), sidewalk, M4(0, top + 0.035, z0 + 0.95));
      batch(0).add(new BoxGeometry(W, 0.012, 1.65), asphalt, M4(0, top + 0.006, z0 + 1.825));
      for (let x = -W / 2 + 0.6; x < W / 2 - 0.6; x += 2.2) batch(0).add(new BoxGeometry(1.1, 0.004, 0.07), laneMat, M4(x + 0.55, top + 0.014, z0 + 2.25));
      for (let x = -W / 2 + 0.4; x < W / 2; x += 1.2) batch(0).add(new BoxGeometry(0.008, 0.002, 0.89), edgeMat, M4(x, top + 0.052, z0 + 0.45));
    }
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
    // Paredes em duas alturas, com corte dependente da câmera. Lotes por orientação/pavimento mantêm baixo o custo.
    const upperBatches = new Map<string, { batch: Batch; caps: Batch; floor: number; outward: WallAssembly["outward"] }>();
    for (const wall of architecture(p)) {
      const key = `${wall.floor}:${wall.outward?.x ?? "i"}:${wall.outward?.z ?? "i"}`;
      let entry = upperBatches.get(key);
      if (!entry) { entry = { batch: new Batch(), caps: new Batch(), floor: wall.floor, outward: wall.outward }; upperBatches.set(key, entry); }
      const add = (part: typeof wall.lower[number], into: Batch) => {
        const geo = new BoxGeometry(part.sx, part.sy, part.sz);
        if (part.material === "tile") {
          const uv = geo.attributes.uv, pos = geo.attributes.position, normal = geo.attributes.normal;
          for (let j = 0; j < uv.count; j++) uv.setXY(j, (Math.abs(normal.getX(j)) > 0.5 ? pos.getZ(j) : pos.getX(j)) / TILE_M.bathTile, pos.getY(j) / TILE_M.bathTile);
        }
        into.add(geo, architectureMats[part.material], M4(part.x, floorY(wall.floor) + part.y, part.z)); geo.dispose();
      };
      for (const part of wall.lower) add(part, part.material === "cut" ? entry.caps : batch(wall.floor));
      for (const part of wall.upper) add(part, entry.batch);
    }
    for (const entry of upperBatches.values()) {
      const upper = new Group(), cap = new Group(); group(entry.floor).add(upper, cap);
      entry.batch.flush(upper, owned); entry.caps.flush(cap, owned);
      cutWalls.push({ floor: entry.floor, outward: entry.outward, upper, cap });
    }
    // Móveis.
    // Móveis: cantos arredondados nos estofados e marcenaria (produto de gôndola e tapete ficam retos e leves).
    const SOFT: ReadonlySet<Mat> = new Set(["fabric", "fabricDark", "mattress", "pillow", "wood", "woodDark", "woodLight", "white", "stone", "container", "cardboard"]);
    const unit = { sphere: new SphereGeometry(0.5, 14, 10), leaf: new IcosahedronGeometry(0.5, 1), branch: new CylinderGeometry(0.018, 0.04, 1, 7), trunk: new CylinderGeometry(0.055, 0.095, 1.6, 10), cone: new ConeGeometry(0.5, 1, 20), body: new CapsuleGeometry(0.15, 0.42, 4, 10), limb: new CapsuleGeometry(0.045, 0.5, 3, 8), head: new SphereGeometry(0.105, 12, 8), helmet: new SphereGeometry(0.125, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2) };
    // Escada aberta é um detalhe do pavimento em inspeção; não atravessa as lajes reunidas da vista de volume.
    const items = [...p.items, ...(state.section === "inspection" ? buildingDetails(p) : [])];
    for (const { floor, item: it } of items.flatMap(v => [v, ...furnitureDetails(v.item).map(item => ({ floor: v.floor, item }))])) {
      floorHeights.set(floor, Math.max(floorHeights.get(floor) ?? CEILING_H, it.y + it.sy / 2));
      const y = floorY(floor) + it.y, mat = D[it.mat], small = Math.min(it.sx, it.sy, it.sz);
      if (it.shape === "box") {
        const geo = SOFT.has(it.mat) && small > 0.06 ? new RoundedBoxGeometry(it.sx, it.sy, it.sz, 2, Math.min(0.035, small * 0.25)) : new BoxGeometry(it.sx, it.sy, it.sz);
        batch(floor).add(geo, mat, M4(it.x, y, it.z, 0, it.ry ?? 0)); geo.dispose();
      } else if (it.shape === "cyl") {
        const geo = new CylinderGeometry(it.sx / 2, it.sx / 2, it.sy, 16);
        batch(floor).add(geo, mat, M4(it.x, y, it.z, it.ry ? Math.PI / 2 : 0, 0, 0, 1, 1, it.sz / it.sx)); geo.dispose();
      } else if (it.shape === "tree") {
        const rand = lcg(Math.round((it.x + 30) * 1477 + (it.z + 30) * 1907)), scale = it.sx;
        batch(floor).add(unit.trunk, D.bark, M4(it.x, y + 0.8 * scale, it.z, 0, it.ry ?? 0, 0, scale, scale, scale));
        for (let k = 0; k < 7; k++) {
          const a = k * 2.39996 + (it.ry ?? 0), radius = 0.24 + rand() * 0.3;
          batch(floor).add(unit.branch, D.bark, M4(it.x + Math.cos(a) * radius / 2, y + (1.35 + rand() * 0.3) * scale, it.z + Math.sin(a) * radius / 2, 0.5, a, 0.55, scale, scale, scale));
        }
        for (let k = 0; k < 28; k++) {
          const a = k * 2.39996, radius = Math.sqrt(rand()) * 0.65, h = 1.65 + rand() * 0.65, s = 0.36 + rand() * 0.22;
          batch(floor).add(unit.leaf, [D.plant, D.plantLight, D.plantDark][k % 3], M4(it.x + Math.cos(a) * radius * scale, y + h * scale, it.z + Math.sin(a) * radius * scale, rand(), a, rand(), s * scale, s * scale * 0.85, s * scale));
        }
      }
      else if (it.shape === "person") {
        // Silhueta articulada de escala humana, sem a cápsula única que parecia flutuar sobre o piso.
        const fy = floorY(floor);
        batch(floor).add(unit.body, D.figure, M4(it.x, fy + 1.08, it.z, 0, it.ry ?? 0, 0, 1.08, 1, 0.65));
        for (const side of [-1, 1]) {
          batch(floor).add(unit.limb, D.figure, M4(it.x + side * 0.085, fy + 0.42, it.z, 0, 0, side * 0.05, 1.15, 1.35, 1.15));
          batch(floor).add(unit.limb, D.figure, M4(it.x + side * 0.21, fy + 1.02, it.z, 0, 0, side * 0.12));
        }
        batch(floor).add(unit.head, D.figure, M4(it.x, fy + 1.47, it.z));
        if (it.mat !== "figure") batch(floor).add(unit.helmet, D[it.mat], M4(it.x, fy + 1.5, it.z));
      } else batch(floor).add(unit[it.shape], mat, M4(it.x, y, it.z, 0, 0, 0, it.sx, it.sy, it.sz));
    }
    for (const g of Object.values(unit)) g.dispose();

    // Louças e o que é dinâmico em cada ponto (anel de estado, LED do sensor, água).
    const ringGeo = own(new RingGeometry(0.42, 0.5, 48)), alertGeo = own(new RingGeometry(0.56, 0.64, 48)), selGeo = own(new RingGeometry(0.5, 0.56, 48));
    const ledGeo = own(new SphereGeometry(0.03, 12, 8)), sensorGeo = own(new CylinderGeometry(0.035, 0.035, 0.12, 14)), splashGeo = own(new RingGeometry(0.02, 0.07, 20));
    for (const n of layout.nodes) {
      const pose = p.poses.get(n.id)!, f = floorOf(n), y = floorY(f), g = group(f);
      const model = fixtureModel(pose.fixture, layout.kind, f, D, F);
      const place = new Matrix4().compose(new Vector3(pose.x, y, pose.z), new Quaternion().setFromEuler(new Euler(0, pose.ry, 0)), new Vector3(1, 1, 1));
      for (const part of model.parts) { batch(f).add(part.geo, part.mat, place.clone().multiply(part.m)); part.geo.dispose(); }
      const toWorldPt = (v: Vector3) => v.clone().applyMatrix4(place);
      const scale = Math.max(0.7, Math.max(FIXTURE_WIDTH[pose.fixture], FIXTURE_DEPTH[pose.fixture]) / 0.9);
      const ring = own(new MeshBasicMaterial({ color: COLORS.none, transparent: true, opacity: 0.5, depthWrite: false }));
      const ringMesh = overlay(new Mesh(ringGeo, ring)); ringMesh.rotation.x = -Math.PI / 2; ringMesh.position.set(pose.x, y + 0.012, pose.z); ringMesh.scale.setScalar(scale); g.add(ringMesh);
      const alertMat = own(new MeshBasicMaterial({ color: COLORS.warn, transparent: true, opacity: 0.9, side: DoubleSide, depthWrite: false }));
      const alert = overlay(new Mesh(alertGeo, alertMat)); alert.rotation.x = -Math.PI / 2; alert.position.set(pose.x, y + 0.014, pose.z); alert.scale.setScalar(scale); alert.visible = false; g.add(alert);
      const selMat = own(new MeshBasicMaterial({ color: COLORS.select, transparent: true, opacity: 0.95, side: DoubleSide, depthWrite: false }));
      const select = overlay(new Mesh(selGeo, selMat)); select.rotation.x = -Math.PI / 2; select.position.set(pose.x, y + 0.016, pose.z); select.scale.setScalar(scale * 1.08); select.visible = false; g.add(select);
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
        const mesh = overlay(new Mesh(geo, mat));
        mesh.position.copy(a).add(b).multiplyScalar(0.5);
        mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), a.clone().sub(b).normalize());
        mesh.visible = false; mesh.renderOrder = 3; g.add(mesh);
        const splash = overlay(new Mesh(splashGeo, mat)); splash.rotation.x = -Math.PI / 2; splash.position.copy(b).add(new Vector3(0, 0.004, 0)); mesh.attach(splash);
        streams.push({ mesh, tex, mat, phase: 0 });
      }
      nodeParts.set(n.id, { ring, ringMesh, led, alert, select, anchor: new Vector3(pose.x, y + model.top + 0.3, pose.z), floor: f, streams });
    }
    for (const [f, b] of batches) b.flush(group(f), owned);

    // Canos em "raio-x" (sempre visíveis, por cima de tudo) + manga com chevrons quando o destino mede fluxo.
    for (const pipe of p.pipes) {
      if (pipe.points.length < 2) continue;
      const pts = pipe.points.map(q => new Vector3(q.x, floorY((q.y - PIPE_Y) / EXPLODE_STEP) + PIPE_Y, q.z));
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
      const tube = overlay(new Mesh(own(new TubeGeometry(path, segs, 0.024, 8, false)), pipeMat)); tube.renderOrder = 4; root.add(tube);
      const tex = own(stripe.clone()); tex.needsUpdate = true; tex.repeat.set(Math.max(1, len * 1.6), 1);
      const mat = own(new MeshBasicMaterial({ color: COLORS.flow, map: tex, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }));
      const sleeve = overlay(new Mesh(own(new TubeGeometry(path, segs, 0.04, 10, false)), mat)); sleeve.visible = false; sleeve.renderOrder = 5; root.add(sleeve);
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
  const state: Required<MapSceneInput> = { layout: { kind: "HOUSE", rooms: [], nodes: [], edges: [] }, nodes: {}, simulated: false, selected: "", still: false, visible: true, floor: "all", interactive: false, section: "inspection", insetTop: 56 };
  let cameraPreset: CameraPreset = "inspection";
  let raf = false, last = 0, disposed = false, siteKey = "", floorKey = "";
  let budget: BudgetState = budgetStart(performance.now());
  const deltas: number[] = [];
  let lastStatsAt = 0, lastBudgetAt = 0;
  const home = { target: new Vector3(), position: new Vector3(), dist: 10 };

  const floorVisible = (f: number) => state.floor === "all" || state.floor === f;
  function applyCut() {
    const view = camera.position.clone().sub(controls.target);
    let changed = false;
    for (const w of cutWalls) {
      const visible = upperWallVisible(state.section, w.outward, view, w.upper.visible);
      if (w.upper.visible !== visible) changed = true;
      w.upper.visible = visible; w.cap.visible = !visible;
    }
    if (changed) { ao.dirty = true; renderer.shadowMap.needsUpdate = true; }
  }
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
      const flowing = !!state.layout.nodes.find(n => n.id === id)?.deviceId && v.state === "FLOW" && stripeSpeed(v.flowLpm) > 0;
      for (const s of parts.streams) { s.mesh.visible = flowing && floorVisible(parts.floor); s.mat.color.set(state.simulated ? COLORS.flowSim : COLORS.water); }
    }
    for (const e of edgeParts) {
      const v = state.nodes[e.to];
      const shown = floorVisible(e.floors[0]) || floorVisible(e.floors[1]);
      e.pipe.visible = shown;
      e.sleeve.visible = shown && !!state.layout.nodes.find(n => n.id === e.to)?.deviceId && !!v && v.state === "FLOW" && stripeSpeed(v.flowLpm) > 0;
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
        pts.push(new Vector3(sx * fp.w / 2, y + (floorHeights.get(f) ?? CEILING_H), sz * fp.d / 2));
      }
    }
    for (const n of nodeParts.values()) if (floorVisible(n.floor)) pts.push(n.anchor.clone());
    const box = pts.length ? new Box3().setFromPoints(pts) : visibleBox();
    const stacked = state.floor === "all" && floorGroups.size > 1;
    const fit = fitCamera(pts.length ? pts : [box.min, box.max], camera.aspect, cameraPreset, stacked, camera.fov, { top: state.insetTop, height: host.clientHeight });
    const dist = fit.distance;
    home.target.copy(fit.target); home.position.copy(fit.position); home.dist = dist;
    controls.minDistance = dist * 0.25; controls.maxDistance = dist * 2.4;
    camera.position.copy(home.position); controls.target.copy(home.target); controls.update();
    applyCut();
    camera.near = Math.max(0.05, dist / 200); camera.far = dist * 20; camera.updateProjectionMatrix();
    // Sombra: luz do sol enquadra a cena inteira (todos os pavimentos), calculada uma vez.
    const all = visibleBox(), c = all.getCenter(new Vector3()), r = all.getSize(new Vector3()).length() / 2;
    sun.position.copy(c).add(new Vector3(-0.55, 1, 0.45).normalize().multiplyScalar(r * 2)); sun.target.position.copy(c);
    const sc = sun.shadow.camera; sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 0.1; sc.far = r * 4; sc.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;
  }

  const fit = () => {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(dpr); composer.setSize(w, h); ao.dirty = true;
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };

  const render = () => { renderer.info.reset(); composer.render(); cb.onFrame?.(); };
  const draw = () => { if (!disposed && state.visible && document.visibilityState === "visible") render(); };
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
    render();
    deltas.push(dtMs); if (deltas.length > 90) deltas.shift();
    if (now - lastBudgetAt > 500) {
      lastBudgetAt = now;
      const next = frameBudgetStep(budget, now, median(deltas));
      if (next.level !== budget.level) {
        budget = next;
        if (budget.level === 1) { dpr = 1; renderer.setPixelRatio(1); ao.enabled = false; fit(); }
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

  controls.addEventListener("change", () => { applyCut(); ao.dirty = true; if (!raf) draw(); cb.onView?.(); });
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
  const ro = new ResizeObserver(() => { fit(); if (siteKey) fitView(); draw(); cb.onView?.(); });
  ro.observe(host);
  fit();

  const ready = renderer.compileAsync(scene, camera).then(() => { if (!disposed) refresh(); });
  const toScreen = (v: Vector3): ScreenPoint => { const p = v.clone().project(camera); return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 }; };
  const inFront = (v: Vector3) => v.clone().applyMatrix4(camera.matrixWorldInverse).z < 0;

  return {
    ready,
    update(i) {
      Object.assign(state, { floor: "all", interactive: false, section: "inspection", insetTop: 56, ...i });
      const keyNow = JSON.stringify([i.layout.kind, i.layout.rooms, i.layout.nodes.map(n => [n.id, n.kind, n.x, n.y, n.fixture, n.floor, !!n.deviceId]), i.layout.edges, state.section]);
      let refit = false;
      if (keyNow !== siteKey) {
        siteKey = keyNow;
        buildSite(i.layout);
        refit = true;
        // Peças novas: compila antes do próximo desenho (sem travar o primeiro quadro com a cena nova).
        void renderer.compileAsync(scene, camera).then(() => { if (!disposed) { applyLook(); refresh(); } });
      }
      const fk = `${state.floor}:${state.insetTop}`;
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
      applyCut();
      ao.dirty = true;
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
    resetView() { cameraPreset = "inspection"; fitView(); ao.dirty = true; refresh(); cb.onView?.(); },
    setCamera(preset) { cameraPreset = preset; fitView(); ao.dirty = true; refresh(); cb.onView?.(); },
    focusNode(id) {
      const n = nodeParts.get(id); if (!n || !floorVisible(n.floor)) return;
      const dir = camera.position.clone().sub(controls.target).normalize();
      controls.target.copy(n.anchor).add(new Vector3(0, -0.5, 0));
      camera.position.copy(controls.target).addScaledVector(dir, Math.max(4, Math.min(12, home.dist * 0.42)));
      controls.update(); ao.dirty = true; refresh(); cb.onView?.();
    },
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
      ao.dispose(); outputPass.dispose(); renderPass.dispose(); composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
