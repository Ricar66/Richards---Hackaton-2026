#!/usr/bin/env node
/**
 * Teste de carga NÃO destrutivo: 70 conexões HTTP/SSE simultâneas à plateia.
 * Apenas GET. Não publica leitura, não cria lote e não acessa credencial.
 *
 * node scripts/plateia-carga.mjs --url http://localhost:3000/plateia --clients 70 --seconds 20
 * Rodar contra a VPS somente após autorização da equipe/infraestrutura.
 */
const args = process.argv.slice(2);
const arg = key => {
  const index = args.indexOf(key);
  return index < 0 ? undefined : args[index + 1];
};
const url = arg("--url");
const clients = Number(arg("--clients") ?? 70);
const seconds = Number(arg("--seconds") ?? 20);
if (!url || !Number.isInteger(clients) || clients < 1 || clients > 150 || !Number.isFinite(seconds) || seconds < 5 || seconds > 120) {
  console.error("Uso: node scripts/plateia-carga.mjs --url http://localhost:3000/plateia [--clients 70] [--seconds 20]");
  process.exit(2);
}
let endpoint;
try {
  const base = new URL(url);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) throw new Error("protocolo/credencial inválidos");
  endpoint = new URL("/api/plateia/stream", base);
} catch {
  console.error("Informe uma URL HTTP(S) válida e SEM usuário/senha.");
  process.exit(2);
}
const results = [];
const controllers = [];
const start = performance.now();
const task = async i => {
  const c = new AbortController();
  controllers.push(c);
  const result = { client: i, status: 0, statusFrames: 0, listening: false, samples: 0, firstStatusMs: null, error: null };
  results.push(result);
  try {
    const response = await fetch(endpoint, {
      signal: c.signal,
      headers: { Accept: "text/event-stream", "Cache-Control": "no-cache" },
      cache: "no-store",
    });
    result.status = response.status;
    if (!response.ok || !response.headers.get("content-type")?.includes("text/event-stream") || !response.body) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      buffer += decoder.decode(part.value, { stream: true });
      let cut;
      while ((cut = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        if (frame.includes("event: status")) {
          result.statusFrames++;
          if (result.firstStatusMs === null) result.firstStatusMs = Math.round(performance.now() - start);
          const raw = frame.split("\n").find(line => line.startsWith("data: "));
          if (raw) {
            try { if (JSON.parse(raw.slice(6)).listening === true) result.listening = true; }
            catch { /* quadro inválido não é contado como LISTEN ativo */ }
          }
        }
        if (frame.includes("event: sample")) result.samples++;
      }
      if (buffer.length > 128_000) buffer = ""; // cliente malformado não acumula memória sem limite
    }
  } catch (err) {
    if (!c.signal.aborted) result.error = err instanceof Error ? err.message : String(err);
  }
};
console.log(JSON.stringify({ target: endpoint.toString(), clients, seconds, startedAt: new Date().toISOString() }));
const timer = setTimeout(() => controllers.forEach(c => c.abort()), seconds * 1000);
await Promise.all(Array.from({ length: clients }, (_, i) => task(i + 1)));
clearTimeout(timer);
const ok = results.filter(r => r.status === 200 && r.statusFrames >= 1 && r.listening && !r.error);
const codes = Object.fromEntries([...new Set(results.map(r => r.status))].map(status => [status, results.filter(r => r.status === status).length]));
const slow = results.map(r => r.firstStatusMs).filter(x => x !== null).sort((a, b) => a - b);
const percentile = p => slow.length ? slow[Math.min(slow.length - 1, Math.floor((slow.length - 1) * p))] : null;
const summary = {
  requested: clients,
  accepted200: results.filter(r => r.status === 200).length,
  connectedAndListening: ok.length,
  listeningOff: results.filter(r => r.status === 200 && r.statusFrames && !r.listening).length,
  failures: results.filter(r => r.error).slice(0, 5).map(r => ({ client: r.client, error: r.error })),
  statusCodes: codes, samplesObserved: results.reduce((sum, r) => sum + r.samples, 0),
  firstStatusP50Ms: percentile(.5), firstStatusP95Ms: percentile(.95),
  completedAt: new Date().toISOString(),
};
console.log(JSON.stringify(summary, null, 2));
if (ok.length !== clients) {
  console.error("FALHOU: nem todos os espectadores receberam status SSE com LISTEN ativo.");
  process.exitCode = 1;
} else console.log("PASSOU (conexões): todos receberam stream SSE + LISTEN ativo. Verifique também entrega dos eventos do ESP32 no teste físico.");
