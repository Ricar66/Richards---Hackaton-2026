"use client";
import dynamic from "next/dynamic";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { TwinBoundary } from "@/components/stage/twin-boundary";
import { twinCapability } from "@/components/stage/stage-logic";
import { probeWebGL } from "@/components/stage/three/webgl-probe";
import type { WaterLayout } from "@/modules/water-map/domain/layout";
import type { MapNodeView, MapSceneStats } from "./three/map-scene";
import type { Map3DFail } from "./map-3d";

const Map3D = dynamic(() => import("./map-3d"), { ssr: false, loading: () => null });
type Reason = "no-webgl" | "software" | Map3DFail;
let probed: ReturnType<typeof twinCapability> | undefined;
const readProbe = () => (probed ??= twinCapability({ ...probeWebGL(), flag: true, reduced: false }));
const noSubscribe = () => () => {};
const REASON: Record<Reason, string> = { "no-webgl": "sem WebGL2", software: "GPU por software", lost: "contexto gráfico perdido", budget: "limite de desempenho", error: "cena indisponível" };

/**
 * Vista 3D com a mesma cadeia de reserva do gêmeo da Sala: sonda de WebGL2 (recusa renderização por software),
 * erro, perda de contexto e orçamento de quadro voltam à perspectiva vetorial, que fica sempre pronta.
 */
export function Map3DSlot({ layout, nodes, simulated, selected, still, onSelect, fallback }: {
  layout: WaterLayout; nodes: Record<string, MapNodeView>; simulated: boolean; selected: string; still: boolean; onSelect(id: string): void; fallback: ReactNode;
}) {
  // Sonda uma vez por página (cria e descarta dois contextos de teste); no servidor não há sonda: sem diferença na hidratação.
  const probe = useSyncExternalStore(noSubscribe, readProbe, () => null);
  const [failed, setFailed] = useState<Reason | null>(null);
  const [ready, setReady] = useState(false);
  const [stats, setStats] = useState<MapSceneStats | null>(null);
  const reason: Reason | null = failed ?? (probe && probe !== "ok" ? probe as Reason : null);
  if (reason) return <div className="hyd-3d-fallback">{fallback}<p className="hyd-mode" role="status">Perspectiva vetorial · 3D indisponível ({REASON[reason]})</p></div>;
  return <div className="hyd-3d-wrap" data-map-mode={ready ? "3d" : "loading"}>
    {probe === "ok" && <TwinBoundary onFail={() => setFailed("error")}>
      <Map3D layout={layout} nodes={nodes} simulated={simulated} selected={selected} still={still} onSelect={onSelect}
        onReady={() => setReady(true)} onFail={setFailed} onStats={setStats} />
    </TwinBoundary>}
    {!ready && <div className="hyd-3d-loading" aria-hidden="true">{fallback}</div>}
    <p className="hyd-mode" role="status">{ready ? `3D · GPU${stats ? ` · ${Math.round(stats.fps)} fps` : ""}` : "Preparando 3D…"}{still && ready ? " · movimento pausado" : ""}</p>
  </div>;
}
