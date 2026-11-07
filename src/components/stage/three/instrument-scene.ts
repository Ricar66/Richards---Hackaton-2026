import { ACESFilmicToneMapping, DirectionalLight, HemisphereLight, OrthographicCamera, Scene, SRGBColorSpace, WebGLRenderer } from "three";
import type { InstrumentState } from "../instrument-state";
import { createInstrumentModel, type InstrumentKind } from "./instrument-models";

export type InstrumentStats = { calls: number; triangles: number; dpr: number; cpuMs: number };
export type InstrumentScene = { ready: Promise<void>; update(input: InstrumentState): void; dispose(): void };
/** Renderização sob demanda: zero requestAnimationFrame/setAnimationLoop. Nada gira sozinho, nem com leitura antiga. */
export function createInstrumentScene(host: HTMLElement, kind: InstrumentKind, callbacks: {
  onFail(reason: "lost" | "budget" | "error"): void;
  onStats(stats: InstrumentStats): void;
}): InstrumentScene {
  const canvas = document.createElement("canvas"); canvas.setAttribute("aria-hidden", "true"); host.appendChild(canvas);
  let renderer: WebGLRenderer;
  try { renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power", failIfMajorPerformanceCaveat: true }); }
  catch (error) { canvas.remove(); throw error; }
  const model = createInstrumentModel(kind), scene = new Scene(); scene.add(model.root);
  const camera = new OrthographicCamera(-3, 3, 2, -2, 0.1, 40);
  camera.position.set(kind === "scale" ? 5 : 2, kind === "scale" ? 4 : 1.2, 8); camera.lookAt(0, -0.1, 0);
  scene.add(new HemisphereLight("#e5f3fc", "#30454a", 2.1));
  const key = new DirectionalLight("#ffffff", 3.2); key.position.set(-3, 5, 6); scene.add(key);
  const edge = new DirectionalLight("#adcadc", 2); edge.position.set(4, 2, -3); scene.add(edge);
  renderer.toneMapping = ACESFilmicToneMapping; renderer.outputColorSpace = SRGBColorSpace; renderer.setClearColor(0, 0);
  let dpr = Math.min(window.devicePixelRatio || 1, 1.25), disposed = false, compiled = false, inView = false;
  let renders = 0, slow = 0;
  renderer.setPixelRatio(dpr);
  const draw = () => {
    if (disposed || !compiled || !inView || document.visibilityState !== "visible") return;
    const start = performance.now();
    try { renderer.render(scene, camera); }
    catch { callbacks.onFail("error"); return; }
    const cpuMs = performance.now() - start;
    // Mede submissão CPU, não FPS/GPU. Ignora os primeiros quadros de aquecimento.
    if (++renders > 3) slow = cpuMs > 40 ? slow + 1 : 0;
    if (slow === 3 && dpr > 1) { dpr = 1; renderer.setPixelRatio(1); }
    if (slow >= 6) { callbacks.onFail("budget"); return; }
    callbacks.onStats({ cpuMs, dpr, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
  };
  const fit = () => {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight), aspect = w / h;
    renderer.setSize(w, h, false);
    const height = Math.max(kind === "scale" ? 4.4 : 3.9, (kind === "scale" ? 5.1 : 2.6) / aspect);
    camera.left = -height * aspect / 2; camera.right = height * aspect / 2; camera.top = height / 2; camera.bottom = -height / 2; camera.updateProjectionMatrix();
    draw();
  };
  const resize = new ResizeObserver(fit); resize.observe(host);
  const intersection = new IntersectionObserver(entries => { inView = entries[0]?.isIntersecting ?? false; if (inView) draw(); }); intersection.observe(host);
  const lost = (event: Event) => { event.preventDefault(); if (!disposed) callbacks.onFail("lost"); };
  canvas.addEventListener("webglcontextlost", lost); document.addEventListener("visibilitychange", draw);
  fit();
  const ready = renderer.compileAsync(scene, camera).then(() => { if (!disposed) { compiled = true; draw(); } });
  return {
    ready,
    update(input) { if (!disposed) { model.apply(input); draw(); } },
    dispose() {
      if (disposed) return; disposed = true;
      resize.disconnect(); intersection.disconnect(); document.removeEventListener("visibilitychange", draw); canvas.removeEventListener("webglcontextlost", lost);
      model.dispose(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    },
  };
}
