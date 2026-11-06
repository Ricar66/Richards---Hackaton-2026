"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";

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

/** F alterna tela cheia; Esc sai (o navegador também sai sozinho). */
export function useStageKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        else void document.documentElement.requestFullscreen?.().catch(() => {});
      } else if (e.key === "Escape" && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
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
    const step = (t: number) => { const dt = Math.min(0.1, (t - last) / 1000); last = t; saved.current(t, dt); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active]);
}
