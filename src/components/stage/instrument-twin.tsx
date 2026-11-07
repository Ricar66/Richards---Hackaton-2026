"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { TwinBoundary } from "./twin-boundary";
import type { InstrumentState } from "./instrument-state";
import type { TwinReason } from "./stage-logic";
import type { InstrumentStats } from "./three/instrument-scene";
import type { InstrumentKind } from "./three/instrument-models";
const Canvas = dynamic(() => import("./instrument-canvas"), { ssr: false, loading: () => null });
const REASON: Partial<Record<TwinReason, string>> = { off: "opção 2D", reduced: "movimento reduzido", software: "GPU por software", "no-webgl": "sem WebGL2", lost: "contexto perdido", error: "cena indisponível", budget: "limite de desempenho" };

/** Lazy por interseção: no celular não cria contexto para um cartão que ainda não foi visto. */
export function InstrumentTwin({ kind, input, enabled = false, reduced = false, diag = false, label, children }: {
  kind: InstrumentKind; input: InstrumentState; enabled?: boolean; reduced?: boolean; diag?: boolean; label: string; children?: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false), [ready, setReady] = useState(false), [failed, setFailed] = useState<TwinReason | null>(null);
  const [stats, setStats] = useState<InstrumentStats | null>(null);
  const wanted = enabled && !reduced;
  const [previousWanted, setPreviousWanted] = useState(wanted);
  if (previousWanted !== wanted) { setPreviousWanted(wanted); setReady(false); setFailed(null); }
  useEffect(() => {
    if (!host.current || !wanted) return;
    if (typeof IntersectionObserver !== "function") {
      let alive = true; queueMicrotask(() => { if (alive) setFailed("error"); });
      return () => { alive = false; };
    }
    const observer = new IntersectionObserver(entries => { if (entries[0]?.isIntersecting) setSeen(true); }, { rootMargin: "100px" });
    observer.observe(host.current); return () => observer.disconnect();
  }, [wanted]);
  const reason = !enabled ? "off" : reduced ? "reduced" : failed;
  const mount = wanted && seen && !failed;
  const mode = reason ? "svg" : ready ? "3d" : "loading";
  return <div className={`instrument-twin instrument-${kind}`} ref={host} data-instrument-mode={mode} data-instrument-reason={reason ?? undefined} data-sim={input.simulated ? "" : undefined} role="img" aria-label={label}>
    <div className="instrument-fallback" aria-hidden="true">{children}</div>
    {mount && <TwinBoundary onFail={() => setFailed("error")}><Canvas kind={kind} input={input} onReady={() => setReady(true)} onFail={setFailed} onStats={diag ? setStats : () => {}} /></TwinBoundary>}
    <small className="instrument-mode" aria-hidden="true">{mode === "3d" ? "3D · sob demanda" : reason ? `2D · ${REASON[reason]}` : "2D · preparando 3D"}</small>
    {diag && stats && mode === "3d" && <small className="instrument-diagnostic" aria-hidden="true">último desenho: {stats.calls} chamadas · {stats.triangles} tri · DPR {stats.dpr} · CPU {stats.cpuMs.toFixed(1)} ms</small>}
  </div>;
}
