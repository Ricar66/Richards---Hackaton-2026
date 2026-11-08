"use client";
import { useEffect, useRef, useState } from "react";
import { Hand, Minus, Plus, RotateCcw } from "lucide-react";
import { floorLabel, floorOf, floorsOf, type WaterLayout } from "@/modules/water-map/domain/layout";
import { layoutLabels, labelRect } from "./label-layout";
import { createMapScene, nodeColor, type FloorMode, type MapNodeView, type MapProjection, type MapScene, type MapSceneStats } from "./three/map-scene";

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
/** Toque (celular/tablet): girar só depois de "Explorar 3D", senão o dedo prende a rolagem da página. */
const coarse = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

/** Maquete 3D (carregada por next/dynamic, ssr:false). Rótulos em HTML por cima do canvas: nítidos e clicáveis. */
export default function Map3D({ layout, nodes, simulated, selected, still, onSelect, onReady, onFail, onStats }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<MapScene | null>(null);
  const latest = useRef({ onReady, onFail, onStats });
  useEffect(() => { latest.current = { onReady, onFail, onStats }; });
  const [proj, setProj] = useState<MapProjection | null>(null);
  const floors = floorsOf(layout);
  const [floor, setFloor] = useState<FloorMode>("all");
  const [interactive, setInteractive] = useState(() => !coarse());
  // Ponto escolhido (na lista ou na maquete) em outro pavimento: a vista de um pavimento só vai até ele.
  // Só na TROCA de seleção; depois disso o operador escolhe o pavimento livremente.
  const [prevSel, setPrevSel] = useState(selected);
  if (prevSel !== selected) {
    setPrevSel(selected);
    const node = layout.nodes.find(n => n.id === selected);
    if (node && floor !== "all" && floorOf(node) !== floor) setFloor(floorOf(node));
  }
  const shownFloor: FloorMode = floor !== "all" && !floors.includes(floor) ? "all" : floor;
  const input = { layout, nodes, simulated, selected, still, visible: true, floor: shownFloor, interactive };
  const inputRef = useRef(input);
  // Antes dos efeitos que leem o ref (a ordem de declaração é a ordem de execução).
  useEffect(() => { inputRef.current = input; });
  const frame = useRef(0);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let alive = true;
    // Reprojeta os rótulos no máximo uma vez por quadro do navegador (giro, zoom, resize e mudança de planta).
    const reproject = () => { if (frame.current) return; frame.current = requestAnimationFrame(() => { frame.current = 0; if (alive && scene.current) setProj(scene.current.project()); }); };
    let s: MapScene;
    try {
      s = createMapScene(el, {
        onLost: () => { if (alive) latest.current.onFail("lost"); },
        onBudget: () => { if (alive) latest.current.onFail("budget"); },
        onStats: st => latest.current.onStats?.(st),
        onView: reproject,
      });
    } catch { queueMicrotask(() => { if (alive) latest.current.onFail("error"); }); return () => { alive = false; }; }
    scene.current = s;
    s.update(inputRef.current);
    s.ready.then(() => { if (!alive) return; reproject(); latest.current.onReady(); }, () => { if (alive) latest.current.onFail("error"); });
    return () => { alive = false; if (frame.current) cancelAnimationFrame(frame.current); frame.current = 0; scene.current = null; s.dispose(); };
  }, []);

  const key = JSON.stringify([layout, nodes, simulated, selected, still, shownFloor, interactive]);
  useEffect(() => { scene.current?.update(inputRef.current); }, [key]);

  // Rótulos sem encavalar: selecionado > ocorrência > fluxo > instrumentado > entrada/distribuição > demais.
  const W = proj?.size.w ?? 1, H = proj?.size.h ?? 1;
  const modes = proj ? layoutLabels(layout.nodes.flatMap((n, i) => {
    const p = proj.nodes[n.id]; if (!p) return [];
    const v = nodes[n.id];
    const priority = (v?.alert ? 0 : v?.state === "FLOW" ? 1 : n.deviceId ? 2 : n.kind !== "OUTLET" ? 3 : 4) * 100 + i;
    return [{ id: n.id, x: p.x * W, y: p.y * H, title: n.label, sub: readingText(v, !!n.deviceId), priority, selected: selected === n.id }];
  }), {
    narrow: W < 650,
    // Faixa da barra de ferramentas e as etiquetas de pavimento (âncora à direita, no meio: translate(-100%, -50%)).
    reserved: [{ x0: 0, y0: 0, x1: W, y1: 46 }, ...Object.entries(proj.floors).map(([f, p]) => { const w = 8.2 * floorLabel(layout, Number(f)).length + 18; return { x0: p.x * W - w, y0: p.y * H - 12, x1: p.x * W, y1: p.y * H + 12 }; })],
  }) : new Map();
  const taken = proj ? layout.nodes.flatMap(n => {
    const p = proj.nodes[n.id], m = modes.get(n.id); if (!p || !m) return [];
    const x = p.x * W, y = p.y * H;
    return [m === "dot" ? { x0: x - 9, y0: y - 9, x1: x + 9, y1: y + 9 } : labelRect({ x, y, title: n.label, sub: readingText(nodes[n.id], !!n.deviceId) }, m)];
  }) : [];
  const roomShown = (x: number, y: number, label: string) => { const r = { x0: x, y0: y - 11, x1: x + 7 * label.length + 14, y1: y + 11 }; if (y < 50 || taken.some(t => r.x0 < t.x1 && r.x1 > t.x0 && r.y0 < t.y1 && r.y1 > t.y0)) return false; taken.push(r); return true; };
  return <div className="hyd-3d" ref={host}>
    {proj && <div className="hyd-3d-labels" aria-hidden="true">
      {Object.entries(proj.floors).map(([f, p]) => <span key={`f${f}`} className="hyd-3d-floor" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>{floorLabel(layout, Number(f))}</span>)}
      {layout.rooms.map(r => { const p = proj.rooms[r.id]; return p && roomShown(p.x * W, p.y * H, r.label) ? <span key={r.id} className="hyd-3d-room" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>{r.label}</span> : null; })}
      {layout.nodes.map((n, i) => {
        const p = proj.nodes[n.id], mode = modes.get(n.id); if (!p || !mode) return null;
        const v = nodes[n.id], color = nodeColor(v, simulated);
        return <button key={n.id} type="button" tabIndex={-1} className={`hyd-3d-node${selected === n.id ? " sel" : ""}${v?.alert ? " alert" : ""}${mode === "mini" ? " mini" : mode === "dot" ? " dot" : ""}`} style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, ["--node" as string]: color }} onClick={() => onSelect(n.id)} title={`${n.label} · ${readingText(v, !!n.deviceId)}`}>
          <b>{i + 1}</b><span>{n.label}<small>{readingText(v, !!n.deviceId)}{v?.alert ? " · ocorrência" : ""}</small></span>
        </button>;
      })}
    </div>}
    <div className="hyd-3d-tools">
      {floors.length > 1 && <div className="hyd-3d-floors" role="group" aria-label="Pavimento na maquete">
        <button type="button" aria-pressed={shownFloor === "all"} onClick={() => setFloor("all")}>Prédio inteiro</button>
        {floors.map(f => <button key={f} type="button" aria-pressed={shownFloor === f} onClick={() => setFloor(f)}>{floorLabel(layout, f).replace(" pavimento", " pav.")}</button>)}
      </div>}
      <div className="hyd-3d-cam" role="group" aria-label="Câmera da maquete">
        {coarse() && <button type="button" aria-pressed={interactive} onClick={() => setInteractive(v => !v)} title={interactive ? "Voltar a rolar a página" : "Girar e aproximar com o dedo"}><Hand size={14} aria-hidden="true" />{interactive ? "Rolar página" : "Explorar 3D"}</button>}
        <button type="button" onClick={() => scene.current?.zoom(1 / 1.25)} aria-label="Aproximar"><Plus size={14} aria-hidden="true" /></button>
        <button type="button" onClick={() => scene.current?.zoom(1.25)} aria-label="Afastar"><Minus size={14} aria-hidden="true" /></button>
        <button type="button" onClick={() => scene.current?.resetView()} aria-label="Vista inicial"><RotateCcw size={14} aria-hidden="true" /></button>
      </div>
    </div>
    {!coarse() && <p className="hyd-3d-hint" aria-hidden="true">Arraste para girar · Ctrl + roda para aproximar · botão direito para mover</p>}
  </div>;
}
