import type { NextRequest } from "next/server";
import { DEMO_ORG_ID } from "@/lib/constants";
import { audienceKey, publicReadings, type AudienceReading } from "@/modules/audience/public-feed";
import { getLiveHub } from "@/modules/realtime/infrastructure/event-hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Leitura pública SOMENTE: 70 celulares e margem de reconexão, 110 por processo.
 * Todos compartilham UM ouvinte pg LISTEN no LiveEventHub. ZERO SELECT por espectador.
 * A capacidade efetiva depende da VPS e exige teste real de carga.
 */
export const MAX_AUDIENCE_STREAMS = 110;
const HEARTBEAT_MS = 15000;
const CACHE_MS = 120000;
const MAX_CACHE = 24; // evita fechar conexão ao enviar snapshot > highWaterMark (32) para celular novo
const encoder = new TextEncoder();
let clients = 0;
const recent = new Map<string, AudienceReading>();
const frame = (name: string, data: unknown) => "event: " + name + "\ndata: " + JSON.stringify(data) + "\n\n";

function remember(s: AudienceReading) {
  const key = audienceKey(s);
  recent.delete(key);
  recent.set(key, s);
  if (recent.size > MAX_CACHE) recent.delete(recent.keys().next().value!);
}
function snapshot() {
  const minAt = Date.now() - CACHE_MS;
  for (const [key, value] of recent) if (!Number.isFinite(Date.parse(value.at)) || Date.parse(value.at) < minAt) recent.delete(key);
  return [...recent.values()];
}

export async function GET(request: NextRequest) {
  if (clients >= MAX_AUDIENCE_STREAMS)
    return new Response(JSON.stringify({ error: "CAPACIDADE_ATINGIDA" }), { status: 503, headers: { "Content-Type": "application/json", "Retry-After": "5", "Cache-Control": "no-store" } });
  const hub = getLiveHub();
  clients++;
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let stopped = false;
      let unsubscribe = () => {};
      // Criado ANTES do cleanup: se o envio inicial já encerrar a conexão (cliente lento), o cleanup consegue parar o
      // intervalo. Criado depois, ele nascia com a conexão fechada e ficava rodando para sempre (um timer por conexão).
      const heartbeat = setInterval(() => {
        if (getLiveHub() !== hub) { cleanup(); return; }
        send(frame("status", status()));
      }, HEARTBEAT_MS);
      const abort = () => cleanup();
      cleanup = () => {
        if (stopped) return;
        stopped = true;
        clients--;
        clearInterval(heartbeat);
        unsubscribe();
        request.signal.removeEventListener("abort", abort);
        try { controller.close(); } catch { /* cancelamento pelo browser */ }
      };
      const send = (data: string) => {
        if (stopped) return;
        // Evita memória ilimitada em clientes lentos: EventSource reconecta.
        if (controller.desiredSize !== null && controller.desiredSize <= 0) { cleanup(); return; }
        try { controller.enqueue(encoder.encode(data)); } catch { cleanup(); }
      };
      const status = () => ({ serverTime: new Date().toISOString(), listening: hub.listening });
      unsubscribe = hub.subscribe({
        event(e) {
          if (e.orgId !== DEMO_ORG_ID) return;
          for (const sample of publicReadings(e)) {
            remember(sample);
            send(frame("sample", sample));
          }
        },
        listening() { send(frame("status", status())); },
      });
      send("retry: 4000\n\n" + frame("status", status()));
      for (const sample of snapshot()) send(frame("sample", sample));
      if (request.signal.aborted) cleanup();
      else request.signal.addEventListener("abort", abort, { once: true });
    },
    cancel() { cleanup(); },
  }, { highWaterMark: 32 });
  return new Response(stream, { headers: {
    "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform",
    "X-Accel-Buffering": "no", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
  } });
}
