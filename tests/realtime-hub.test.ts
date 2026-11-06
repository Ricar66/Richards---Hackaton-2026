// Sem banco: porta fechada. Vale mesmo atribuída depois dos imports, porque o hub só lê DATABASE_URL ao conectar.
process.env.DATABASE_URL = "postgresql://ninguem:nada@127.0.0.1:1/richards_inexistente";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "../src/app/api/live/stream/route";
import { LiveEventHub, getLiveHub } from "../src/modules/realtime/infrastructure/event-hub";

const silence = console.warn;
console.warn = () => {}; // o hub avisa cada tentativa falha; aqui é esperado
after(async () => { await getLiveHub().stop(); console.warn = silence; });

const open = () => {
  const ac = new AbortController();
  return { ac, res: GET(new NextRequest("http://localhost:3000/api/live/stream", { signal: ac.signal })) };
};
/** Lê o corpo SSE até `done(texto)` ou estourar o tempo. */
async function readUntil(res: Response, done: (text: string) => boolean, ms = 6_000) {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let text = "";
  const deadline = Date.now() + ms;
  while (!done(text)) {
    const left = deadline - Date.now();
    if (left <= 0) break;
    const chunk = await Promise.race([reader.read(), new Promise<null>(r => setTimeout(() => r(null), left))]);
    if (!chunk || chunk.done) break;
    text += dec.decode(chunk.value, { stream: true });
  }
  reader.releaseLock();
  return text;
}

test("hub não conecta ao ser criado; sem banco fica listening=false, tenta de novo e não lança", async () => {
  let url = 0;
  const hub = new LiveEventHub(() => { url++; return process.env.DATABASE_URL; });
  await new Promise(r => setTimeout(r, 50));
  assert.equal(url, 0, "criar o hub não abre conexão");
  const states: boolean[] = [];
  const off = hub.subscribe({ event: () => {}, listening: on => states.push(on) });
  for (let i = 0; i < 100 && url < 2; i++) await new Promise(r => setTimeout(r, 100));
  assert.equal(hub.listening, false);
  assert.ok(url >= 2, `reconecta com espera crescente (tentativas: ${url})`);
  assert.deepEqual(states, [], "nunca escutou, então não houve mudança de estado");
  off();
  assert.equal(hub.size, 0, "cancelar a assinatura não deixa assinante pendurado");
  await hub.stop();
  const before = url;
  await new Promise(r => setTimeout(r, 1_200));
  assert.equal(url, before, "parado não tenta mais");
});

test("rota SSE: cabeçalhos sem compressão, retry imediato e hello com listening=false quando o banco não escuta", async () => {
  const { ac, res } = open();
  const r = await res;
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") ?? "", /^text\/event-stream/);
  assert.equal(r.headers.get("cache-control"), "no-cache, no-transform");
  assert.equal(r.headers.get("x-accel-buffering"), "no");
  const text = await readUntil(r, t => t.includes("event: hello"));
  assert.ok(text.startsWith("retry: 3000\n\n"), "primeiro pedaço sai na hora (libera os cabeçalhos)");
  const hello = JSON.parse(/event: hello\ndata: (.*)\n\n/.exec(text)![1]);
  assert.equal(hello.listening, false, "a tela avisa que eventos podem se perder");
  assert.ok(!Number.isNaN(Date.parse(hello.serverTime)));
  ac.abort();
  await new Promise(r => setTimeout(r, 20));
  assert.equal(getLiveHub().size, 0, "abortar a requisição libera a assinatura");
});

test("rota SSE: acima de 40 streams responde 503 JSON e libera a vaga quando um fecha", async () => {
  const streams = Array.from({ length: 40 }, open);
  const responses = await Promise.all(streams.map(s => s.res));
  assert.ok(responses.every(r => r.status === 200));
  const extra = await open().res;
  assert.equal(extra.status, 503);
  assert.equal((await extra.json()).code, "TOO_MANY_STREAMS");
  streams[0].ac.abort();
  const again = open();
  assert.equal((await again.res).status, 200, "a vaga volta quando o stream fecha");
  for (const s of [...streams, again]) s.ac.abort();
  await new Promise(r => setTimeout(r, 20));
  assert.equal(getLiveHub().size, 0);
  // cancel() do corpo (cliente sumiu sem abort) também libera
  const c = open();
  await (await c.res).body!.cancel();
  assert.equal(getLiveHub().size, 0);
  c.ac.abort();
});
