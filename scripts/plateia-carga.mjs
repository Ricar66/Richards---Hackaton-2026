#!/usr/bin/env node
/**
 * Ensaio de 70 (ou N) espectadores SSE. Não cria dados, não usa credenciais.
 * Uso: node scripts/plateia-carga.mjs http://127.0.0.1:3000/api/plateia/stream 70 25
 * Rodar no computador externo ao servidor e acompanhar "docker stats" na VPS.
 * Isso é um teste DE CONEXÃO, não garante 70 celulares físicos no Wi-Fi do evento.
 */
const target = process.argv[2];
const count = Number(process.argv[3] ?? 70);
const seconds = Number(process.argv[4] ?? 25);
if (!target || !/^https?:\/\//.test(target) || !target.endsWith("/api/plateia/stream") ||
    !Number.isInteger(count) || count < 1 || count > 150 ||
    !Number.isFinite(seconds) || seconds < 5 || seconds > 180) {
  console.error("Uso: node scripts/plateia-carga.mjs http://HOST:PORT/api/plateia/stream [70] [25]");
  process.exit(2);
}
const started = Date.now();
const records = [];
async function spectator(id) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), seconds * 1000);
  const result = { id, status: null, connectedMs: null, statuses: 0, samples: 0, error: null };
  try {
    const res = await fetch(target, { signal: ctrl.signal, cache: "no-store", headers: { Accept: "text/event-stream" } });
    result.status = res.status;
    result.connectedMs = Date.now() - started;
    if (!res.ok || !res.body) return result;
    let buffer = "";
    for await (const chunk of res.body) {
      buffer += new TextDecoder().decode(chunk);
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (frame.includes("event: status")) result.statuses++;
        if (frame.includes("event: sample")) result.samples++;
      }
      if (buffer.length > 100000) throw new Error("buffer de evento muito grande");
      if (Date.now() - started >= seconds * 1000) break;
    }
  } catch (error) {
    if (!ctrl.signal.aborted) result.error = error instanceof Error ? error.message : String(error);
  } finally {
    clearTimeout(timer);
    ctrl.abort();
  }
  return result;
}
console.log("Teste da plateia:", target, "| espectadores:", count, "| duração:", seconds, "s");
const samples = await Promise.all(Array.from({ length: count }, (_, i) => spectator(i + 1)));
records.push(...samples);
const accepted = records.filter(r => r.status === 200);
const warmed = accepted.filter(r => r.statuses > 0);
const errors = records.filter(r => r.error || r.status !== 200);
console.log(JSON.stringify({
  requested: count, accepted: accepted.length, receivedStatus: warmed.length,
  framesStatus: records.reduce((n, r) => n + r.statuses, 0),
  framesSample: records.reduce((n, r) => n + r.samples, 0),
  connectP95ms: accepted.length ? [...accepted].map(r => r.connectedMs).sort((a, b) => a - b)[Math.ceil(accepted.length * .95) - 1] : null,
  errors: errors.slice(0, 10), elapsedSeconds: Math.round((Date.now() - started) / 1000),
}, null, 2));
if (accepted.length !== count || warmed.length !== count || errors.length) process.exitCode = 1;
