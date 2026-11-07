import type { NextRequest } from "next/server";
import { DEMO_ORG_ID } from "@/lib/constants";
import { apiError } from "@/lib/http";
import { encodeLiveEvent, isWaterEvent, type LiveHeartbeat, type LiveHello } from "@/modules/realtime/domain/live-event";
import { getLiveHub } from "@/modules/realtime/infrastructure/event-hub";
// Stream infinito: nunca pré-renderizar (o build travaria esperando o fim do corpo).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Acima disto responde 503 e a tela segue pela consulta periódica (HTTP/1.1: o navegador abre só 6 por origem). */
const MAX_LIVE_STREAMS = 40;
const HEARTBEAT_MS = 15_000;
/** Na primeira conexão do processo o LISTEN ainda está subindo: espera um pouco antes do `hello` para não piscar "reconectando". */
const HELLO_WAIT_MS = 2_000;
const enc = new TextEncoder();
let openStreams = 0;

/**
 * SSE do barramento ao vivo (passa pela Basic Auth do `src/proxy.ts`, como o resto do BI).
 * Quadros: `hello` ao abrir e a cada volta da escuta do banco (a tela busca o snapshot de novo),
 * `heartbeat` a cada 15 s com `listening`, e `live` com cada evento da organização da demonstração.
 */
export async function GET(request: NextRequest) {
  if (openStreams >= MAX_LIVE_STREAMS)
    return apiError(503, "TOO_MANY_STREAMS", "Muitas telas ao vivo abertas. Feche abas sem uso; esta tela segue pela consulta periódica.");
  const hub = getLiveHub();
  openStreams++;
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let done = false;
      const send = (chunk: string) => { if (done) return; try { controller.enqueue(enc.encode(chunk)); } catch { cleanup(); } };
      const frame = (event: string, data: string) => `event: ${event}\ndata: ${data}\n\n`;
      const status = (): LiveHello & LiveHeartbeat => ({ serverTime: new Date().toISOString(), listening: hub.listening });
      let helloTimer: NodeJS.Timeout | undefined;
      const hello = () => { clearTimeout(helloTimer); helloTimer = undefined; send(frame("hello", JSON.stringify(status()))); };
      const off = hub.subscribe({
        event: event => { if (event.orgId === DEMO_ORG_ID && isWaterEvent(event)) send(frame("live", encodeLiveEvent(event))); },
        // Voltou a escutar: novo `hello` (o que caiu no intervalo vem pelo snapshot). Caiu: avisa já, sem esperar o heartbeat.
        listening: on => { if (on) hello(); else send(frame("heartbeat", JSON.stringify(status()))); },
      });
      const heartbeat = setInterval(() => {
        // Hub trocado (hot reload): fecha; o EventSource reabre sozinho no `retry` e assina o novo.
        if (getLiveHub() !== hub) { cleanup(); return; }
        send(frame("heartbeat", JSON.stringify(status())));
      }, HEARTBEAT_MS);
      cleanup = () => {
        if (done) return;
        done = true;
        openStreams--;
        clearInterval(heartbeat); clearTimeout(helloTimer); off();
        try { controller.close(); } catch { /* já fechado ou cancelado */ }
      };
      // 1º pedaço imediato: sem ele os cabeçalhos não saem e o EventSource fica esperando.
      if (hub.listening) send(`retry: 3000\n\n${frame("hello", JSON.stringify(status()))}`);
      else { send("retry: 3000\n\n: conectando ao banco\n\n"); helloTimer = setTimeout(hello, HELLO_WAIT_MS); }
      if (request.signal.aborted) cleanup();
      else request.signal.addEventListener("abort", () => cleanup(), { once: true });
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, { headers: {
    "Content-Type": "text/event-stream; charset=utf-8",
    // no-transform: sem ele a compressão do `next start` segura os eventos.
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  } });
}
