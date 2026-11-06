"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import type { DashboardDTO } from "@/modules/analytics/domain/dashboard";
import type { LiveEventType } from "@/modules/realtime/domain/live-event";
import { timeBR } from "@/lib/format";
import { eventInScope, scopeOf, viewPolicy, type ViewPolicy } from "./live-scope";
import { useLiveEvent, useLiveHello, useLiveState } from "./live-stream";

/** Avisa todas as telas abertas que algo mudou no servidor (ação concluída, ocorrência nova). */
export const DATA_CHANGED = "richards:data-changed";
export const notifyDataChanged = () => window.dispatchEvent(new Event(DATA_CHANGED));
/** Relatórios: a prévia ficou para trás (o shell mostra o aviso) e o pedido para atualizá-la. */
export const PREVIEW_OUTDATED = "richards:preview-outdated";
export const PREVIEW_REFRESH = "richards:preview-refresh";

const POLL_MS = 15_000;      // stream fora: consulta periódica, como antes
const SAFETY_MS = 60_000;    // stream ao vivo: uma busca de segurança (evento perdido nunca deixa a tela errada por muito tempo)
const DELAY_MS = 600;
const EVENTS: LiveEventType[] = ["reading.created", "occurrence.opened", "occurrence.status", "donation.created", "donation.status", "resync"];

/** Busca do dashboard: uma por vez, a anterior é abortada quando o filtro muda e resposta de outro filtro é descartada. */
function createRefresher(initialQuery: string, ok: (d: DashboardDTO) => void, fail: () => void) {
  let query = initialQuery, ctrl: AbortController | null = null, timer: number | undefined, again = false;
  let lastRun = 0, freshAt = Date.now(), gap = 1500, news = 0, wasLive = false;
  const r = {
    get freshAt() { return freshAt; },
    setQuery(q: string, nextGap: number) {
      gap = nextGap;
      if (q === query) return;
      ctrl?.abort(); ctrl = null; window.clearTimeout(timer); timer = undefined; again = false; news = 0;
      query = q; freshAt = Date.now();
    },
    async run() {
      window.clearTimeout(timer); timer = undefined;
      if (ctrl) { again = true; return; }
      const q = query, c = new AbortController();
      ctrl = c; lastRun = Date.now();
      try {
        const res = await fetch(`/api/analytics/dashboard${q ? `?${q}` : ""}`, { cache: "no-store", signal: c.signal });
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json() as DashboardDTO;
        if (c.signal.aborted || q !== query) return;
        freshAt = Date.now(); news = 0; ok(body);
      } catch { if (!c.signal.aborted && q === query) fail(); }
      finally { if (ctrl === c) ctrl = null; if (again) { again = false; r.schedule(0); } }
    },
    /** Espera `delay` desde o primeiro evento e respeita o intervalo mínimo; eventos no meio não adiam a busca. */
    schedule(delay = DELAY_MS) {
      if (timer !== undefined) return;
      timer = window.setTimeout(() => void r.run(), Math.max(delay, lastRun + gap - Date.now()));
    },
    /** Relatórios: conta o que mudou desde a prévia; true só no primeiro (para avisar uma vez). */
    mark() { news += 1; return news === 1; },
    /** true quando o stream acabou de deixar de estar ao vivo. */
    left(live: boolean) { const out = wasLive && !live; wasLive = live; return out; },
    dispose() { ctrl?.abort(); ctrl = null; window.clearTimeout(timer); timer = undefined; },
  };
  return r;
}

/**
 * Snapshot do dashboard: começa com o que o servidor renderizou para a URL atual e é refeito quando chega evento do stream
 * que cai no recorte (live-scope.ts). Stream fora: consulta a cada 15 s. Os números SEMPRE vêm do servidor.
 * Se a busca falha, os números ficam parados E isso aparece na tela (`stale`), nunca trocados por simulação.
 * Relatórios não muda sozinho (prévia = PDF): `news` conta o que chegou depois e `refresh` atualiza.
 */
export function useDashboard(initial: DashboardDTO, opts: Partial<ViewPolicy> = {}) {
  const pathname = usePathname() ?? "/";
  const policy = { ...viewPolicy(pathname), ...opts };
  const [data, setData] = useState(initial);
  const [stale, setStale] = useState<string | null>(null);
  const [news, setNews] = useState(0);
  // Nova URL de filtro → o servidor manda outro snapshot: adota no render (sem efeito em cascata).
  const [synced, setSynced] = useState(initial);
  if (synced !== initial) { setSynced(initial); setData(initial); setStale(null); setNews(0); }
  const query = initial.filter.query;
  const [r] = useState(() => createRefresher(query, body => { setData(body); setStale(null); setNews(0); }, () => setStale(prev => prev ?? timeBR())));
  const live = useLiveState() === "live";
  const scope = useMemo(() => scopeOf(data), [data]);

  useEffect(() => { r.setQuery(query, policy.gapMs); }, [r, query, policy.gapMs]);
  useEffect(() => () => r.dispose(), [r]);

  useLiveEvent(EVENTS, e => {
    if (e.type === "reading.created" && !policy.readings) return;
    if (!eventInScope(e, scope)) return;
    if (!policy.manual) { r.schedule(); return; }
    if (r.mark()) window.dispatchEvent(new Event(PREVIEW_OUTDATED));
    setNews(n => n + 1);
  });
  // Reconectou (ou a aba voltou): o que passou com o stream fora só aparece buscando de novo.
  useLiveHello(() => { if (!policy.manual && Date.now() - r.freshAt > 3_000) r.schedule(); });

  // Saiu do ao vivo: busca na hora (se o servidor caiu, a faixa de números parados aparece logo).
  useEffect(() => { if (r.left(live)) void r.run(); }, [r, live]);
  useEffect(() => {
    if (live && policy.manual) return;
    const timer = window.setInterval(() => { if (!document.hidden) void r.run(); }, live ? SAFETY_MS : POLL_MS);
    return () => window.clearInterval(timer);
  }, [r, live, policy.manual]);

  useEffect(() => {
    const onChanged = () => void r.run();
    window.addEventListener(DATA_CHANGED, onChanged);
    if (policy.manual) window.addEventListener(PREVIEW_REFRESH, onChanged);
    return () => { window.removeEventListener(DATA_CHANGED, onChanged); window.removeEventListener(PREVIEW_REFRESH, onChanged); };
  }, [r, policy.manual]);

  return { data, stale, refresh: r.run, news };
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
