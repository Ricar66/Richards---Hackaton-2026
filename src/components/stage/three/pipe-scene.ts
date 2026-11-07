/**
 * Cena 3D do gêmeo da Sala ao vivo (three.js imperativo, sem React). REPRESENTAÇÃO ESQUEMÁTICA, como o SVG:
 * - a água anda com `advancePhase(waterSpeed(vazão medida))`, a MESMA conta do SVG (sem leitura = parada e escurecida);
 * - a cor vem só do estado da regra; a hachura roxa marca leitura simulada;
 * - o pulso que sai do medidor marca a CHEGADA de uma leitura gravada (cor distinta da água, nunca lido como vazão);
 * - nenhum número, selo ou rótulo é desenhado aqui: tudo isso fica no DOM, por cima.
 * Tudo é gerado em código (sem arquivo, sem CDN). Laço de quadro só quando algo se move e a página está visível.
 */
import {
  ACESFilmicToneMapping, AdditiveBlending, CanvasTexture, CatmullRomCurve3, Color, CylinderGeometry, DirectionalLight, DoubleSide, Group, Mesh,
  MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, OrthographicCamera, PMREMGenerator, PlaneGeometry, RingGeometry, Scene, ShaderMaterial,
  SRGBColorSpace, SphereGeometry, TubeGeometry, Vector3, WebGLRenderer, type Material, type Object3D, type Texture,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { advancePhase, budgetRestart, budgetStart, frameBudgetStep, median, type BudgetState, type PipeTone } from "../stage-logic";
import { progress } from "@/lib/ease";
import { createIndustrialAssembly } from "./industrial-assembly";

export type TwinView = "overview" | "inspection";

export type SceneInput = {
  /** Velocidade da água em unidades do desenho SVG por segundo (`waterSpeed`). 0 = parada. */
  speed: number;
  tone: PipeTone;
  simulated: boolean;
  /** Há leitura recente do sensor (LED aceso). */
  live: boolean;
  /** Reduzir movimento ou tecla P: nada se move, só redesenha quando o estado muda. */
  still: boolean;
  /** Muda a cada leitura gravada do sensor em foco: dispara o pulso no medidor. */
  pulseKey: string | null;
  /** O 3D está por cima do SVG (senão não desenha nada). */
  visible: boolean;
  /** Enquadramento escolhido pela pessoa. Sem órbita automática ou transição que pareça dado. */
  view?: TwinView;
};
export type SceneStats = { fps: number; p50: number; p95: number; calls: number; triangles: number; dpr: number; level: 0 | 1 | 2 };
export type PipeScene = { ready: Promise<void>; update(i: Partial<SceneInput>): void; dpr(): number; dispose(): void };
export type SceneCallbacks = { onLost(): void; onBudget(): void; onStats?(s: SceneStats): void };

/** Período e escala da água do SVG (46 unidades por traço, cano de 593 unidades) levados ao comprimento do tubo 3D. */
const SVG_PERIOD = 46;
const SVG_WATER_LEN = 593;
const TONES: Record<PipeTone, { a: string; b: string; dash: string; glass: string }> = {
  ok: { a: "#3fd0a7", b: "#0f5f57", dash: "#b5ffe9", glass: "#7cdbd0" },
  warn: { a: "#f2a94a", b: "#7a4a0e", dash: "#ffe0ad", glass: "#e9a24b" },
  danger: { a: "#ec6b64", b: "#6e2420", dash: "#ffd0cc", glass: "#f08a84" },
};
const SIM = "#b6a3e2";
const PULSE_MS = 700;
const PULSE_MIN_GAP_MS = 500;

const WATER_VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vN;
void main() { vUv = uv; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const WATER_FRAG = /* glsl */ `
uniform float uPhase, uPeriod, uLen, uSim, uDim;
uniform vec3 uA, uB, uDash, uSimC;
varying vec2 vUv; varying vec3 vN;
void main() {
  float along = vUv.x * uLen;
  float advected = along - uPhase;
  float t = fract(advected / uPeriod);
  // Faixa estreita e suave por período (o "traço" da água do SVG), ondulando em volta do tubo.
  float ripple = sin(vUv.y * 25.1327 + advected / uPeriod * 6.2831853) * 0.04;
  float band = smoothstep(0.0, 0.07, t + ripple) * (1.0 - smoothstep(0.14, 0.3, t + ripple));
  vec3 n = normalize(vN);
  float light = 0.35 + 0.65 * max(dot(n, normalize(vec3(-0.25, 0.85, 0.45))), 0.0);
  float spec = pow(max(dot(n, normalize(vec3(-0.15, 0.95, 0.3))), 0.0), 28.0);
  // Profundidade óptica e veios de luz advectados pela MESMA fase da vazão, nunca por relógio independente.
  float facing = abs(n.z);
  float veins = pow(0.5 + 0.5 * sin(advected / uPeriod * 18.849556 + sin(vUv.y * 31.4159) * 1.8), 7.0);
  float fine = pow(0.5 + 0.5 * sin(advected / uPeriod * 31.415927 - vUv.y * 50.2655), 12.0);
  vec3 col = mix(uB * 0.58, uA * 0.82, light * facing);
  col = mix(col, uDash, band * 0.38);
  col += uDash * (spec * 0.5 + veins * 0.12 + fine * 0.045) * facing;
  col += uA * pow(1.0 - facing, 3.0) * 0.3;
  // Simulado: hachura fina e discreta (o roxo forte fica na borda do vidro e no selo do DOM).
  if (uSim > 0.5) { float h = step(0.78, fract(vUv.x * uLen * 2.2 + vUv.y * 6.0)); col = mix(col, uSimC, h * 0.3); }
  col *= mix(1.0, 0.42, uDim);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
/** Borda do vidro (fresnel com câmera ortográfica: a direção de visão é constante em espaço de câmera). */
const RIM_VERT = /* glsl */ `
varying vec3 vN;
void main() { vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RIM_FRAG = /* glsl */ `
uniform vec3 uRim; uniform float uStrength;
varying vec3 vN;
void main() {
  float f = pow(1.0 - abs(normalize(vN).z), 2.4);
  gl_FragColor = vec4(uRim * f * uStrength, f * uStrength);
  #include <colorspace_fragment>
}`;

/** Chão: sombra de contato e grade que somem nas bordas (textura gerada num canvas, uma vez). */
function floorTexture(): CanvasTexture {
  const w = 512, h = 256, c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  g.strokeStyle = "rgba(99,235,191,0.22)"; g.lineWidth = 1;
  for (let x = 0; x <= w; x += 32) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); g.stroke(); }
  for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke(); }
  g.globalCompositeOperation = "destination-in";
  const fade = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
  fade.addColorStop(0, "rgba(0,0,0,1)"); fade.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = fade; g.fillRect(0, 0, w, h);
  // Sombra de contato: elipse INTEIRA e estreita só debaixo do cano (um retângulo de preenchimento menor que a elipse a
  // cortava em cima e embaixo, e ela aparecia como um "cartão" escuro atrás do desenho).
  g.globalCompositeOperation = "source-over";
  g.save();
  g.translate(w / 2, h / 2);
  g.scale(1, 0.18);
  const shadow = g.createRadialGradient(0, 0, 2, 0, 0, w * 0.36);
  shadow.addColorStop(0, "rgba(0,0,0,0.5)"); shadow.addColorStop(0.6, "rgba(0,0,0,0.18)"); shadow.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = shadow;
  g.fillRect(-w / 2, -h / 0.36, w, h / 0.18);
  g.restore();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function createPipeScene(host: HTMLElement, cb: SceneCallbacks): PipeScene {
  // Canvas novo a cada montagem: um canvas cujo contexto foi perdido nunca ganha outro (dupla montagem do StrictMode).
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "display:block;width:100%;height:100%";
  host.appendChild(canvas);
  let renderer: WebGLRenderer;
  try {
    // failIfMajorPerformanceCaveat: recusa o WARP/SwiftShader (o erro é síncrono e cai no SVG).
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: true });
  } catch (e) { canvas.remove(); throw e; }
  let dpr = Math.min(window.devicePixelRatio || 1, host.clientWidth < 600 ? 1.25 : 1.5);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envRT = pmrem.fromScene(room, 0.04);
  scene.environment = envRT.texture;
  pmrem.dispose();
  room.traverse(o => { const m = o as Mesh; m.geometry?.dispose(); (m.material as Material | undefined)?.dispose?.(); });

  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(7.2, 6.4, 13);
  camera.lookAt(0, -0.35, 0);
  camera.updateMatrixWorld();

  // Trecho monitorado: sai do chão, corre na horizontal e volta ao chão (cotovelos suaves).
  const FLOOR_Y = -1.75;
  const curve = new CatmullRomCurve3([
    new Vector3(-6.0, FLOOR_Y - 0.2, 0), new Vector3(-5.85, -0.9, 0), new Vector3(-5.2, -0.08, 0), new Vector3(-4.2, 0, 0),
    new Vector3(0, 0, 0),
    new Vector3(4.2, 0, 0), new Vector3(5.2, -0.08, 0), new Vector3(5.85, -0.9, 0), new Vector3(6.0, FLOOR_Y - 0.2, 0),
  ], false, "centripetal");
  const len = curve.getLength();
  const scale = (4.2 * 2) / SVG_WATER_LEN; // trecho reto do 3D ↔ água do SVG: a mesma fração do cano por segundo
  const WHITE = new Color("#ffffff"), pulseScreen = new Color();

  const root = new Group();
  scene.add(root);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };

  const water = keep(new ShaderMaterial({
    vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
    uniforms: {
      uPhase: { value: 0 }, uPeriod: { value: SVG_PERIOD * scale }, uLen: { value: len }, uSim: { value: 0 }, uDim: { value: 1 },
      uA: { value: new Color() }, uB: { value: new Color() }, uDash: { value: new Color() }, uSimC: { value: new Color(SIM) },
    },
  }));
  root.add(new Mesh(keep(new TubeGeometry(curve, 220, 0.42, 36, false)), water));

  const glassGeo = keep(new TubeGeometry(curve, 220, 0.62, 48, false));
  const glass = keep(new MeshPhysicalMaterial({ color: "#bff3ea", metalness: 0, roughness: 0.06, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.6, depthWrite: false }));
  const glassMesh = new Mesh(glassGeo, glass);
  glassMesh.renderOrder = 2;
  root.add(glassMesh);
  const rim = keep(new ShaderMaterial({ vertexShader: RIM_VERT, fragmentShader: RIM_FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uRim: { value: new Color() }, uStrength: { value: 0.85 } } }));
  const rimMesh = new Mesh(glassGeo, rim);
  rimMesh.renderOrder = 3;
  root.add(rimMesh);

  // Montagem industrial com mangas, apoios, juntas e parafusos instanciados.
  const assembly = createIndustrialAssembly();
  root.add(assembly.group);
  const metal = keep(new MeshStandardMaterial({ color: "#7fa3ab", metalness: 0.92, roughness: 0.28, envMapIntensity: 1.2 }));
  const darkMetal = keep(new MeshStandardMaterial({ color: "#2a434b", metalness: 0.8, roughness: 0.38 }));
  const collarGeo = keep(new CylinderGeometry(0.82, 0.82, 0.24, 48));
  for (const x of [-6.0, 6.0]) { const c = new Mesh(collarGeo, darkMetal); c.position.set(x, FLOOR_Y + 0.02, 0); root.add(c); }

  // Medidor YF-S201 no topo: colar, corpo arredondado, tela emissiva (sem número) e LED.
  const meter = new Group();
  const mCollar = new Mesh(keep(new CylinderGeometry(0.78, 0.78, 0.62, 48)), darkMetal);
  mCollar.rotation.z = Math.PI / 2;
  meter.add(mCollar);
  const body = new Mesh(keep(new RoundedBoxGeometry(1.25, 0.82, 0.92, 4, 0.14)), metal);
  body.position.set(0, 0.95, 0);
  meter.add(body);
  const bezel = new Mesh(keep(new RoundedBoxGeometry(1.04, 0.52, 0.08, 2, 0.055)), darkMetal);
  bezel.position.set(0, 0.98, 0.47);
  meter.add(bezel);
  const screenMat = keep(new MeshBasicMaterial({ color: "#b5ffe9", toneMapped: false }));
  const screen = new Mesh(keep(new PlaneGeometry(0.86, 0.34)), screenMat);
  screen.position.set(0, 0.98, 0.516);
  meter.add(screen);
  const ledMat = keep(new MeshBasicMaterial({ color: "#63ebbf", toneMapped: false }));
  const led = new Mesh(keep(new SphereGeometry(0.06, 16, 12)), ledMat);
  led.position.set(0.48, 1.28, 0.42);
  meter.add(led);
  // Anel do pulso (leitura gravada): de frente para a câmera, em volta do corpo do medidor; invisível fora do pulso.
  const ringMat = keep(new MeshBasicMaterial({ color: "#eafffb", transparent: true, opacity: 0, depthWrite: false, side: DoubleSide, toneMapped: false }));
  const pulseRing = new Mesh(keep(new RingGeometry(0.78, 0.9, 64)), ringMat);
  pulseRing.position.set(0, 0.95, 0.56);
  pulseRing.renderOrder = 4;
  pulseRing.quaternion.copy(camera.quaternion); // câmera fixa: basta orientar uma vez
  meter.add(pulseRing);
  root.add(meter);

  const floorTex = keep(floorTexture());
  const floor = new Mesh(keep(new PlaneGeometry(17, 8.5)), keep(new MeshBasicMaterial({ map: floorTex, transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false })));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.renderOrder = -1;
  root.add(floor);

  const sun = new DirectionalLight("#ffffff", 1.4);
  sun.position.set(-3, 8, 6);
  scene.add(sun);
  const edgeLight = new DirectionalLight("#b7d9ec", 2.2);
  edgeLight.position.set(4, 3, -5);
  scene.add(edgeLight);
  const fillLight = new DirectionalLight("#cee3da", 0.8);
  fillLight.position.set(-7, 1, 3);
  scene.add(fillLight);

  // ---------- estado ----------
  const state: SceneInput = { speed: 0, tone: "ok", simulated: false, live: false, still: false, pulseKey: null, visible: false, view: "overview" };
  let phase = 0, pulseStart = -1, lastPulseAt = -Infinity, raf = false, last = 0, disposed = false, initialized = false;
  let budget: BudgetState = budgetStart(performance.now());
  const deltas: number[] = [];
  let lastStatsAt = 0, lastBudgetAt = 0;

  const applyLook = () => {
    const t = TONES[state.tone];
    (water.uniforms.uA.value as Color).set(t.a);
    (water.uniforms.uB.value as Color).set(t.b);
    (water.uniforms.uDash.value as Color).set(t.dash);
    (rim.uniforms.uRim.value as Color).set(state.simulated ? SIM : t.glass);
    water.uniforms.uSim.value = state.simulated ? 1 : 0;
    water.uniforms.uDim.value = state.live && state.speed > 0 ? 0 : 1;
    glass.opacity = state.view === "inspection" ? 0.07 : 0.16;
    screenMat.color.set(state.live ? t.dash : "#33484e");
    ledMat.color.set(state.live ? "#63ebbf" : "#56666b");
  };

  const fit = () => {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    // Enquadramento: o cano (≈ 10,5 de largura na tela, ≈ 5 de altura com cotovelos e medidor) com folga curta.
    const inspection = state.view === "inspection";
    camera.position.set(inspection ? 2.4 : 7.2, inspection ? 3.8 : 6.4, inspection ? 17 : 13);
    camera.lookAt(0, -0.4, 0);
    camera.updateMatrixWorld();
    pulseRing.quaternion.copy(camera.quaternion);
    const aspect = w / h, needW = inspection ? 14.3 : 13.2, needH = 6.1;
    const viewH = Math.max(needH, needW / aspect);
    camera.left = (-viewH * aspect) / 2; camera.right = (viewH * aspect) / 2; camera.top = viewH / 2; camera.bottom = -viewH / 2;
    camera.updateProjectionMatrix();
  };

  // Aba oculta não desenha: o visibilitychange redesenha o estado atual na volta.
  const draw = () => { if (!disposed && state.visible && document.visibilityState === "visible") renderer.render(scene, camera); };
  const pulseActive = (now: number) => pulseStart >= 0 && now - pulseStart < PULSE_MS;
  const wantsLoop = () => !disposed && state.visible && !state.still && document.visibilityState === "visible" && ((state.live && state.speed > 0) || pulseActive(performance.now()));

  // O pulso marca a CHEGADA de uma leitura gravada: anel em volta do medidor + tela que acende, igual ao SVG.
  // Nunca corre pela água (aí seria lido como vazão, inclusive com o cano parado).
  const endPulse = () => { if (pulseStart < 0) return; pulseStart = -1; ringMat.opacity = 0; pulseRing.scale.setScalar(1); applyLook(); };
  const tick = (now: number) => {
    const dtMs = last ? Math.max(0, now - last) : 16.7;
    last = Math.max(last, now);
    phase = advancePhase(phase, state.live ? state.speed : 0, dtMs / 1000, SVG_PERIOD);
    water.uniforms.uPhase.value = phase * scale;
    if (pulseActive(now)) {
      const k = progress(now - pulseStart, PULSE_MS); // 1º quadro pode ser anterior a pulseStart: trava em [0, 1]
      pulseRing.scale.setScalar(1 + 1.6 * k);
      ringMat.opacity = 0.95 * (1 - k);
      screenMat.color.copy(pulseScreen.set(TONES[state.tone].dash).lerp(WHITE, 1 - k));
    } else endPulse();
    draw();
    // Monitor de orçamento (só enquanto há laço): mediana dos últimos quadros a cada 0,5 s.
    deltas.push(dtMs); if (deltas.length > 90) deltas.shift();
    if (now - lastBudgetAt > 500) {
      lastBudgetAt = now;
      const next = frameBudgetStep(budget, now, median(deltas));
      if (next.level !== budget.level) {
        budget = next;
        if (budget.level === 1) { dpr = 1; renderer.setPixelRatio(1); assembly.details.visible = false; fit(); }
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
  // Laço retomado: o monitor aquece e mede a cadência de novo (sem herdar quadros de antes da pausa).
  const startLoop = () => { if (raf || !wantsLoop()) return; raf = true; last = 0; deltas.length = 0; budget = budgetRestart(budget, performance.now()); renderer.setAnimationLoop(tick); };
  function stopLoop() { if (!raf) return; raf = false; renderer.setAnimationLoop(null); }
  // Sem laço: o pulso que estava no meio termina (não fica congelado no quadro parado) e desenha uma vez o estado atual.
  const refresh = () => { if (wantsLoop()) startLoop(); else { stopLoop(); endPulse(); draw(); } };

  const onVisibility = () => refresh();
  document.addEventListener("visibilitychange", onVisibility);
  const onLost = (e: Event) => { e.preventDefault(); stopLoop(); if (!disposed) cb.onLost(); };
  canvas.addEventListener("webglcontextlost", onLost);
  const ro = new ResizeObserver(() => { fit(); draw(); });
  ro.observe(host);
  fit();
  applyLook();

  // Compila os shaders ANTES de aparecer: sem o travão de 0,5–0,9 s da primeira compilação na frente do público.
  const ready = renderer.compileAsync(scene, camera).then(() => { if (!disposed) { draw(); refresh(); } });

  return {
    ready,
    dpr: () => dpr,
    update(i) {
      const prevPulse = state.pulseKey, first = !initialized;
      const previousView = state.view;
      initialized = true;
      Object.assign(state, i);
      // Só a MUDANÇA da chave pulsa: o valor da montagem (ou do primeiro update) nunca, e null não pulsa nem apaga a referência.
      if (!first && state.live && i.pulseKey !== undefined && i.pulseKey !== null && i.pulseKey !== prevPulse && !state.still) {
        const now = performance.now();
        // No máximo um pulso a cada 500 ms (descarta o desenho, nunca o dado).
        if (now - lastPulseAt >= PULSE_MIN_GAP_MS) { lastPulseAt = now; pulseStart = now; }
      }
      if (i.pulseKey === null) state.pulseKey = prevPulse;
      if (previousView !== state.view) fit();
      applyLook();
      refresh();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopLoop();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      // Recursos compartilhados (48 instâncias e geometrias reutilizadas) são liberados UMA vez.
      const resources = new Set<{ dispose(): void }>(disposables);
      scene.traverse((o: Object3D) => { const m = o as Mesh; if (m.isMesh) { resources.add(m.geometry); const mat = m.material as Material | Material[]; (Array.isArray(mat) ? mat : [mat]).forEach(x => resources.add(x)); if ("isInstancedMesh" in m) resources.add(m as Mesh & { dispose(): void }); } });
      for (const resource of resources) resource.dispose();
      (envRT.texture as Texture).dispose();
      envRT.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
