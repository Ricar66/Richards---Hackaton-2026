"use client";
import { useEffect, useRef } from "react";
import { twinCapability, type TwinProbe, type TwinReason } from "./stage-logic";
import { createPipeScene, type PipeScene, type SceneInput, type SceneStats } from "./three/pipe-scene";

export type Twin3DFail = Exclude<TwinReason, "off" | "reduced">;
export type Twin3DProps = SceneInput & {
  onReady(info: { renderer: string | null; dpr: number }): void;
  onFail(reason: Twin3DFail): void;
  onStats?(s: SceneStats): void;
};

/**
 * Sonda do WebGL antes de criar a cena: webgl2 existe? Com failIfMajorPerformanceCaveat ele sai (recusa WARP)?
 * E o nome do renderizador (SwiftShader/llvmpipe = software). Os contextos de teste são descartados na hora.
 */
function probeWebGL(): TwinProbe {
  try {
    const a = document.createElement("canvas").getContext("webgl2");
    if (!a) return { webgl2: false, caveatOk: false, renderer: null };
    const info = a.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(info ? a.getParameter(info.UNMASKED_RENDERER_WEBGL) : a.getParameter(a.RENDERER));
    a.getExtension("WEBGL_lose_context")?.loseContext();
    const b = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    b?.getExtension("WEBGL_lose_context")?.loseContext();
    return { webgl2: true, caveatOk: !!b, renderer };
  } catch {
    return { webgl2: false, caveatOk: false, renderer: null };
  }
}

/**
 * Cano 3D por cima do SVG (carregado só com a chave ligada, por next/dynamic com ssr:false). Os objetos do three
 * vivem dentro de `createPipeScene`; aqui só se repassam as props. Qualquer falha avisa o slot, que mostra o SVG.
 */
export default function PipeTwin3D(props: Twin3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<PipeScene | null>(null);
  const latest = useRef(props);
  useEffect(() => { latest.current = props; });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let alive = true;
    const fail = (r: Twin3DFail) => { if (alive) latest.current.onFail(r); };
    const probe = probeWebGL();
    const cap = twinCapability({ ...probe, flag: true, reduced: false });
    if (cap !== "ok") { queueMicrotask(() => fail(cap as Twin3DFail)); return () => { alive = false; }; }
    let s: PipeScene;
    try {
      s = createPipeScene(el, {
        onLost: () => fail("lost"),
        onBudget: () => fail("budget"),
        onStats: st => { if (alive) latest.current.onStats?.(st); },
      });
    } catch {
      queueMicrotask(() => fail("error"));
      return () => { alive = false; };
    }
    scene.current = s;
    s.ready.then(() => { if (alive) latest.current.onReady({ renderer: probe.renderer, dpr: s.dpr() }); }, () => fail("error"));
    return () => { alive = false; scene.current = null; s.dispose(); };
  }, []);

  const { speed, tone, simulated, live, still, pulseKey, visible, view } = props;
  useEffect(() => { scene.current?.update({ speed, tone, simulated, live, still, pulseKey, visible, view }); }, [speed, tone, simulated, live, still, pulseKey, visible, view]);

  return <div ref={host} className="twin-canvas" aria-hidden="true" />;
}
