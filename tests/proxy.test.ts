import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

const BASE = "http://localhost:3000";
const basic = (u: string, p: string) => "Basic " + Buffer.from(`${u}:${p}`).toString("base64");
const req = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(BASE + path, { method: init.method ?? "GET", headers: { host: "localhost:3000", ...init.headers } });
const passed = (r: Response) => r.headers.get("x-middleware-next") === "1";
const forwardedActor = (r: Response) => r.headers.get("x-middleware-request-x-richards-actor");
beforeEach(() => { process.env.AUTH_MODE = "basic"; process.env.RICHARDS_OPERATOR_USER = "op"; process.env.RICHARDS_OPERATOR_PASSWORD = "s3nha"; });

test("sem credencial ou com senha errada → 401", () => {
  assert.equal(proxy(req("/")).status, 401);
  assert.equal(proxy(req("/", { headers: { authorization: basic("op", "errada") } })).status, 401);
});

test("credencial correta passa e repassa o actor do operador", () => {
  const r = proxy(req("/operacao", { headers: { authorization: basic("op", "s3nha") } }));
  assert.ok(passed(r));
  assert.equal(forwardedActor(r), "operador:op");
});

test("fail-closed: AUTH_MODE ausente ou com erro de digitação continua exigindo senha", () => {
  delete process.env.AUTH_MODE;
  assert.equal(proxy(req("/")).status, 401);
  process.env.AUTH_MODE = "basik";
  assert.equal(proxy(req("/")).status, 401);
  process.env.AUTH_MODE = "none";
  assert.ok(passed(proxy(req("/"))));
});

test("cliente não consegue forjar x-richards-actor", () => {
  const r = proxy(req("/operacao", { headers: { authorization: basic("op", "s3nha"), "x-richards-actor": "admin-falso" } }));
  assert.equal(forwardedActor(r), "operador:op");
  const t = proxy(req("/api/iot/telemetry", { method: "POST", headers: { "x-richards-actor": "admin-falso", "content-type": "application/json" } }));
  assert.ok(passed(t));
  assert.equal(forwardedActor(t), null);
  assert.ok(!(t.headers.get("x-middleware-override-headers") ?? "").includes("x-richards-actor"));
});

test("CSRF: escrita vinda de outro site é bloqueada mesmo com a Basic Auth do navegador", () => {
  const auth = { authorization: basic("op", "s3nha"), "content-type": "application/json" };
  assert.equal(proxy(req("/api/donations", { method: "POST", headers: { ...auth, origin: "https://site-malicioso.example" } })).status, 403);
  assert.equal(proxy(req("/api/donations", { method: "POST", headers: { ...auth, "sec-fetch-site": "cross-site" } })).status, 403);
  assert.equal(proxy(req("/api/donations", { method: "POST", headers: { ...auth, "content-type": "text/plain" } })).status, 415);
  assert.ok(passed(proxy(req("/api/donations", { method: "POST", headers: { ...auth, origin: BASE, "sec-fetch-site": "same-origin" } }))));
});

test("telemetria e health não exigem senha de operador (telemetria exige chave do dispositivo na rota)", () => {
  assert.ok(passed(proxy(req("/api/health"))));
  assert.ok(passed(proxy(req("/api/iot/telemetry", { method: "POST", headers: { "content-type": "application/json" } }))));
});

test("stream ao vivo (/api/live/stream) exige a senha do operador como o resto do BI; GET não sofre 415", () => {
  assert.equal(proxy(req("/api/live/stream")).status, 401);
  assert.equal(proxy(req("/api/live/stream", { headers: { authorization: basic("op", "errada") } })).status, 401);
  const r = proxy(req("/api/live/stream", { headers: { authorization: basic("op", "s3nha"), accept: "text/event-stream" } }));
  assert.ok(passed(r), "GET do EventSource não tem Content-Type JSON e não pode ser barrado pela regra de escrita");
  assert.equal(forwardedActor(r), "operador:op");
});


test("plateia pública é whitelist exata de leitura, sem liberar o painel e a API do operador", () => {
  for (const path of ["/plateia", "/api/plateia/stream", "/qr-plateia.svg"]) {
    const r = proxy(req(path));
    assert.ok(passed(r));
    assert.equal(forwardedActor(r), null);
  }
  for (const path of ["/convite", "/api/live/stream", "/api/plateia/admin", "/plateia/admin"])
    assert.equal(proxy(req(path)).status, 401);
  assert.equal(proxy(req("/api/plateia/stream", { method: "POST", headers: { "content-type": "application/json" } })).status, 401);
  assert.equal(proxy(req("/api/plateia/stream", { method: "HEAD" })).status, 401, "não abrir HEAD no SSE infinito");
  assert.ok(passed(proxy(req("/qr-plateia.svg", { method: "HEAD" }))));
});
