"use client";
import dynamic from "next/dynamic";
import { useReducer, useState } from "react";
import { PipeTwin } from "./pipe-twin";
import { TwinBoundary } from "./twin-boundary";
import { contextLossPolicy, waterSpeed, type PipeTone, type TwinReason } from "./stage-logic";
import type { Twin3DFail } from "./pipe-twin-3d";
import type { SceneStats } from "./three/pipe-scene";

// Só no cliente e só quando a chave está ligada: as rotas do BI e o primeiro quadro da Sala não carregam o three.
const PipeTwin3D = dynamic(() => import("./pipe-twin-3d"), { ssr: false, loading: () => null });

type Status = { attempt: number; ready: boolean; failed: Twin3DFail | null; losses: number[]; renderer: string | null; dpr: number | null };
type Action = { type: "ready"; renderer: string | null; dpr: number } | { type: "fail"; reason: Twin3DFail; at: number } | { type: "retry" };
const INITIAL: Status = { attempt: 0, ready: false, failed: null, losses: [], renderer: null, dpr: null };

function reduce(s: Status, a: Action): Status {
  switch (a.type) {
    case "ready": return { ...s, ready: true, failed: null, renderer: a.renderer, dpr: a.dpr };
    case "retry": return { ...s, ready: false, failed: null, attempt: s.attempt + 1 };
    case "fail": {
      if (a.reason !== "lost") return { ...s, ready: false, failed: a.reason };
      // Perda de contexto: SVG na hora; a 1ª remonta num canvas novo, 2 em 60 s ficam no SVG.
      const losses = [...s.losses, a.at];
      return contextLossPolicy(losses, a.at) === "remount"
        ? { ...s, losses, ready: false, failed: null, attempt: s.attempt + 1 }
        : { ...s, losses, ready: false, failed: "lost" };
    }
  }
}

const REASON_LABEL: Record<TwinReason, string> = {
  off: "chave desligada (tecla 3 ou ?3d=1)", reduced: "reduzir movimento do sistema", "no-webgl": "sem WebGL2",
  software: "renderização por software", error: "erro na cena", lost: "contexto WebGL perdido duas vezes", budget: "abaixo do orçamento de quadro",
};

type Props = {
  flowLpm: number | null; tone: PipeTone; simulated: boolean; live: boolean; pulseKey: string | null;
  /** Reduzir movimento OU pausa (P): o desenho para. */
  still: boolean;
  /** Reduzir movimento do sistema: nem tenta o 3D. */
  reduced: boolean;
  want3d: boolean; diag: boolean;
};

/**
 * Decide o gêmeo da vazão: SVG (padrão e reserva, sempre montado e acessível) ou cano 3D por cima.
 * O SVG só fica transparente quando o 3D está pronto; qualquer elo da cadeia de reserva volta a ele na hora.
 * `data-twin-mode` (svg | loading | 3d) e `data-twin-reason` servem ao E2E e ao diagnóstico (tecla D).
 */
export function TwinSlot({ flowLpm, tone, simulated, live, pulseKey, still, reduced, want3d, diag }: Props) {
  const [st, dispatch] = useReducer(reduce, INITIAL);
  const [stats, setStats] = useState<SceneStats | null>(null);
  // Cada vez que o 3D volta a ser pedido (tecla 3, ou "reduzir movimento" desligado), é uma tentativa NOVA: canvas novo,
  // `ready` zerado (o SVG só some quando ESTA cena compilou) e falha anterior esquecida.
  const wanted = want3d && !reduced;
  const [prevWanted, setPrevWanted] = useState(wanted);
  if (wanted !== prevWanted) { setPrevWanted(wanted); if (wanted) dispatch({ type: "retry" }); }

  const reason: TwinReason | null = !want3d ? "off" : reduced ? "reduced" : st.failed;
  const mount3d = reason === null;
  const mode = reason ? "svg" : st.ready ? "3d" : "loading";
  const onFail = (r: Twin3DFail) => dispatch({ type: "fail", reason: r, at: Date.now() });

  return <div className="twin-slot" data-twin-mode={mode} data-twin-reason={reason ?? undefined}>
    <PipeTwin flowLpm={flowLpm} tone={tone} still={still} simulated={simulated} active={mode !== "3d"} pulseKey={pulseKey} />
    {mount3d && <TwinBoundary key={st.attempt} onFail={() => onFail("error")}>
      <PipeTwin3D speed={waterSpeed(flowLpm)} tone={tone} simulated={simulated} live={live} still={still} pulseKey={pulseKey} visible={mode === "3d"}
        onReady={i => dispatch({ type: "ready", ...i })} onFail={onFail} onStats={diag ? setStats : undefined} />
    </TwinBoundary>}
    <span className="twin-mode-label" role="status">{mode === "3d" ? "3D ATIVO" : mode === "loading" ? "SVG 2D · preparando 3D" : want3d && reason ? `SVG 2D · ${REASON_LABEL[reason]}` : "SVG 2D"}</span>
    {diag && <pre className="twin-diag" aria-hidden="true">{[
      `modo ${mode}${reason ? ` · ${REASON_LABEL[reason]}` : ""}`,
      // "ANGLE (Intel, Intel(R) Graphics (0x…) Direct3D11 vs_5_0 ps_5_0, D3D11)" → "Intel(R) Graphics · Direct3D11"
      `gpu ${st.renderer ? st.renderer.replace(/^ANGLE \([^,]+,\s*/, "").replace(/\s*\(0x[0-9A-Fa-f]+\)/, "").replace(/\s+vs_\S+\s+ps_\S+,.*$/, "").replace(/\s+Direct3D/, " · Direct3D").replace(/\)$/, "") : "—"}`,
      `dpr ${stats?.dpr ?? st.dpr ?? "—"} · nível ${stats?.level ?? 0}`,
      stats && mode === "3d" ? `quadro p50 ${stats.p50.toFixed(1)} ms · p95 ${stats.p95.toFixed(1)} ms · ${stats.fps.toFixed(0)} fps` : "quadro — (sem laço: nada se move)",
      stats && mode === "3d" ? `draw calls ${stats.calls} · triângulos ${stats.triangles}` : "",
      `perdas de contexto ${st.losses.length}`,
    ].filter(Boolean).join("\n")}</pre>}
  </div>;
}
