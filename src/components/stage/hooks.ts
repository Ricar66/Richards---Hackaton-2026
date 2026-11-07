"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { frameDelta } from "@/lib/ease";

/** "Reduzir movimento" do sistema: sem rolagem contínua, sem água correndo, trocas secas. */
export function useReducedMotion() {
  return useSyncExternalStore(
    cb => { const q = window.matchMedia("(prefers-reduced-motion: reduce)"); q.addEventListener("change", cb); return () => q.removeEventListener("change", cb); },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/** Cursor some depois de `ms` parado (tela de palco); volta ao mexer. */
export function useIdleCursor(ms = 3000) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let timer = window.setTimeout(() => setIdle(true), ms);
    const wake = () => { setIdle(false); window.clearTimeout(timer); timer = window.setTimeout(() => setIdle(true), ms); };
    window.addEventListener("mousemove", wake);
    window.addEventListener("mousedown", wake);
    return () => { window.clearTimeout(timer); window.removeEventListener("mousemove", wake); window.removeEventListener("mousedown", wake); };
  }, [ms]);
  return idle;
}

/** Teclas da Sala além de F/Esc. Cada handler é opcional; a referência pode mudar a cada render. */
export type StageKeyHandlers = { onPause?: () => void; onToggle3d?: () => void; onDiag?: () => void };

const TWIN_KEY = "richards.sala.3d";
const twinListeners = new Set<() => void>();
function readTwinFlag(): boolean | null {
  try { const v = window.localStorage.getItem(TWIN_KEY); return v === "1" ? true : v === "0" ? false : null; } catch { return null; }
}
/**
 * Chave do gêmeo 3D. Prioridade: a tecla 3 nesta sessão > `?3d=1` / `?3d=0` > o que ficou gravado neste navegador >
 * tentativa automática com cadeia de fallback. A tecla grava a escolha (localStorage em try/catch).
 */
export function useTwinFlag(urlFlag: boolean | null): [boolean, () => void] {
  const stored = useSyncExternalStore(
    cb => { twinListeners.add(cb); window.addEventListener("storage", cb); return () => { twinListeners.delete(cb); window.removeEventListener("storage", cb); }; },
    readTwinFlag,
    () => null,
  );
  const [override, setOverride] = useState<boolean | null>(null);
  const flag = override ?? urlFlag ?? stored ?? true;
  const toggle = () => {
    const next = !flag;
    setOverride(next);
    try { window.localStorage.setItem(TWIN_KEY, next ? "1" : "0"); } catch { /* sem armazenamento: vale só nesta aba */ }
    twinListeners.forEach(l => l());
  };
  return [flag, toggle];
}

/**
 * F alterna tela cheia; Esc sai (o navegador também sai sozinho). P pausa e retoma o movimento (WCAG 2.2.2):
 * água, rolagem da faixa e viagem do pacote param; números, feed e relógio seguem o servidor.
 * 3 liga e desliga o gêmeo 3D; D mostra o diagnóstico do gêmeo (modo, motivo, renderizador, quadro).
 */
export function useStageKeys(handlers: StageKeyHandlers = {}, enabled = true) {
  const saved = useRef(handlers);
  useEffect(() => { saved.current = handlers; });
  useEffect(() => {
    // `?atalhos=0` (WCAG 2.1.4): atalhos de uma tecla desligados; tela cheia pelo F11 do navegador.
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        else void document.documentElement.requestFullscreen?.().catch(() => {});
      } else if (e.key === "Escape" && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      else if ((e.key === "p" || e.key === "P") && saved.current.onPause) { e.preventDefault(); saved.current.onPause(); }
      else if (e.key === "3" && saved.current.onToggle3d) { e.preventDefault(); saved.current.onToggle3d(); }
      else if ((e.key === "d" || e.key === "D") && saved.current.onDiag) { e.preventDefault(); saved.current.onDiag(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

/** Tamanho em px do elemento (o SVG da faixa desenha em px reais: círculo redondo e traço nítido). */
export function useElementSize<T extends HTMLElement>(): [RefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize(s => (Math.abs(s.w - width) < 0.5 && Math.abs(s.h - height) < 0.5 ? s : { w: width, h: height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

/** Laço de quadro (rAF) enquanto `active`; o callback recebe o tempo do quadro e o delta em segundos. */
export function useFrame(cb: (now: number, dt: number) => void, active: boolean) {
  const saved = useRef(cb);
  useEffect(() => { saved.current = cb; });
  useEffect(() => {
    if (!active) return;
    let raf = 0, last = performance.now();
    // frameDelta nunca é negativo: o 1º quadro pode ter tempo anterior ao `last` (ver src/lib/ease.ts).
    const step = (t: number) => { const dt = frameDelta(t, last); last = Math.max(last, t); saved.current(t, dt); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active]);
}
