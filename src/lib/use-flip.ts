"use client";
import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * FLIP próprio (sem dependência, Web Animations API): quando a lista muda, cada filho marcado com `data-flip` que mudou
 * de lugar desliza do lugar antigo para o novo (220 ms, só transform). Linha nova não "empurra" as outras aos saltos.
 * A WAAPI não obedece ao CSS de "reduzir movimento": por isso `enabled` vem de fora (false = troca seca).
 */
export function useFlip<T extends HTMLElement>(ref: RefObject<T | null>, version: unknown, enabled: boolean) {
  const last = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    const now = new Map<string, number>();
    for (const child of Array.from(list.children) as HTMLElement[]) {
      const key = child.dataset.flip;
      if (!key) continue;
      const top = child.offsetTop;
      now.set(key, top);
      const before = last.current.get(key);
      if (enabled && before !== undefined && before !== top && typeof child.animate === "function")
        child.animate([{ transform: `translateY(${before - top}px)` }, { transform: "none" }], { duration: 220, easing: "ease-out" });
    }
    last.current = now;
  }, [ref, version, enabled]);
}
