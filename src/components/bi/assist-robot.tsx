"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrefersReducedMotion } from "./hooks";
import { useLiveStream } from "./live-stream";
import { parseRobotMode, robotGreeting, robotView, ROBOT_KEY, type RobotMode } from "./assist-robot-state";

// A escolha fica neste navegador. Sem armazenamento (aba privada bloqueada), vale só enquanto a aba estiver aberta.
const listeners = new Set<() => void>();
let memory: RobotMode | null = null;
function readMode(): RobotMode {
  try { return parseRobotMode(window.localStorage.getItem(ROBOT_KEY) ?? memory); } catch { return parseRobotMode(memory); }
}
function writeMode(mode: RobotMode) {
  memory = mode;
  try { window.localStorage.setItem(ROBOT_KEY, mode); } catch { /* fica só na memória da aba */ }
  listeners.forEach(l => l());
}
function useRobotMode(): RobotMode | null {
  return useSyncExternalStore(
    cb => { listeners.add(cb); window.addEventListener("storage", cb); return () => { listeners.delete(cb); window.removeEventListener("storage", cb); }; },
    readMode,
    () => null, // no servidor não há escolha: o robô só aparece depois de hidratar
  );
}

/** Desenho próprio do robô (SVG, sem arquivo externo). A gota no peito é a da marca; nada aqui é dado. */
function RobotFigure() {
  return <svg className="robo-figure" viewBox="0 0 56 66" width="56" height="66" aria-hidden="true" focusable="false">
    <line x1="28" y1="11" x2="28" y2="5" className="robo-line" />
    <circle cx="28" cy="4" r="3.2" className="robo-light" />
    <rect x="7" y="18" width="3.5" height="8" rx="1.6" className="robo-dark" />
    <rect x="45.5" y="18" width="3.5" height="8" rx="1.6" className="robo-dark" />
    <rect x="10" y="10" width="36" height="25" rx="9" className="robo-shell" />
    <rect x="15" y="15" width="26" height="14" rx="6.5" className="robo-visor" />
    <g className="robo-eyes"><circle cx="23" cy="21.5" r="2.6" /><circle cx="33" cy="21.5" r="2.6" /></g>
    <path d="M25 25.6 q3 2 6 0" className="robo-smile" />
    <rect x="10.5" y="37" width="4" height="12" rx="2" className="robo-arm robo-arm-l" />
    <rect x="41.5" y="37" width="4" height="12" rx="2" className="robo-arm robo-arm-r" />
    <rect x="19" y="50" width="6.5" height="11" rx="2.6" className="robo-leg robo-leg-l" />
    <rect x="30.5" y="50" width="6.5" height="11" rx="2.6" className="robo-leg robo-leg-r" />
    <rect x="15" y="35" width="26" height="18" rx="6" className="robo-body" />
    <circle cx="28" cy="44" r="5" className="robo-visor" />
    <path d="M28 40.4c-1.7 2.3-2.4 3.5-2.4 4.5a2.4 2.4 0 0 0 4.8 0c0-1-.7-2.2-2.4-4.5z" className="robo-drop" />
  </svg>;
}

/**
 * Robozinho do RICHARDS Assist andando no rodapé do BI. É um atalho para o assistente, não um painel:
 * fica abaixo das gavetas e dos avisos, para ao passar o mouse ou focar, e pode parar ou sumir (WCAG 2.2.2).
 * Com "reduzir movimento" fica parado. A antena acende com o estado do canal (sem inventar nada).
 */
export function AssistRobot() {
  const pathname = usePathname();
  const reduced = usePrefersReducedMotion();
  const mode = useRobotMode();
  const { state, live } = useLiveStream();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    box.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const view = mode === null ? null : robotView(mode, reduced, pathname);
  if (!view || mode === null) return null;
  const count = live?.activeCount ?? null;
  const hello = robotGreeting(count);
  const tone = state === "offline" ? "off" : count ? "warn" : "on";
  const choose = (next: RobotMode) => { setOpen(false); writeMode(next); if (next !== "oculto") trigger.current?.focus(); };

  return <div className="robo-strip" data-robo={view} data-open={open ? "" : undefined}>
    <div className="robo-walker" ref={box} data-tone={tone}>
      <span className="robo-bubble" aria-hidden="true">{hello}</span>
      <button ref={trigger} type="button" className="robo-btn" aria-haspopup="menu" aria-expanded={open}
        aria-label={`Robô do RICHARDS Assist. ${hello} Abrir opções`} onClick={() => setOpen(o => !o)}>
        <RobotFigure />
      </button>
      {open && <div className="robo-menu" role="menu" aria-label="Robô do RICHARDS Assist">
        <Link role="menuitem" className="robo-item primary" href="/assistente" onClick={() => setOpen(false)}>Conversar com o Assist</Link>
        <button role="menuitem" type="button" className="robo-item" disabled={reduced} onClick={() => choose(mode === "parado" ? "andando" : "parado")}>
          {reduced ? "Parado (reduzir movimento ativo)" : mode === "parado" ? "Voltar a andar" : "Parar de andar"}
        </button>
        <button role="menuitem" type="button" className="robo-item" onClick={() => choose("oculto")}>Esconder o robô</button>
      </div>}
    </div>
  </div>;
}

/** Na barra lateral: traz o robô de volta depois de escondido. */
export function RobotToggle() {
  const mode = useRobotMode();
  if (mode !== "oculto") return null;
  return <button type="button" className="robo-show" onClick={() => writeMode("andando")}>Mostrar o robô do Assist</button>;
}
