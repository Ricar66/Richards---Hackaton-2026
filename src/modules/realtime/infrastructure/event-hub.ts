import pg from "pg";
import { LIVE_CHANNEL, parseLiveEvent, type LiveEvent } from "../domain/live-event";

/**
 * Ouvinte único do canal ao vivo por processo: UM `pg.Client` dedicado com `LISTEN` (nunca o pool do Prisma,
 * que é pequeno e devolve a conexão) e fan-out em memória para as rotas SSE.
 * - Só conecta na primeira assinatura, nunca no import (o `next build` não abre conexão).
 * - LISTEN fora de transação; handler de `error` sempre presente (sem ele, a queda do banco derruba o Next).
 * - Queda → `listening: false` para os assinantes e nova tentativa com espera de 0,5 s a 10 s.
 * - `SELECT 1` a cada 30 s descobre conexão morta que o socket ainda não acusou.
 * Suba `HUB_VERSION` ao mudar esta classe: no hot reload o ouvinte antigo é encerrado e trocado.
 */
export const HUB_VERSION = 1;
const MIN_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 10_000;
const PING_MS = 30_000;

export type LiveSubscriber = {
  /** Evento válido (versão e tipo conhecidos) vindo do banco; filtrar por organização é de quem assina. */
  event: (event: LiveEvent) => void;
  /** Mudou o estado da escuta: false = eventos podem estar se perdendo (a tela avisa e consulta o snapshot). */
  listening?: (listening: boolean) => void;
};

export class LiveEventHub {
  readonly version = HUB_VERSION;
  private readonly subscribers = new Set<LiveSubscriber>();
  private client: pg.Client | null = null;
  private retryTimer: NodeJS.Timeout | undefined;
  private pingTimer: NodeJS.Timeout | undefined;
  private backoff = MIN_BACKOFF_MS;
  private on = false;
  private stopped = false;

  constructor(private readonly connectionString = () => process.env.DATABASE_URL) {}

  get listening() { return this.on; }
  get size() { return this.subscribers.size; }

  /** Assina eventos e mudanças de escuta. Devolve a função que cancela (chamar sempre, inclusive em erro). */
  subscribe(subscriber: LiveSubscriber): () => void {
    this.subscribers.add(subscriber);
    if (!this.stopped && !this.client && !this.retryTimer) void this.connect();
    return () => { this.subscribers.delete(subscriber); };
  }

  /** Encerra a escuta de vez (testes e troca de versão no hot reload). */
  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.retryTimer); this.retryTimer = undefined;
    const client = this.client;
    if (client) this.release(client);
    this.setListening(false);
    this.subscribers.clear();
  }

  private async connect() {
    this.retryTimer = undefined;
    if (this.stopped) return;
    const url = this.connectionString();
    const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5_000, keepAlive: true, application_name: "richards-live-hub" });
    this.client = client;
    client.on("error", error => this.drop(client, error));
    client.on("end", () => this.drop(client, new Error("conexão encerrada")));
    client.on("notification", message => {
      if (message.channel !== LIVE_CHANNEL || !message.payload) return;
      const event = parseLiveEvent(message.payload);
      if (event) this.fanOut(s => s.event(event));
    });
    try {
      if (!url) throw new Error("DATABASE_URL ausente");
      await client.connect();
      await client.query(`LISTEN "${LIVE_CHANNEL}"`);
      if (this.client !== client) return; // parado ou trocado enquanto conectava
      this.backoff = MIN_BACKOFF_MS;
      this.pingTimer = setInterval(() => { client.query("SELECT 1").catch(error => this.drop(client, error)); }, PING_MS);
      this.pingTimer.unref?.();
      this.setListening(true);
    } catch (error) { this.drop(client, error); }
  }

  /** Conexão perdida (erro, fim ou ping falho): libera, avisa e agenda nova tentativa. Idempotente por cliente. */
  private drop(client: pg.Client, error: unknown) {
    if (this.client !== client) return;
    this.release(client);
    this.setListening(false);
    if (this.stopped) return;
    console.warn(`[live] escuta do banco indisponível (${error instanceof Error ? error.message : String(error)}); nova tentativa em ${this.backoff} ms`);
    this.retryTimer = setTimeout(() => { void this.connect(); }, this.backoff);
    this.retryTimer.unref?.();
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
  }

  private release(client: pg.Client) {
    if (this.client === client) this.client = null;
    clearInterval(this.pingTimer); this.pingTimer = undefined;
    client.removeAllListeners();
    client.on("error", () => {}); // erro tardio do socket antigo não pode virar exceção sem tratamento
    client.end().catch(() => {});
  }

  private setListening(next: boolean) {
    if (next === this.on) return;
    this.on = next;
    this.fanOut(s => s.listening?.(next));
  }

  private fanOut(deliver: (s: LiveSubscriber) => void) {
    for (const s of [...this.subscribers]) {
      try { deliver(s); } catch (error) { console.warn(`[live] assinante falhou: ${error instanceof Error ? error.message : String(error)}`); }
    }
  }
}

const globalForHub = globalThis as unknown as { richardsLiveHub?: LiveEventHub };
/** Hub do processo (guardado em globalThis como o Prisma em `src/lib/db.ts`). Criar não conecta. */
export function getLiveHub(): LiveEventHub {
  const current = globalForHub.richardsLiveHub;
  if (current && current.version === HUB_VERSION) return current;
  void current?.stop?.();
  return (globalForHub.richardsLiveHub = new LiveEventHub());
}
