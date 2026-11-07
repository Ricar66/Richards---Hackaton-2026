/**
 * Mapa hidráulico em 3D (three imperativo, carregado só na vista 3D).
 * - Desenha a MESMA topologia da planta: cômodos, entrada, distribuição, pontos de uso e ramais em L.
 * - Movimento só no ramal que chega a um ponto com medidor vinculado e leitura recente acima de zero;
 *   a velocidade da faixa acompanha a vazão MEDIDA daquele medidor. Ramais sem medidor nunca se movem (sem inferência).
 * - Sem laço quando nada se move: redesenha só quando o estado muda, no resize e ao voltar à aba.
 * - Orçamento de quadro igual ao gêmeo da Sala: nível 1 reduz o DPR, nível 2 desiste e a tela volta ao SVG.
 */
import {
  ACESFilmicToneMapping, BoxGeometry, BufferGeometry, CanvasTexture, CircleGeometry, ClampToEdgeWrapping, CurvePath, CylinderGeometry,
  DirectionalLight, DoubleSide, Float32BufferAttribute, Group, HemisphereLight, InstancedMesh, LineBasicMaterial, LineCurve3, LineSegments,
  Material, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, PMREMGenerator, PlaneGeometry,
  QuadraticBezierCurve3, Quaternion, RepeatWrapping, RingGeometry, Scene, SphereGeometry, SRGBColorSpace, Texture, TorusGeometry,
  TubeGeometry, Vector3, WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { budgetRestart, budgetStart, frameBudgetStep, median, type BudgetState } from "@/components/stage/stage-logic";
import type { WaterLayout } from "@/modules/water-map/domain/layout";

export type MapNodeState = "FLOW" | "IDLE" | "STALE" | "NO_READING" | "UNMETERED";
export type MapNodeView = { state: MapNodeState; flowLpm: number | null; alert: boolean };
export type MapSceneInput = {
  layout: WaterLayout;
  nodes: Record<string, MapNodeView>;
  simulated: boolean;
  selected: string;
  /** Pausa do operador ou "reduzir movimento": nada anda, o estado continua aparecendo. */
  still: boolean;
  visible: boolean;
};
export type MapSceneStats = { fps: number; p50: number; p95: number; calls: number; triangles: number; dpr: number; level: number };
export type ScreenPoint = { x: number; y: number };
export type MapProjection = { nodes: Record<string, ScreenPoint>; rooms: Record<string, ScreenPoint> };
export type MapScene = { ready: Promise<void>; update(i: MapSceneInput): void; project(): MapProjection; dispose(): void };
type Callbacks = { onLost(): void; onBudget(): void; onStats?(s: MapSceneStats): void; onFrame?(): void };

/** Planta normalizada (0..1) → mundo. Proporção próxima da planta SVG (910 × 580). */
export const MAP_W = 12, MAP_D = 7.6;
const PIPE_Y = 0.34, PIPE_R = 0.07, WALL_BACK = 0.6, WALL_SIDE = 0.38, WALL_FRONT = 0.12, WALL_T = 0.08;
export const toWorld = (x: number, y: number) => ({ x: (x - 0.5) * MAP_W, z: (y - 0.5) * MAP_D });

const COLORS = {
  flow: "#63ebbf", flowSim: "#c9a5ff", idle: "#2e8f78", stale: "#b08a4a", none: "#3b5059", warn: "#ffb071", select: "#8af3d2",
};
/** Repetições da faixa por segundo, proporcional à vazão medida (zero = parado; teto para não piscar). */
export function stripeSpeed(flowLpm: number | null): number {
  return flowLpm !== null && Number.isFinite(flowLpm) && flowLpm > 0 ? Math.min(2.4, 0.18 + flowLpm * 0.22) : 0;
}

/** Faixa de fluxo: chevrons claros sobre fundo translúcido; tingida pelo material (sensor × simulado). */
function stripeTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 32;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(255,255,255,0.22)";
  g.fillRect(0, 0, 128, 32);
  g.strokeStyle = "rgba(255,255,255,0.98)";
  g.lineWidth = 6; g.lineJoin = "round"; g.lineCap = "round";
  for (const x of [14, 78]) { g.beginPath(); g.moveTo(x, 3); g.lineTo(x + 22, 16); g.lineTo(x, 29); g.stroke(); }
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping; t.wrapT = ClampToEdgeWrapping;
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Ramal em L igual ao SVG (sai na direção Z do ponto de origem e dobra no X do destino), com cotovelo arredondado. */
function edgePath(a: Vector3, b: Vector3): CurvePath<Vector3> {
  const path = new CurvePath<Vector3>();
  const corner = new Vector3(a.x, PIPE_Y, b.z);
  const l1 = a.distanceTo(corner), l2 = corner.distanceTo(b);
  if (l1 < 0.05 || l2 < 0.05) { path.add(new LineCurve3(a.clone(), b.clone())); return path; }
  const r = Math.min(0.32, l1 / 2, l2 / 2);
  const p1 = corner.clone().add(a.clone().sub(corner).normalize().multiplyScalar(r));
  const p2 = corner.clone().add(b.clone().sub(corner).normalize().multiplyScalar(r));
  path.add(new LineCurve3(a.clone(), p1));
  path.add(new QuadraticBezierCurve3(p1, corner, p2));
  path.add(new LineCurve3(p2, b.clone()));
  return path;
}

export function createMapScene(host: HTMLElement, cb: Callbacks): MapScene {
  // Canvas novo a cada montagem: um canvas cujo contexto foi perdido nunca ganha outro.
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "display:block;width:100%;height:100%";
  host.appendChild(canvas);
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: true });
  } catch (e) { canvas.remove(); throw e; }
  let dpr = Math.min(window.devicePixelRatio || 1, host.clientWidth < 600 ? 1.25 : 1.5);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envRT = pmrem.fromScene(room, 0.04);
  scene.environment = envRT.texture;
  pmrem.dispose();
  room.traverse(o => { const m = o as Mesh; m.geometry?.dispose(); (m.material as Material | undefined)?.dispose?.(); });

  scene.add(new HemisphereLight("#dff1ff", "#0f1f25", 0.85));
  const key = new DirectionalLight("#ffffff", 2.7); key.position.set(-6, 11, 8); scene.add(key);
  const rim = new DirectionalLight("#b7d9ec", 1.3); rim.position.set(8, 5, -7); scene.add(rim);

  const camera = new PerspectiveCamera(30, 1, 0.1, 200);
  const target = new Vector3(0, 0, 0.35);

  // ---------- materiais compartilhados ----------
  const steel = new MeshStandardMaterial({ color: "#c3d1d5", metalness: 0.88, roughness: 0.27 });
  const darkSteel = new MeshStandardMaterial({ color: "#6f8790", metalness: 0.8, roughness: 0.35 });
  const concrete = new MeshStandardMaterial({ color: "#0d1d24", metalness: 0.05, roughness: 0.95 });
  const floorMat = new MeshStandardMaterial({ color: "#132a33", metalness: 0.06, roughness: 0.88 });
  const wallMat = new MeshStandardMaterial({ color: "#3a5a67", metalness: 0.1, roughness: 0.7 });
  const capMat = new MeshStandardMaterial({ color: "#a9c4cc", metalness: 0.25, roughness: 0.4 });
  const ceramic = new MeshStandardMaterial({ color: "#dde8ea", metalness: 0.05, roughness: 0.32 });
  const housing = new MeshStandardMaterial({ color: "#1f3a46", metalness: 0.45, roughness: 0.4 });
  const valveBlue = new MeshStandardMaterial({ color: "#2f8fb8", metalness: 0.35, roughness: 0.4 });
  const gridMat = new LineBasicMaterial({ color: "#2a4b57", transparent: true, opacity: 0.45 });
  const shared = new Set<{ dispose(): void }>([steel, darkSteel, concrete, floorMat, wallMat, capMat, ceramic, housing, valveBlue, gridMat]);

  // ---------- base fixa: laje e grade ----------
  const base = new Group();
  scene.add(base);
  const slab = new Mesh(new RoundedBoxGeometry(MAP_W + 1.1, 0.32, MAP_D + 1.1, 2, 0.1), concrete);
  slab.position.y = -0.16;
  base.add(slab);
  const gridPts: number[] = [];
  for (let x = -MAP_W / 2; x <= MAP_W / 2 + 1e-6; x += 0.5) gridPts.push(x, 0.003, -MAP_D / 2, x, 0.003, MAP_D / 2);
  for (let z = -MAP_D / 2; z <= MAP_D / 2 + 1e-6; z += 0.5) gridPts.push(-MAP_W / 2, 0.003, z, MAP_W / 2, 0.003, z);
  const gridGeo = new BufferGeometry();
  gridGeo.setAttribute("position", new Float32BufferAttribute(gridPts, 3));
  base.add(new LineSegments(gridGeo, gridMat));

  // ---------- conteúdo da planta (reconstruído quando a topologia muda) ----------
  type NodeParts = { screen: MeshBasicMaterial; led: MeshBasicMaterial; disc: MeshBasicMaterial; alert: Mesh; select: Mesh; anchor: Vector3 };
  type EdgeParts = { to: string; sleeve: Mesh; mat: MeshBasicMaterial; tex: Texture; phase: number };
  let plan = new Group();
  scene.add(plan);
  let planKey = "";
  let nodeParts = new Map<string, NodeParts>();
  let edgeParts: EdgeParts[] = [];
  let roomCenters = new Map<string, Vector3>();
  const owned = new Set<{ dispose(): void }>();
  const stripe = stripeTexture();
  shared.add(stripe);

  const disposePlan = () => {
    scene.remove(plan);
    for (const r of owned) r.dispose();
    owned.clear();
    plan = new Group();
    scene.add(plan);
    nodeParts = new Map(); edgeParts = []; roomCenters = new Map();
  };
  const own = <T extends { dispose(): void }>(r: T): T => { owned.add(r); return r; };

  function buildPlan(layout: WaterLayout) {
    disposePlan();
    // Cômodos: piso + paredes em corte (fundo alto, laterais médias, frente baixa para ver a rede).
    const unit = own(new BoxGeometry(1, 1, 1));
    const walls = own(new InstancedMesh(unit, wallMat, layout.rooms.length * 4));
    const caps = own(new InstancedMesh(unit, capMat, layout.rooms.length * 4));
    const m = new Matrix4(), q = new Quaternion(), p = new Vector3(), s = new Vector3();
    let wi = 0;
    const wall = (cx: number, cz: number, sx: number, sz: number, h: number) => {
      walls.setMatrixAt(wi, m.compose(p.set(cx, h / 2, cz), q, s.set(sx, h, sz)));
      caps.setMatrixAt(wi, m.compose(p.set(cx, h + 0.012, cz), q, s.set(sx + 0.004, 0.024, sz + 0.004)));
      wi++;
    };
    const floorGeo = own(new BoxGeometry(1, 0.05, 1));
    for (const r of layout.rooms) {
      const a = toWorld(r.x, r.y), w = r.w * MAP_W, d = r.h * MAP_D;
      const floor = new Mesh(floorGeo, floorMat);
      floor.scale.set(w - 0.04, 1, d - 0.04);
      floor.position.set(a.x + w / 2, 0.025, a.z + d / 2);
      plan.add(floor);
      wall(a.x + w / 2, a.z, w, WALL_T, WALL_BACK);
      wall(a.x + w / 2, a.z + d, w, WALL_T, WALL_FRONT);
      wall(a.x, a.z + d / 2, WALL_T, d, WALL_SIDE);
      wall(a.x + w, a.z + d / 2, WALL_T, d, WALL_SIDE);
      // Etiqueta do cômodo no canto do fundo à esquerda (como numa planta), longe das louças e dos medidores.
      roomCenters.set(r.id, new Vector3(a.x + Math.min(0.35, w * 0.12), 0.06, a.z + Math.min(0.42, d * 0.16)));
    }
    walls.instanceMatrix.needsUpdate = true; caps.instanceMatrix.needsUpdate = true;
    plan.add(walls, caps);

    // Peças reaproveitadas.
    const riserGeo = own(new CylinderGeometry(PIPE_R, PIPE_R, PIPE_Y, 16));
    const plateGeo = own(new CylinderGeometry(0.3, 0.32, 0.05, 32));
    const wheelGeo = own(new TorusGeometry(0.13, 0.026, 10, 28));
    const hubGeo = own(new SphereGeometry(0.11, 20, 14));
    const manifoldGeo = own(new CylinderGeometry(0.12, 0.12, 0.62, 24));
    const capGeo = own(new CylinderGeometry(0.135, 0.135, 0.05, 24));
    const pedestalGeo = own(new RoundedBoxGeometry(0.42, 0.46, 0.34, 2, 0.06));
    const basinGeo = own(new CylinderGeometry(0.2, 0.15, 0.1, 28));
    const stemGeo = own(new CylinderGeometry(0.035, 0.035, 0.42, 12));
    const spoutGeo = own(new TorusGeometry(0.11, 0.03, 10, 20, Math.PI / 2));
    const meterGeo = own(new RoundedBoxGeometry(0.4, 0.26, 0.24, 2, 0.04));
    const screenGeo = own(new PlaneGeometry(0.28, 0.13));
    const ledGeo = own(new SphereGeometry(0.022, 10, 8));
    const discGeo = own(new CircleGeometry(0.3, 40));
    const alertGeo = own(new RingGeometry(0.44, 0.53, 48));
    const selectGeo = own(new RingGeometry(0.34, 0.39, 48));
    const couplingGeo = own(new CylinderGeometry(PIPE_R + 0.022, PIPE_R + 0.022, 0.09, 18));

    const anchors = new Map<string, Vector3>();
    for (const n of layout.nodes) {
      const w = toWorld(n.x, n.y), g = new Group();
      g.position.set(w.x, 0, w.z);
      anchors.set(n.id, new Vector3(w.x, PIPE_Y, w.z));
      const disc = own(new MeshBasicMaterial({ color: COLORS.none, transparent: true, opacity: 0.55 }));
      const discMesh = new Mesh(discGeo, disc); discMesh.rotation.x = -Math.PI / 2; discMesh.position.y = 0.06; g.add(discMesh);
      if (n.kind === "SUPPLY") {
        // Cavalete de entrada: placa, riser, registro com volante azul.
        const plate = new Mesh(plateGeo, darkSteel); plate.position.y = 0.075; g.add(plate);
        const riser = new Mesh(riserGeo, steel); riser.position.y = PIPE_Y / 2 + 0.05; g.add(riser);
        const hub = new Mesh(hubGeo, steel); hub.position.y = PIPE_Y; g.add(hub);
        const stem = new Mesh(stemGeo, darkSteel); stem.scale.y = 0.55; stem.position.y = PIPE_Y + 0.15; g.add(stem);
        const wheel = new Mesh(wheelGeo, valveBlue); wheel.rotation.x = -Math.PI / 2; wheel.position.y = PIPE_Y + 0.27; g.add(wheel);
      } else if (n.kind === "JUNCTION") {
        // Coletor de distribuição com tampas.
        const man = new Mesh(manifoldGeo, steel); man.rotation.z = Math.PI / 2; man.position.y = PIPE_Y; g.add(man);
        for (const sx of [-0.33, 0.33]) { const c = new Mesh(capGeo, darkSteel); c.rotation.z = Math.PI / 2; c.position.set(sx, PIPE_Y, 0); g.add(c); }
        const leg = new Mesh(riserGeo, darkSteel); leg.scale.set(0.7, 1, 0.7); leg.position.y = PIPE_Y / 2; g.add(leg);
      } else {
        // Ponto de uso: pedestal cerâmico, cuba e torneira (a forma é ilustrativa, não identifica o aparelho real).
        const ped = new Mesh(pedestalGeo, ceramic); ped.position.set(0, 0.23, -0.22); g.add(ped);
        const basin = new Mesh(basinGeo, ceramic); basin.position.set(0, 0.51, -0.22); g.add(basin);
        const riser = new Mesh(riserGeo, steel); riser.position.y = PIPE_Y / 2 + 0.03; g.add(riser);
        const stem = new Mesh(stemGeo, steel); stem.position.set(0, PIPE_Y + 0.21, 0); g.add(stem);
        const spout = new Mesh(spoutGeo, steel); spout.rotation.y = Math.PI / 2; spout.position.set(0, PIPE_Y + 0.42, -0.11); g.add(spout);
        const hub = new Mesh(hubGeo, steel); hub.scale.setScalar(0.6); hub.position.y = PIPE_Y; g.add(hub);
      }
      // Medidor vinculado: caixa com visor; a cor do visor diz o estado da leitura daquele medidor.
      const screen = own(new MeshBasicMaterial({ color: COLORS.none }));
      const led = own(new MeshBasicMaterial({ color: COLORS.none }));
      if (n.deviceId) {
        const meter = new Mesh(meterGeo, housing); meter.position.set(0, PIPE_Y + 0.36, 0.2); g.add(meter);
        const scr = new Mesh(screenGeo, screen); scr.position.set(0, PIPE_Y + 0.37, 0.321); g.add(scr);
        const l = new Mesh(ledGeo, led); l.position.set(0.15, PIPE_Y + 0.45, 0.322); g.add(l);
        const neck = new Mesh(stemGeo, darkSteel); neck.scale.y = 0.4; neck.position.set(0, PIPE_Y + 0.13, 0.2); g.add(neck);
      }
      const alertMat = own(new MeshBasicMaterial({ color: COLORS.warn, transparent: true, opacity: 0.9, side: DoubleSide }));
      const alert = new Mesh(alertGeo, alertMat); alert.rotation.x = -Math.PI / 2; alert.position.y = 0.07; alert.visible = false; g.add(alert);
      const selMat = own(new MeshBasicMaterial({ color: COLORS.select, transparent: true, opacity: 0.95, side: DoubleSide }));
      const select = new Mesh(selectGeo, selMat); select.rotation.x = -Math.PI / 2; select.position.y = 0.075; select.visible = false; g.add(select);
      plan.add(g);
      nodeParts.set(n.id, { screen, led, disc, alert, select, anchor: new Vector3(w.x, PIPE_Y + 0.75, w.z) });
    }

    // Ramais: tubo de aço + luvas nas pontas; a faixa de fluxo (manga translúcida) só aparece quando o destino mede fluxo.
    for (const e of layout.edges) {
      const a = anchors.get(e.from), b = anchors.get(e.to);
      if (!a || !b) continue;
      const path = edgePath(a, b), len = path.getLength();
      const segs = Math.max(24, Math.round(len * 14));
      plan.add(new Mesh(own(new TubeGeometry(path, segs, PIPE_R, 14, false)), steel));
      for (const t of [0.04, 0.96]) {
        const pt = path.getPointAt(t), tan = path.getTangentAt(t);
        const c = new Mesh(couplingGeo, darkSteel);
        c.position.copy(pt); c.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), tan); plan.add(c);
      }
      const tex = own(stripe.clone()); tex.needsUpdate = true; tex.repeat.set(Math.max(1, len * 1.3), 1);
      const mat = own(new MeshBasicMaterial({ color: COLORS.flow, map: tex, transparent: true, opacity: 0.92, depthWrite: false }));
      const sleeve = new Mesh(own(new TubeGeometry(path, segs, PIPE_R + 0.016, 14, false)), mat);
      sleeve.visible = false; sleeve.renderOrder = 2;
      plan.add(sleeve);
      edgeParts.push({ to: e.to, sleeve, mat, tex, phase: 0 });
    }
  }

  // ---------- estado ----------
  const state: MapSceneInput = { layout: { kind: "HOUSE", rooms: [], nodes: [], edges: [] }, nodes: {}, simulated: false, selected: "", still: false, visible: true };
  let raf = false, last = 0, disposed = false;
  let budget: BudgetState = budgetStart(performance.now());
  const deltas: number[] = [];
  let lastStatsAt = 0, lastBudgetAt = 0;

  const moving = () => edgeParts.some(e => e.sleeve.visible && stripeSpeed(state.nodes[e.to]?.flowLpm ?? null) > 0);
  const applyLook = () => {
    const flowColor = state.simulated ? COLORS.flowSim : COLORS.flow;
    for (const [id, parts] of nodeParts) {
      const v = state.nodes[id] ?? { state: "UNMETERED", flowLpm: null, alert: false };
      const c = v.alert ? COLORS.warn : v.state === "FLOW" ? flowColor : v.state === "IDLE" ? COLORS.idle : v.state === "STALE" ? COLORS.stale : COLORS.none;
      parts.screen.color.set(c);
      parts.led.color.set(v.state === "FLOW" || v.state === "IDLE" ? flowColor : v.state === "STALE" ? COLORS.stale : COLORS.none);
      parts.disc.color.set(c);
      parts.disc.opacity = v.state === "UNMETERED" ? 0.28 : 0.6;
      parts.alert.visible = v.alert;
      parts.select.visible = state.selected === id;
    }
    for (const e of edgeParts) {
      const v = state.nodes[e.to];
      e.sleeve.visible = !!v && v.state === "FLOW" && stripeSpeed(v.flowLpm) > 0;
      e.mat.color.set(v?.alert ? COLORS.warn : flowColor);
    }
  };

  const fit = () => {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight), aspect = w / h;
    renderer.setSize(w, h, false);
    camera.aspect = aspect;
    // Vista de três quartos; em tela estreita sobe a câmera (mais planta, menos fachada) para caber na largura.
    const el = aspect < 1.5 ? 1.0 : 0.86, az = -0.34;
    const vfov = (camera.fov * Math.PI) / 180, hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const halfW = (MAP_W + 1.4) / 2, halfD = ((MAP_D + 1.4) / 2) * Math.sin(el) + 0.5;
    const dist = Math.max(halfW / Math.tan(hfov / 2), halfD / Math.tan(vfov / 2)) * 1.04 + MAP_D * (aspect < 1.5 ? 0.12 : 0.26);
    camera.position.set(target.x + Math.sin(az) * Math.cos(el) * dist, target.y + Math.sin(el) * dist, target.z + Math.cos(az) * Math.cos(el) * dist);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
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

  const onVisibility = () => refresh();
  document.addEventListener("visibilitychange", onVisibility);
  const onLost = (e: Event) => { e.preventDefault(); stopLoop(); if (!disposed) cb.onLost(); };
  canvas.addEventListener("webglcontextlost", onLost);
  const ro = new ResizeObserver(() => { fit(); draw(); });
  ro.observe(host);
  fit();

  const ready = renderer.compileAsync(scene, camera).then(() => { if (!disposed) refresh(); });
  const toScreen = (v: Vector3): ScreenPoint => {
    const p = v.clone().project(camera);
    return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 };
  };

  return {
    ready,
    update(i) {
      Object.assign(state, i);
      const keyNow = JSON.stringify([i.layout.rooms, i.layout.nodes.map(n => [n.id, n.kind, n.x, n.y, !!n.deviceId]), i.layout.edges]);
      if (keyNow !== planKey) {
        planKey = keyNow;
        buildPlan(i.layout);
        // Peças novas: compila antes do próximo desenho (sem travar o primeiro quadro com a cena nova).
        void renderer.compileAsync(scene, camera).then(() => { if (!disposed) { applyLook(); refresh(); } });
      }
      applyLook();
      refresh();
    },
    project() {
      const nodes: Record<string, ScreenPoint> = {}, rooms: Record<string, ScreenPoint> = {};
      for (const [id, parts] of nodeParts) nodes[id] = toScreen(parts.anchor);
      for (const [id, c] of roomCenters) rooms[id] = toScreen(c);
      return { nodes, rooms };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopLoop();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      const resources = new Set<{ dispose(): void }>([...owned, ...shared]);
      scene.traverse((o: Object3D) => { const m = o as Mesh; if (m.isMesh) { resources.add(m.geometry); const mat = m.material as Material | Material[]; (Array.isArray(mat) ? mat : [mat]).forEach(x => resources.add(x)); } });
      gridGeo.dispose();
      for (const r of resources) r.dispose();
      (envRT.texture as Texture).dispose();
      envRT.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
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

