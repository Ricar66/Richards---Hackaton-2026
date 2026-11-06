import { parseLiveEvent, type LiveEvent, type LiveHello } from "@/modules/realtime/domain/live-event";

/**
 * Conector do navegador para a rota SSE `/api/live/stream`. Sem React: o provider do BI e a Sala ao vivo usam o mesmo.
 *
 * Estados (honestos, para a tela mostrar):
 * - connecting: abrindo pela primeira vez;
 * - live: `hello` recebido com o servidor escutando o banco, e algum quadro chegou há menos de WATCHDOG_MS;
 * - reconnecting: queda de rede, servidor sem LISTEN ou vigia estourado; o conector tenta de novo sozinho;
 * - down: várias tentativas seguidas falharam; quem usa deve cair para a consulta periódica (polling).
 *
 * Quadros SSE esperados: `hello` (LiveHello), `heartbeat` (LiveHeartbeat) e `live` (LiveEvent em JSON).
 */
export type LiveConnState = "connecting" | "live" | "reconnecting" | "down";

export type LiveConnectOptions = {
  url?: string;
  onEvent: (event: LiveEvent) => void;
  onState: (state: LiveConnState) => void;
  /** Chamado a cada `hello` (inclusive reconexão): é a hora de buscar o snapshot para cobrir o que se perdeu. */
  onHello?: (hello: LiveHello) => void;
  /** Fecha o stream com a aba oculta (libera conexão: o navegador permite só 6 por origem) e reabre ao voltar. Padrão: true. */
  pauseWhenHidden?: boolean;
};

const WATCHDOG_MS = 35_000;      // heartbeat do servidor a cada 15 s: dois perdidos = conexão morta
const MAX_BACKOFF_MS = 30_000;
const DOWN_AFTER_FAILURES = 3;

export function connectLive(opts: LiveConnectOptions): () => void {
  const url = opts.url ?? "/api/live/stream";
  const pauseWhenHidden = opts.pauseWhenHidden ?? true;
  let es: EventSource | null = null;
  let state: LiveConnState | null = null;
  let failures = 0;
  let retryTimer: number | undefined;
  let watchdog: number | undefined;
  let stopped = false;

  const setState = (next: LiveConnState) => { if (next !== state) { state = next; opts.onState(next); } };
  const clearTimers = () => { window.clearTimeout(retryTimer); window.clearTimeout(watchdog); retryTimer = watchdog = undefined; };
  const close = () => { clearTimers(); if (es) { es.close(); es = null; } };

  const armWatchdog = () => {
    window.clearTimeout(watchdog);
    watchdog = window.setTimeout(() => { scheduleRetry(); }, WATCHDOG_MS);
  };

  const scheduleRetry = () => {
    close();
    if (stopped) return;
    failures += 1;
    setState(failures >= DOWN_AFTER_FAILURES ? "down" : "reconnecting");
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(failures, 5));
    retryTimer = window.setTimeout(open, delay);
  };

  function open() {
    close();
    if (stopped) return;
    if (pauseWhenHidden && typeof document !== "undefined" && document.hidden) return;
    if (state === null) setState("connecting");
    const source = new EventSource(url);
    es = source;
    armWatchdog();
    source.addEventListener("hello", ev => {
      let hello: LiveHello | null = null;
      try { hello = JSON.parse((ev as MessageEvent<string>).data) as LiveHello; } catch { hello = null; }
      armWatchdog();
      if (!hello) return;
      if (hello.listening) { failures = 0; setState("live"); } else setState("reconnecting");
      opts.onHello?.(hello);
    });
    source.addEventListener("heartbeat", ev => {
      armWatchdog();
      try {
        const hb = JSON.parse((ev as MessageEvent<string>).data) as { listening?: boolean };
        if (hb.listening === false) setState("reconnecting");
        else if (state !== "live") { failures = 0; setState("live"); }
      } catch { /* quadro malformado: ignora */ }
    });
    source.addEventListener("live", ev => {
      armWatchdog();
      const event = parseLiveEvent((ev as MessageEvent<string>).data);
      if (event) opts.onEvent(event);
    });
    source.onerror = () => {
      // CONNECTING: o próprio navegador tenta de novo (retry do servidor). CLOSED (401, 503, tipo errado): reabrir na mão.
      if (source.readyState === EventSource.CLOSED) scheduleRetry();
      else setState("reconnecting");
    };
  }

  const onVisibility = () => {
    if (!pauseWhenHidden) return;
    if (document.hidden) close();
    else if (!es) { failures = 0; open(); }
  };

  open();
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
  return () => {
    stopped = true;
    close();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
  };
}
