"use client";
import { useEffect, useRef, useState } from "react";
import type { WaterLayout } from "@/modules/water-map/domain/layout";
import { createMapScene, nodeColor, type MapNodeView, type MapProjection, type MapScene, type MapSceneStats } from "./three/map-scene";

export type Map3DFail = "lost" | "budget" | "error";
type Props = {
  layout: WaterLayout; nodes: Record<string, MapNodeView>; simulated: boolean; selected: string; still: boolean;
  onSelect(id: string): void; onReady(): void; onFail(reason: Map3DFail): void; onStats?(s: MapSceneStats): void;
};
const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
function readingText(v: MapNodeView | undefined, metered: boolean) {
  if (!metered) return "não instrumentado";
  if (!v || v.state === "NO_READING") return "aguardando leitura";
  if (v.state === "STALE") return "sem leitura recente";
  return `${fmt(v.flowLpm ?? 0)} L/min`;
}

/** Cena 3D do mapa (carregada por next/dynamic, ssr:false). Rótulos em HTML por cima do canvas: nítidos e clicáveis. */
export default function Map3D({ layout, nodes, simulated, selected, still, onSelect, onReady, onFail, onStats }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<MapScene | null>(null);
  const latest = useRef({ onReady, onFail, onStats });
  useEffect(() => { latest.current = { onReady, onFail, onStats }; });
  const [proj, setProj] = useState<MapProjection | null>(null);
  const input = { layout, nodes, simulated, selected, still, visible: true };
  const inputRef = useRef(input);
  // Antes dos efeitos que leem o ref (a ordem de declaração é a ordem de execução).
  useEffect(() => { inputRef.current = input; });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let alive = true, frame = 0;
    // Reprojeta os rótulos no máximo uma vez por quadro de animação do navegador (resize e mudança de planta).
    const reproject = () => { if (frame) return; frame = requestAnimationFrame(() => { frame = 0; if (alive && scene.current) setProj(scene.current.project()); }); };
    let s: MapScene;
    try {
      s = createMapScene(el, {
        onLost: () => { if (alive) latest.current.onFail("lost"); },
        onBudget: () => { if (alive) latest.current.onFail("budget"); },
        onStats: st => latest.current.onStats?.(st),
      });
    } catch { queueMicrotask(() => { if (alive) latest.current.onFail("error"); }); return () => { alive = false; }; }
    scene.current = s;
    s.update(inputRef.current);
    s.ready.then(() => { if (!alive) return; reproject(); latest.current.onReady(); }, () => { if (alive) latest.current.onFail("error"); });
    const ro = new ResizeObserver(reproject);
    ro.observe(el);
    return () => { alive = false; if (frame) cancelAnimationFrame(frame); ro.disconnect(); scene.current = null; s.dispose(); };
  }, []);

  const layoutKey = JSON.stringify([layout.rooms, layout.nodes.map(n => [n.id, n.x, n.y, n.kind, !!n.deviceId]), layout.edges]);
  useEffect(() => {
    const s = scene.current;
    if (!s) return;
    s.update(inputRef.current);
    setProj(s.project());
  }, [layoutKey]);
  const nodesKey = JSON.stringify(nodes);
  useEffect(() => { scene.current?.update(inputRef.current); }, [nodesKey, simulated, selected, still]);

  return <div className="hyd-3d" ref={host}>
    {proj && <div className="hyd-3d-labels" aria-hidden="true">
      {layout.rooms.map(r => { const p = proj.rooms[r.id]; return p ? <span key={r.id} className="hyd-3d-room" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>{r.label}</span> : null; })}
      {layout.nodes.map((n, i) => {
        const p = proj.nodes[n.id]; if (!p) return null;
        const v = nodes[n.id], color = nodeColor(v, simulated);
        return <button key={n.id} type="button" tabIndex={-1} className={`hyd-3d-node${selected === n.id ? " sel" : ""}${v?.alert ? " alert" : ""}`} style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, ["--node" as string]: color }} onClick={() => onSelect(n.id)}>
          <b>{i + 1}</b><span>{n.label}<small>{readingText(v, !!n.deviceId)}{v?.alert ? " · ocorrência" : ""}</small></span>
        </button>;
      })}
    </div>}
  </div>;
}
