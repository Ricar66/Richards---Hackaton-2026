"use client";
import { useEffect, useRef } from "react";
import { twinCapability, type TwinReason } from "./stage-logic";
import { createPipeScene, type PipeScene, type SceneInput, type SceneStats } from "./three/pipe-scene";
import { probeWebGL } from "./three/webgl-probe";

export type Twin3DFail = Exclude<TwinReason, "off" | "reduced">;
export type Twin3DProps = SceneInput & {
  onReady(info: { renderer: string | null; dpr: number }): void;
  onFail(reason: Twin3DFail): void;
  onStats?(s: SceneStats): void;
};

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
