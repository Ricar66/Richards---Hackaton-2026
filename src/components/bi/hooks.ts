"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { DashboardDTO } from "@/modules/analytics/domain/dashboard";
import { timeBR } from "@/lib/format";

/** Avisa todas as telas abertas que algo mudou no servidor (ação concluída, ocorrência nova). */
export const DATA_CHANGED = "richards:data-changed";
export const notifyDataChanged = () => window.dispatchEvent(new Event(DATA_CHANGED));

const POLL_MS = 15_000;

/**
 * Snapshot do dashboard: começa com o que o servidor renderizou para a URL atual e é atualizado por polling (15 s, não streaming).
 * Se o polling falha, os números ficam parados E isso aparece na tela (`stale`), nunca trocados por simulação.
 */
export function useDashboard(initial: DashboardDTO) {
  const [data, setData] = useState(initial);
  const [stale, setStale] = useState<string | null>(null);
  // Nova URL de filtro → o servidor manda outro snapshot: adota no render (sem efeito em cascata).
  const [synced, setSynced] = useState(initial);
  if (synced !== initial) { setSynced(initial); setData(initial); setStale(null); }
  const query = initial.filter.query;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/analytics/dashboard${query ? `?${query}` : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json() as DashboardDTO); setStale(null);
    } catch { setStale(prev => prev ?? timeBR()); }
  }, [query]);

  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, POLL_MS);
    const onChanged = () => void refresh();
    window.addEventListener(DATA_CHANGED, onChanged);
    return () => { window.clearInterval(timer); window.removeEventListener(DATA_CHANGED, onChanged); };
  }, [refresh]);

  return { data, stale, refresh };
}

/** Relógio compartilhado (1 s) para "há 8 s". `null` no primeiro render: servidor e navegador geram o mesmo HTML. */
let clock: number | null = null;
const listeners = new Set<() => void>();
let ticker: number | undefined;
function subscribe(cb: () => void) {
  listeners.add(cb);
  if (ticker === undefined) {
    const tick = () => { clock = Date.now(); listeners.forEach(l => l()); };
    ticker = window.setInterval(tick, 1000);
    window.setTimeout(tick, 0);
  }
  return () => { listeners.delete(cb); if (!listeners.size) { window.clearInterval(ticker); ticker = undefined; } };
}
export const useNow = () => useSyncExternalStore(subscribe, () => clock, () => null);

export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    cb => { const m = window.matchMedia("(prefers-reduced-motion: reduce)"); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}
