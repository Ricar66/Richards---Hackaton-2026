import { test } from "node:test";
import assert from "node:assert/strict";
import { eventInScope, mergeSnapshot, readingInInterval, scopeOf, trimRecent, viewPolicy, withReading, type LiveScope } from "../src/components/bi/live-scope";
import { stampLiveEvent, type LiveEvent, type LiveEventInput, type ReadingCreatedEvent } from "../src/modules/realtime/domain/live-event";
import type { LiveDTO } from "../src/modules/analytics/domain/dashboard";

const at = new Date("2026-11-07T15:00:00Z");
const ev = (input: LiveEventInput) => stampLiveEvent(input, at);
const reading = (over: Partial<ReadingCreatedEvent> = {}) => ({
  ...ev({
    type: "reading.created", orgId: "org", deviceId: "dev-1", deviceCode: "RICHARDS-FLOW-001", siteId: "site-a",
    bootId: "boot", sequence: 1, capturedAt: "2026-11-07T14:59:58Z", flowLpm: 2.5, deltaLiters: 0.08,
    source: "SIMULATED", channel: "http",
    rule: { minFlowLpm: 1.5, continuousSeconds: 30, observedSeconds: 4, suspicious: false },
    timing: { receivedAt: "2026-11-07T14:59:58Z", emittedAt: "2026-11-07T14:59:58Z" },
  }),
  ...over,
}) as ReadingCreatedEvent;
const scope = (over: Partial<LiveScope> = {}): LiveScope => ({
  range: "7d", from: "2026-10-31T15:00:00.000Z", to: "2026-11-07T15:00:00.000Z",
  siteId: null, deviceId: null, source: "ALL", deviceSite: { "dev-1": "site-a", "dev-2": "site-b" }, ...over,
});

test("leitura entra no recorte por origem, sensor e unidade, como no get-dashboard", () => {
  assert.equal(eventInScope(reading(), scope()), true);
  assert.equal(eventInScope(reading(), scope({ source: "DEVICE" })), false, "filtro Sensor ignora leitura simulada");
  assert.equal(eventInScope(reading({ source: "DEVICE" }), scope({ source: "DEVICE" })), true);
  assert.equal(eventInScope(reading(), scope({ deviceId: "dev-2" })), false);
  assert.equal(eventInScope(reading(), scope({ siteId: "site-b" })), false);
  assert.equal(eventInScope(reading(), scope({ siteId: "site-a", deviceId: "dev-1" })), true);
});

test("período: fixo desliza (sem teto), personalizado respeita o fim; leitura antes do início fica fora", () => {
  const late = reading({ capturedAt: "2026-11-07T18:00:00Z" });
  assert.equal(eventInScope(late, scope()), true, "24h/7d/30d: a nova busca recalcula o fim em 'agora'");
  assert.equal(eventInScope(late, scope({ range: "custom" })), false, "personalizado já terminou");
  assert.equal(eventInScope(reading({ capturedAt: "2026-10-30T00:00:00Z" }), scope()), false, "backlog anterior ao início");
});

test("ocorrência: vale em qualquer período; sensor, unidade e origem filtram; sem unidade conhecida, busca", () => {
  const opened = ev({ type: "occurrence.opened", orgId: "org", id: "oc", deviceId: "dev-1", deviceCode: "X", kind: "UNUSUAL_FLOW", severity: "HIGH", title: "t", source: "SIMULATED", openedAt: "2020-01-01T00:00:00Z" });
  assert.equal(eventInScope(opened, scope({ range: "custom" })), true, "ativa conta agora, mesmo fora do período");
  assert.equal(eventInScope(opened, scope({ source: "DEVICE" })), false);
  assert.equal(eventInScope(opened, scope({ siteId: "site-b" })), false);
  assert.equal(eventInScope(opened, scope({ deviceId: "dev-2" })), false);
  const unknown = { ...opened, deviceId: "dev-9" } as LiveEvent;
  assert.equal(eventInScope(unknown, scope({ siteId: "site-b" })), true, "dispositivo novo: unidade desconhecida, refaz a busca");
  const manual = { ...opened, deviceId: null } as LiveEvent;
  assert.equal(eventInScope(manual, scope({ deviceId: "dev-1" })), false, "filtro por sensor exclui ocorrência sem sensor");
  const status = ev({ type: "occurrence.status", orgId: "org", id: "oc", deviceId: "dev-1", kind: "UNUSUAL_FLOW", title: "t", from: "OPEN", status: "RESOLVED", actor: "operador", source: "SIMULATED" });
  assert.equal(eventInScope(status, scope({ source: "DEVICE" })), true, "mudança de estado sempre refaz a busca (barato e nunca deixa número velho)");
  assert.equal(eventInScope(status, scope({ deviceId: "dev-2" })), false);
});

test("doação é da organização (só a origem filtra); sensor.live e mensagem recusada nunca refazem KPI; resync sempre", () => {
  const created = ev({ type: "donation.created", orgId: "org", id: "d", kg: 6.2, status: "PENDING_REVIEW", source: "SIMULATED", origin: "scale", description: "Lote" });
  assert.equal(eventInScope(created, scope({ deviceId: "dev-2" })), true);
  assert.equal(eventInScope(created, scope({ source: "DEVICE" })), false);
  assert.equal(eventInScope(ev({ type: "donation.status", orgId: "org", id: "d", kg: 6.2, from: "RESERVED", status: "DELIVERED", source: "SIMULATED" }), scope({ source: "DEVICE" })), true);
  const sensor = ev({ type: "sensor.live", orgId: "org", persisted: false, deviceId: "dev-1", deviceCode: "X", channel: "mqtt", at: "2026-11-07T15:00:00Z", temperature: { c: 29, source: "DEVICE", rule: { limitC: 28, continuousSeconds: 30, observedSeconds: 2, suspicious: false } }, timing: { receivedAt: "2026-11-07T15:00:00Z", emittedAt: "2026-11-07T15:00:00Z" } });
  assert.equal(eventInScope(sensor, scope()), false);
  assert.equal(eventInScope(ev({ type: "message.rejected", orgId: "org", channel: "mqtt", reason: "JSON inválido" }), scope()), false);
  assert.equal(eventInScope(ev({ type: "resync", orgId: "org", reason: "x" }), scope({ deviceId: "dev-2", source: "DEVICE" })), true);
});

test("scopeOf monta o mapa sensor → unidade a partir do DTO", () => {
  const s = scopeOf({
    filter: { range: "24h", from: "a", to: "b", bucket: "15m", bucketSeconds: 900, siteId: "site-a", deviceId: null, source: "ALL", query: "range=24h" },
    options: { sites: [], devices: [{ id: "dev-1", code: "X", label: "L", siteId: "site-a" }] },
    devices: [],
  });
  assert.deepEqual(s.deviceSite, { "dev-1": "site-a" });
  assert.equal(s.siteId, "site-a"); assert.equal(s.range, "24h");
});

test("gaveta de intervalo: recorte da URL e intervalo [início, fim)", () => {
  const start = Date.parse("2026-11-07T14:45:00Z"), end = Date.parse("2026-11-07T15:00:00Z");
  assert.equal(readingInInterval(reading(), "range=24h", start, end), true);
  assert.equal(readingInInterval(reading(), "range=24h&source=DEVICE", start, end), false);
  assert.equal(readingInInterval(reading(), "deviceId=dev-2", start, end), false);
  assert.equal(readingInInterval(reading({ capturedAt: "2026-11-07T15:00:00Z" }), "", start, end), false, "fim é exclusivo");
});

const snapshot = (over: Partial<LiveDTO> = {}): LiveDTO => ({
  generatedAt: "2026-11-07T15:00:00.000Z",
  lastReading: { at: "2026-11-07T14:59:50.000Z", flowLpm: 1.2, deltaLiters: 0.04, source: "SIMULATED", deviceCode: "RICHARDS-FLOW-001" },
  recent: [{ t: Date.parse("2026-11-07T14:59:40Z"), flowLpm: 1.1 }, { t: Date.parse("2026-11-07T14:59:50Z"), flowLpm: 1.2 }],
  active: [], activeCount: 3, ...over,
});

test("leitura do stream vira o último valor gravado e entra na série; contagens não mudam", () => {
  const live = withReading(snapshot(), reading());
  assert.deepEqual(live.lastReading, { at: "2026-11-07T14:59:58Z", flowLpm: 2.5, deltaLiters: 0.08, source: "SIMULATED", deviceCode: "RICHARDS-FLOW-001" });
  assert.equal(live.recent.length, 3); assert.equal(live.recent[2].flowLpm, 2.5);
  assert.equal(live.activeCount, 3, "contagem só vem do servidor");
  const older = withReading(snapshot(), reading({ capturedAt: "2026-11-07T14:59:45Z", flowLpm: 9 }));
  assert.equal(older.lastReading?.flowLpm, 1.2, "leitura atrasada (fila do firmware) não passa por cima da mais nova");
  assert.deepEqual(older.recent.map(p => p.flowLpm), [1.1, 9, 1.2], "mas entra na série na ordem do horário");
});

test("série curta respeita a janela de 30 min e o teto de 120 pontos do get-live", () => {
  const now = Date.parse("2026-11-07T15:00:00Z");
  const many = Array.from({ length: 130 }, (_, i) => ({ t: now - (130 - i) * 1000, flowLpm: i }));
  assert.equal(trimRecent(many, now).length, 120);
  assert.equal(trimRecent([{ t: now - 31 * 60_000, flowLpm: 1 }, { t: now, flowLpm: 2 }], now).length, 1);
});

test("retrato do servidor manda nas contagens, mas não apaga leitura do stream que ele ainda não tinha", () => {
  const known = { last: { at: "2026-11-07T14:59:59.000Z", flowLpm: 2.5, deltaLiters: 0.08, source: "SIMULATED" as const, deviceCode: "X" }, points: [{ t: Date.parse("2026-11-07T14:59:59Z"), flowLpm: 2.5 }] };
  const merged = mergeSnapshot(snapshot({ activeCount: 4 }), known);
  assert.equal(merged.activeCount, 4);
  assert.equal(merged.lastReading?.flowLpm, 2.5);
  assert.deepEqual(merged.recent.map(p => p.flowLpm), [1.1, 1.2, 2.5]);
  const newer = mergeSnapshot(snapshot({ lastReading: { at: "2026-11-07T15:00:00.000Z", flowLpm: 3, deltaLiters: 0.1, source: "DEVICE", deviceCode: "X" } }), known);
  assert.equal(newer.lastReading?.flowLpm, 3, "servidor mais novo vence");
  assert.equal(mergeSnapshot(snapshot({ lastReading: null, recent: [] }), { last: null, points: [] }).lastReading, null, "sem leitura continua sem leitura (nunca zero)");
});

test("política por tela: Relatórios não refaz sozinho, Ocorrências e Doações ignoram leituras", () => {
  assert.equal(viewPolicy("/relatorios").manual, true);
  assert.equal(viewPolicy("/ocorrencias").readings, false);
  assert.equal(viewPolicy("/doacoes").readings, false);
  assert.equal(viewPolicy("/dispositivos").gapMs, 5000);
  assert.deepEqual(viewPolicy("/"), { manual: false, readings: true, gapMs: 1500 });
  assert.equal(viewPolicy("/monitoramento").readings, true);
});
