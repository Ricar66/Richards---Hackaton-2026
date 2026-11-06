"use client";
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { connectLive, type LiveConnState } from "@/lib/live-client";
import type { LiveEvent, LiveEventType, LiveHello, ReadingCreatedEvent } from "@/modules/realtime/domain/live-event";
import type { LiveDTO } from "@/modules/analytics/domain/dashboard";
import { mergeSnapshot, RECENT_MAX, withReading } from "./live-scope";

/**
 * Sinal ao vivo do BI: UM EventSource por aba (connectLive), guardado numa store fora do React.
 * - Contagens e ocorrências ativas vêm sempre do GET /api/analytics/live (a cada `hello`, inclusive reconexão, e a cada evento de ocorrência).
 * - `reading.created` só troca o último valor e a série curta pelo valor GRAVADO que veio no evento: nada é somado no navegador.
 * - Stream fora (reconnecting/down) → volta a consulta de 5 s; se a consulta também falha → offline ("números parados").
 */
export type LiveView = "connecting" | "live" | "reconnecting" | "polling" | "offline";
export type LiveSnapshot = { state: LiveView; live: LiveDTO | null; lastEventAt: number | null };
/** Ocorrência para avisar uma vez só: veio do evento ou, com o stream fora, apareceu entre duas consultas. */
export type NewOccurrence = LiveDTO["active"][number] & { via: "event" | "snapshot" };

const POLL_MS = 5_000;
const SAFETY_MS = 30_000;
const SERVER_SNAPSHOT: LiveSnapshot = { state: "connecting", live: null, lastEventAt: null };

function createLiveStore() {
  let snap = SERVER_SNAPSHOT;
  let conn: LiveConnState = "connecting";
  let failed = false;                 // última consulta ao /api/analytics/live falhou
  let inflight = false, again = false, stopped = true;
  let pollTimer: number | undefined, pollEvery = 0;
  let points: LiveDTO["recent"] = []; // leituras do stream ainda não confirmadas por um retrato do servidor
  let pendingLast: LiveDTO["lastReading"] = null;
  const seen = new Set<string>(), probed = new Set<string>(); let baselined = false;
  const readingKeys = new Set<string>();
  const views = new Set<() => void>();
  const onEvents = new Set<(e: LiveEvent) => void>();
  const onHellos = new Set<(h: LiveHello) => void>();
  const onNews = new Set<(o: NewOccurrence) => void>();

  const emit = <T,>(set: Set<(x: T) => void>, x: T) => set.forEach(fn => { try { fn(x); } catch (err) { console.error("sinal ao vivo", err); } });
  const set = (patch: Partial<LiveSnapshot>) => { snap = { ...snap, ...patch }; views.forEach(v => v()); };
  const view = (): LiveView => conn === "live" ? "live" : conn === "connecting" ? "connecting" : failed ? "offline" : conn === "down" ? "polling" : "reconnecting";
  /** Consulta de reserva (5 s) com o stream fora; com ele ao vivo, uma de segurança a cada 30 s (aviso perdido não some). */
  const sync = () => {
    if (snap.state !== view()) set({ state: view() });
    const fallback = conn === "reconnecting" || conn === "down" || (conn === "live" && failed);
    const every = stopped ? 0 : fallback ? POLL_MS : conn === "live" ? SAFETY_MS : 0;
    if (every === pollEvery) return;
    window.clearInterval(pollTimer); pollTimer = undefined; pollEvery = every;
    if (!every) return;
    pollTimer = window.setInterval(() => { if (!document.hidden) void refresh(); }, every);
    if (fallback) void refresh();
  };

  function notice(o: LiveDTO["active"][number], via: NewOccurrence["via"]) {
    if (seen.has(o.id)) return;
    seen.add(o.id); emit(onNews, { ...o, via });
  }

  /** Uma consulta por vez; o que pedir no meio sai logo depois (contagem nunca fica para trás). */
  async function refresh() {
    if (inflight) { again = true; return; }
    inflight = true;
    try {
      const res = await fetch("/api/analytics/live", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json() as LiveDTO;
      if (stopped) return;
      // A primeira consulta só registra o que já existia: aviso é para o que surgir com a tela aberta.
      if (baselined) body.active.forEach(o => notice(o, "snapshot"));
      else { body.active.forEach(o => seen.add(o.id)); baselined = true; }
      const live = mergeSnapshot(body, { last: snap.live?.lastReading ?? pendingLast, points });
      const lastT = body.recent.length ? body.recent[body.recent.length - 1].t : -Infinity;
      points = points.filter(p => p.t > lastT); pendingLast = null;
      failed = false; set({ live });
    } catch { failed = true; }
    finally { inflight = false; sync(); if (again && !stopped) { again = false; void refresh(); } }
  }

  /** Leitura repetida (mesmo deviceId, bootId e sequence) é ignorada; sem retrato ainda, guarda para fundir quando ele chegar. */
  function onReading(e: ReadingCreatedEvent): Partial<LiveSnapshot> {
    const key = `${e.deviceId}|${e.bootId}|${e.sequence}`;
    if (readingKeys.has(key)) return {};
    readingKeys.add(key);
    if (readingKeys.size > 1000) readingKeys.delete(readingKeys.values().next().value!);
    points = [...points, { t: Date.parse(e.capturedAt), flowLpm: e.flowLpm }].slice(-RECENT_MAX);
    // Leitura ligada a ocorrência que a tela não conhece: o `occurrence.opened` pode ter se perdido; o retrato confirma e avisa.
    if (e.occurrenceId && baselined && !seen.has(e.occurrenceId) && !probed.has(e.occurrenceId)) { probed.add(e.occurrenceId); void refresh(); }
    if (snap.live) return { live: withReading(snap.live, e) };
    // Nunca cria um retrato com contagem "0" que o servidor não disse.
    if (!pendingLast || Date.parse(e.capturedAt) >= Date.parse(pendingLast.at)) pendingLast = { at: e.capturedAt, flowLpm: e.flowLpm, deltaLiters: e.deltaLiters, source: e.source, deviceCode: e.deviceCode };
    return {};
  }

  function onEvent(e: LiveEvent) {
    if (stopped) return;
    let patch: Partial<LiveSnapshot> = {};
    if (e.type === "reading.created") patch = onReading(e);
    else if (e.type === "occurrence.opened") {
      notice({ id: e.id, title: e.title, severity: e.severity, status: "OPEN", source: e.source, openedAt: e.openedAt }, "event");
      void refresh();
    } else if (e.type === "occurrence.status" || e.type === "resync") void refresh();
    set({ ...patch, lastEventAt: Date.now() });
    emit(onEvents, e);
  }

  const sub = <T,>(s: Set<T>, fn: T) => { s.add(fn); return () => { s.delete(fn); }; };
  return {
    get: () => snap,
    getServer: () => SERVER_SNAPSHOT,
    subscribe: (cb: () => void) => sub(views, cb),
    onEvent: (fn: (e: LiveEvent) => void) => sub(onEvents, fn),
    onHello: (fn: (h: LiveHello) => void) => sub(onHellos, fn),
    onNew: (fn: (o: NewOccurrence) => void) => sub(onNews, fn),
    start(url?: string) {
      stopped = false;
      const stop = connectLive({
        url, onEvent,
        onState: s => { conn = s; sync(); },
        onHello: h => { void refresh(); emit(onHellos, h); },
      });
      return () => { stopped = true; stop(); conn = "connecting"; sync(); };
    },
  };
}
type LiveStore = ReturnType<typeof createLiveStore>;

const StoreCtx = createContext<LiveStore | null>(null);
/** Fora do provider (ex.: tela sem o shell) os hooks ficam em "connecting", sem abrir conexão. */
const IDLE = createLiveStore();
const useStore = () => useContext(StoreCtx) ?? IDLE;

/** Fica no layout do BI, por fora do shell: o stream não reconecta a cada troca de tela. */
export function LiveStreamProvider({ children, url }: { children: React.ReactNode; url?: string }) {
  const [store] = useState(createLiveStore);
  useEffect(() => store.start(url), [store, url]);
  return <StoreCtx.Provider value={store}>{children}</StoreCtx.Provider>;
}

/** Estado, último retrato e hora do último evento. Re-renderiza a cada leitura: use só em componente pequeno (pílula, painel ao vivo). */
export function useLiveStream(): LiveSnapshot {
  const s = useStore();
  return useSyncExternalStore(s.subscribe, s.get, s.getServer);
}
/** Só o estado da conexão: não re-renderiza a cada leitura. */
export function useLiveState(): LiveView {
  const s = useStore();
  return useSyncExternalStore(s.subscribe, () => s.get().state, () => SERVER_SNAPSHOT.state);
}

type EventOf<T extends LiveEventType> = Extract<LiveEvent, { type: T }>;
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => { ref.current = value; });
  return ref;
}
/** Ouve tipos de evento sem re-renderizar: o handler mais recente é chamado direto. */
export function useLiveEvent<T extends LiveEventType>(types: T | readonly T[], handler: (e: EventOf<T>) => void) {
  const s = useStore();
  const ref = useLatest(handler);
  const key = (typeof types === "string" ? [types] : types).join(",");
  useEffect(() => {
    const wanted = new Set(key.split(","));
    return s.onEvent(e => { if (wanted.has(e.type)) ref.current(e as EventOf<T>); });
  }, [s, key, ref]);
}
/** Cada `hello` (inclusive reconexão): hora de buscar de novo o que pode ter passado com o stream fora. */
export function useLiveHello(handler: (h: LiveHello) => void) {
  const s = useStore();
  const ref = useLatest(handler);
  useEffect(() => s.onHello(h => ref.current(h)), [s, ref]);
}
/** Ocorrência nova, uma vez por id (evento ou diferença entre consultas compartilham o mesmo conjunto). */
export function useNewOccurrence(handler: (o: NewOccurrence) => void) {
  const s = useStore();
  const ref = useLatest(handler);
  useEffect(() => s.onNew(o => ref.current(o)), [s, ref]);
}

/**
 * Contador para refazer uma busca local (gavetas) quando chega evento que interessa:
 * espera `delay` depois do primeiro evento e no máximo uma vez a cada `gap` (leitura a cada 2 s não vira 1 busca a cada 2 s).
 */
export function useLiveVersion<T extends LiveEventType>(types: T | readonly T[], match: (e: EventOf<T>) => boolean, { delay = 600, gap = 1500 } = {}) {
  const [version, setVersion] = useState(0);
  const box = useRef({ timer: undefined as number | undefined, last: 0 });
  useEffect(() => { const b = box.current; return () => window.clearTimeout(b.timer); }, []);
  useLiveEvent(types, e => {
    const b = box.current;
    if (b.timer !== undefined || !match(e)) return;
    b.timer = window.setTimeout(() => { b.timer = undefined; b.last = Date.now(); setVersion(v => v + 1); }, Math.max(delay, b.last + gap - Date.now()));
  });
  return version;
}
