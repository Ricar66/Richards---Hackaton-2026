import { DEVICE_CODE, DEVICE_KEY, db, newBootId, reading, resetAndSeed } from "./helpers";
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { NextRequest } from "next/server";
import { MqttIngestion, type MqttProcessed } from "../../src/iot/mqtt-ingestion";
import { loadMqttConfig } from "../../src/iot/mqtt-payload";
import { DonationService } from "../../src/modules/donations/application/donation-service";
import { IngestTelemetry } from "../../src/modules/monitoring/application/ingest-telemetry";
import { OccurrenceService } from "../../src/modules/monitoring/application/occurrence-service";
import { LIVE_CHANNEL, parseLiveEvent, type LiveEvent, type LiveEventInput } from "../../src/modules/realtime/domain/live-event";
import { LiveEventHub, getLiveHub } from "../../src/modules/realtime/infrastructure/event-hub";
import { notifyLive } from "../../src/modules/realtime/infrastructure/notify-event";
import { GET } from "../../src/app/api/live/stream/route";
import { DEMO_DEVICE_ID, DEMO_ORG_ID, DEMO_RECIPIENT_ID } from "../../src/lib/constants";

// Ouvinte de teste: um Client próprio (como o hub), fora do pool do Prisma.
const listener = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
let inbox: LiveEvent[] = [];
let barriers = 0;
before(async () => {
  await listener.connect();
  listener.on("notification", m => { const e = m.channel === LIVE_CHANNEL && m.payload ? parseLiveEvent(m.payload) : null; if (e) inbox.push(e); });
  await listener.query(`LISTEN "${LIVE_CHANNEL}"`);
});
beforeEach(async () => { await resetAndSeed(); await collect(); });
after(async () => { await listener.end(); await getLiveHub().stop(); await db().$disconnect(); });

/**
 * Barreira: a fila do NOTIFY segue a ordem dos COMMITs. Quando o aviso de barreira chega, tudo o que foi
 * confirmado antes dele já chegou; o que não chegou (rollback, duplicata) não vem mais.
 */
async function collect(): Promise<LiveEvent[]> {
  const reason = `barreira-${++barriers}`;
  await notifyLive(db(), { type: "resync", orgId: "barreira", reason });
  const deadline = Date.now() + 5_000;
  while (!inbox.some(e => e.type === "resync" && e.reason === reason)) {
    if (Date.now() > deadline) throw new Error("barreira não chegou: o LISTEN de teste não está recebendo");
    await new Promise(r => setTimeout(r, 10));
  }
  const out = inbox.filter(e => e.orgId !== "barreira");
  inbox = [];
  return out;
}
const only = <T extends LiveEvent["type"]>(events: LiveEvent[], type: T) => events.filter((e): e is Extract<LiveEvent, { type: T }> => e.type === type);
const rejected = (reason: string): LiveEventInput => ({ type: "message.rejected", orgId: DEMO_ORG_ID, channel: "mqtt", reason });

test("NOTIFY dentro da transação: COMMIT entrega, ROLLBACK não", async () => {
  await db().$transaction(async tx => { await notifyLive(tx, rejected("confirmado")); });
  await assert.rejects(db().$transaction(async tx => { await notifyLive(tx, rejected("desfeito")); throw new Error("desfaz"); }), /desfaz/);
  const events = await collect();
  assert.deepEqual(only(events, "message.rejected").map(e => e.reason), ["confirmado"]);
  assert.equal(events[0].v, 1);
});

test("leitura HTTP nova emite reading.created com a regra decidida e o carimbo de tempo; duplicata não emite", async () => {
  const ingest = new IngestTelemetry();
  const boot = newBootId();
  const cmd = reading(boot, 0, 0.5);
  const result = await ingest.execute(cmd, DEVICE_KEY);
  const [ev, ...rest] = await collect();
  assert.equal(rest.length, 0);
  assert.equal(ev.type, "reading.created");
  if (ev.type !== "reading.created") return;
  assert.deepEqual(ev.rule, { minFlowLpm: 1.5, continuousSeconds: 30, observedSeconds: 0, suspicious: false });
  assert.deepEqual(ev.rule, result.rule, "o evento leva o mesmo estado que a ingestão decidiu");
  assert.deepEqual([ev.orgId, ev.deviceId, ev.deviceCode, ev.bootId, ev.sequence, ev.source, ev.channel, ev.flowLpm], [DEMO_ORG_ID, DEMO_DEVICE_ID, DEVICE_CODE, boot, 0, "DEVICE", "http", 0.5]);
  assert.equal(ev.occurrenceId, undefined);
  assert.equal(ev.timing.deviceAt, new Date(cmd.capturedAt).toISOString(), "HTTP traz a hora do dispositivo");
  assert.equal(ev.timing.emittedAt, ev.emittedAt);
  assert.ok(Date.parse(ev.timing.receivedAt) <= Date.parse(ev.timing.emittedAt), "recebido antes de emitido, no mesmo relógio");
  const again = await ingest.execute(cmd, DEVICE_KEY);
  assert.equal(again.duplicate, true);
  assert.deepEqual(await collect(), [], "retentativa não vira evento novo");
});

test("fluxo persistente: occurrence.opened UMA vez, antes da leitura que a abriu, e as leituras seguintes apontam para ela", async () => {
  const ingest = new IngestTelemetry();
  const boot = newBootId();
  for (const [seq, ago] of [[0, 45], [1, 30], [2, 15], [3, 0]]) await ingest.execute(reading(boot, seq, 2.0, ago), DEVICE_KEY);
  const events = await collect();
  const opened = only(events, "occurrence.opened");
  assert.equal(opened.length, 1, "regra 5: uma ocorrência ativa, um aviso");
  const [occ] = await db().occurrence.findMany({ where: { deviceId: DEMO_DEVICE_ID } });
  assert.deepEqual([opened[0].id, opened[0].kind, opened[0].severity, opened[0].source, opened[0].deviceCode, opened[0].channel], [occ.id, "UNUSUAL_FLOW", "HIGH", "DEVICE", DEVICE_CODE, "http"]);
  assert.equal(opened[0].openedAt, occ.openedAt.toISOString());
  const readings = only(events, "reading.created");
  assert.deepEqual(readings.map(r => r.sequence), [0, 1, 2, 3]);
  assert.deepEqual(readings.map(r => r.rule.suspicious), [false, false, true, true]);
  assert.deepEqual(readings.map(r => r.occurrenceId ?? null), [null, null, occ.id, occ.id]);
  assert.ok(events.indexOf(opened[0]) < events.indexOf(readings[2]), "a ocorrência é confirmada antes do aviso da leitura que a abriu");
});

test("transição de ocorrência emite occurrence.status no COMMIT; transição recusada não emite", async () => {
  const ingest = new IngestTelemetry();
  const boot = newBootId();
  for (const [seq, ago] of [[0, 45], [1, 30], [2, 15]]) await ingest.execute(reading(boot, seq, 2.0, ago), DEVICE_KEY);
  const [occ] = await db().occurrence.findMany({ where: { deviceId: DEMO_DEVICE_ID } });
  await collect();
  const service = new OccurrenceService();
  await service.transition(occ.id, "ACKNOWLEDGED", "", "operador:ana");
  await assert.rejects(service.transition(occ.id, "RESOLVED", "", "operador:ana"), /RESOLUTION_NOTE_REQUIRED/);
  await service.transition(occ.id, "RESOLVED", "Torneira do lavatório fechada", "operador:bia");
  const status = only(await collect(), "occurrence.status");
  // A origem do registro viaja em cada mudança de estado (regra 1: o telão carimba SIMULATED também aqui).
  assert.deepEqual(status.map(s => [s.from, s.status, s.actor, s.kind, s.deviceId, s.source]), [["OPEN", "ACKNOWLEDGED", "operador", "UNUSUAL_FLOW", DEMO_DEVICE_ID, "DEVICE"], ["ACKNOWLEDGED", "RESOLVED", "operador", "UNUSUAL_FLOW", DEMO_DEVICE_ID, "DEVICE"]]);
  assert.ok(!/operador:(ana|bia)/.test(JSON.stringify(status)), "o usuário do operador (metade da credencial Basic) não viaja no stream");
  const trail = await db().occurrenceEvent.findMany({ where: { occurrenceId: occ.id, action: { in: ["ACKNOWLEDGED", "RESOLVED"] } }, orderBy: { at: "asc" } });
  assert.deepEqual(trail.map(t => t.actor), ["operador:ana", "operador:bia"], "o banco guarda o autor completo");
  assert.ok(!JSON.stringify(status).includes("Torneira"), "a nota de resolução não viaja");
});

test("doação: created (manual) e cada status; entrega leva só a instituição, nunca quem recebeu nem quem verificou", async () => {
  const service = new DonationService();
  const { id } = await service.create({ description: "Hortaliças de teste", weightKg: 4.25 }, "operador:ana");
  await service.transition(id, { status: "AVAILABLE", verifiedBy: "Responsável Sanitário" }, "operador:ana");
  await service.transition(id, { status: "RESERVED", recipientId: DEMO_RECIPIENT_ID }, "operador:ana");
  await service.transition(id, { status: "DELIVERED", receivedBy: "Carla Pessoa Física" }, "operador:bia");
  await assert.rejects(service.transition(id, { status: "CANCELLED", reason: "teste de recusa" }, "operador:bia"));
  const events = await collect();
  const [created] = only(events, "donation.created");
  assert.deepEqual([created.id, created.kg, created.status, created.source, created.origin, created.deviceCode], [id, 4.25, "PENDING_REVIEW", "MANUAL", "manual", undefined]);
  const status = only(events, "donation.status");
  assert.deepEqual(status.map(s => [s.from, s.status, s.recipientName ?? null, s.kg, s.source]), [
    ["PENDING_REVIEW", "AVAILABLE", null, 4.25, "MANUAL"], ["AVAILABLE", "RESERVED", "Receptor de teste", 4.25, "MANUAL"], ["RESERVED", "DELIVERED", "Receptor de teste", 4.25, "MANUAL"],
  ]);
  const wire = JSON.stringify(events);
  assert.ok(!wire.includes("Carla") && !wire.includes("receivedBy"), "nome de quem recebeu não vai para o telão");
  assert.ok(!wire.includes("Responsável Sanitário"), "nome de quem verificou também não");
  assert.equal((await db().donationBatch.findUniqueOrThrow({ where: { id } })).receivedBy, "Carla Pessoa Física", "o nome continua gravado no banco");
});

test("lote e ocorrência SIMULATED: occurrence.status e donation.status saem com source SIMULATED (selo no telão)", async () => {
  // Como o lote "Hortaliças" do seed (SIMULATED, RESERVED) entregue no roteiro, e uma ocorrência aberta pelo simulador.
  const lot = await db().donationBatch.create({ data: { organizationId: DEMO_ORG_ID, description: "Hortaliças (seed)", weightKg: 6, status: "RESERVED", source: "SIMULATED", recipientId: DEMO_RECIPIENT_ID, safetyVerifiedAt: new Date(), safetyVerifiedBy: "Verificação do seed" } });
  const occ = await db().occurrence.create({ data: { organizationId: DEMO_ORG_ID, siteId: (await db().device.findUniqueOrThrow({ where: { id: DEMO_DEVICE_ID } })).siteId, deviceId: DEMO_DEVICE_ID, kind: "UNUSUAL_FLOW", severity: "HIGH", status: "OPEN", source: "SIMULATED", title: "Alerta de demonstração", description: "teste" } });
  await new DonationService().transition(lot.id, { status: "DELIVERED", receivedBy: "Pessoa de teste" }, "operador:Fulano Silva");
  await new OccurrenceService().transition(occ.id, "ACKNOWLEDGED", "", "operador:Fulano Silva");
  const events = await collect();
  assert.deepEqual(only(events, "donation.status").map(e => [e.id, e.status, e.source]), [[lot.id, "DELIVERED", "SIMULATED"]]);
  const [status] = only(events, "occurrence.status");
  assert.deepEqual([status.id, status.status, status.source, status.actor], [occ.id, "ACKNOWLEDGED", "SIMULATED", "operador"]);
  assert.ok(!/Fulano|Silva/.test(JSON.stringify(events)), "usuário com espaço também não viaja (máscara por prefixo)");
});

/** Ponte com relógio controlado (como em mqtt.test.ts): cada mensagem anda 2 s. */
function bridge(env: Record<string, string> = {}) {
  let clock = Date.now() - 180_000;
  const ingestion = new MqttIngestion(loadMqttConfig({ MQTT_DEVICE_ALIASES: `hortifruti_01=${DEVICE_CODE}`, ...env }), () => new Date((clock += 2000)));
  const send = async (p: Record<string, unknown>) => {
    const r = await ingestion.handle({ dispositivo_id: "hortifruti_01", ...p });
    assert.equal(r.status, "processed", r.status === "rejected" ? r.reason : "");
    return r as MqttProcessed;
  };
  return { ingestion, send };
}

test("MQTT: temperatura e peso viram sensor.live efêmero (persisted:false) com a regra decidida; vazão vira reading.created sem hora do dispositivo", async () => {
  const { send } = bridge();
  await send({ TEMP: 29.5, UMIDADE: 70, VAZAO: 0.2 });
  await send({ TEMP: 29.5, UMIDADE: 70 });
  const events = await collect();
  const live = only(events, "sensor.live");
  assert.equal(live.length, 2);
  assert.deepEqual(live.map(e => [e.persisted, e.channel, e.deviceCode, e.temperature?.c, e.temperature?.humidityPct, e.temperature?.source]), [[false, "mqtt", DEVICE_CODE, 29.5, 70, "DEVICE"], [false, "mqtt", DEVICE_CODE, 29.5, 70, "DEVICE"]]);
  assert.deepEqual(live.map(e => e.temperature?.rule), [
    { limitC: 28, continuousSeconds: 30, observedSeconds: 0, suspicious: false }, { limitC: 28, continuousSeconds: 30, observedSeconds: 2, suspicious: false },
  ], "progresso calculado leitura a leitura, nunca interpolado");
  assert.equal(live[0].scale, undefined);
  assert.equal(live[0].timing.deviceAt, undefined, "MQTT não manda hora do dispositivo");
  const [flow] = only(events, "reading.created");
  assert.deepEqual([flow.channel, flow.source, flow.timing.deviceAt], ["mqtt", "SIMULATED", undefined], "potenciômetro carimbado SIMULATED");
  assert.equal(await db().telemetryReading.count(), 1, "sensor.live não grava série");
});

test("MQTT: balança mostra o progresso do detector e o lote PENDING_REVIEW vem antes do sensor.live que o pediu", async () => {
  const { send } = bridge({ MQTT_SIMULATED_SENSORS: "PESO" });
  for (const kg of [0, 5.4, 5.4, 5.4, 5.4, 5.4]) await send({ PESO: kg });
  const events = await collect();
  const live = only(events, "sensor.live");
  assert.deepEqual(live.map(e => e.scale?.progress.phase), ["idle", "stabilizing", "stabilizing", "stabilizing", "triggered", "disarmed"]);
  assert.deepEqual(live.map(e => e.scale?.progress.stableSeconds), [0, 0, 2, 4, 6, 8]);
  assert.ok(live.every(e => e.scale?.source === "SIMULATED" && e.scale.progress.minKg === 5 && e.scale.progress.requiredSeconds === 6));
  const [created] = only(events, "donation.created");
  assert.deepEqual([created.origin, created.source, created.deviceCode, created.status, created.kg], ["scale", "SIMULATED", DEVICE_CODE, "PENDING_REVIEW", 5.4]);
  assert.ok(events.indexOf(created) < events.indexOf(live[4]));
});

test("MQTT: balança com lote pendente sai em fase 'blocked' com o id do pendente; nada de 'triggered' nem donation.created", async () => {
  const pending = await new DonationService().createFromScale({ organizationId: DEMO_ORG_ID, deviceId: DEMO_DEVICE_ID, deviceCode: DEVICE_CODE, weightKg: 5.3, source: "DEVICE", evidence: { channel: "mqtt" } }, `dispositivo:${DEVICE_CODE}`);
  assert.equal(pending.created, true);
  await collect();
  const { send } = bridge();
  const outcomes: MqttProcessed[] = [];
  for (const kg of [0, 6.1, 6.1, 6.1, 6.1, 6.1]) outcomes.push(await send({ PESO: kg }));
  assert.deepEqual(outcomes.filter(o => o.donation).map(o => [o.donation!.created, o.donation!.id]), [[false, pending.id]], "a ponte recusou criar (regra: um lote pendente por balança)");
  const events = await collect();
  assert.equal(only(events, "donation.created").length, 0, "nada novo criado");
  const live = only(events, "sensor.live");
  assert.deepEqual(live.map(e => e.scale?.progress.phase), ["idle", "stabilizing", "stabilizing", "stabilizing", "blocked", "blocked"], "o telão não diz que esta pesagem virou lote");
  assert.deepEqual(live.slice(4).map(e => e.scale?.progress.pendingLotId), [pending.id, pending.id]);
  assert.equal(await db().donationBatch.count(), 1);
});

test("MQTT: mensagem recusada emite message.rejected curto, no máximo um por motivo a cada 2 s, sem o conteúdo", async () => {
  const { ingestion } = bridge();
  await ingestion.handle({ dispositivo_id: "balcao_99", VAZAO: 3 });
  await ingestion.handle({ dispositivo_id: "balcao_98", VAZAO: 3 });
  await ingestion.handle({ dispositivo_id: "hortifruti_01", VAZAO: "muito" });
  await ingestion.reportRejected("JSON inválido");
  const reasons = only(await collect(), "message.rejected");
  assert.deepEqual(reasons.map(e => [e.reason, e.channel]), [["dispositivo não cadastrado", "mqtt"], ["payload inválido", "mqtt"], ["JSON inválido", "mqtt"]]);
  assert.ok(!JSON.stringify(reasons).includes("balcao_99"));
});

test("hub: escuta o banco, entrega ao assinante, reconecta depois de pg_terminate_backend e avisa listening", async () => {
  const hub = new LiveEventHub();
  const got: LiveEvent[] = [];
  const states: boolean[] = [];
  const off = hub.subscribe({ event: e => got.push(e), listening: on => states.push(on) });
  const until = async (ok: () => boolean, what: string, ms = 8_000) => {
    const deadline = Date.now() + ms;
    while (!ok()) { if (Date.now() > deadline) throw new Error(`tempo esgotado: ${what}`); await new Promise(r => setTimeout(r, 20)); }
  };
  try {
    await until(() => hub.listening, "primeiro LISTEN");
    await notifyLive(db(), rejected("antes da queda"));
    await until(() => got.length === 1, "evento antes da queda");
    await db().$executeRaw`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'richards-live-hub' AND datname = current_database()`;
    await until(() => states.includes(false), "queda percebida");
    await until(() => hub.listening, "reconexão");
    await notifyLive(db(), rejected("depois da volta"));
    await until(() => got.length === 2, "evento depois da volta");
    assert.deepEqual(got.map(e => e.type === "message.rejected" && e.reason), ["antes da queda", "depois da volta"]);
    assert.deepEqual(states, [true, false, true]);
  } finally { off(); await hub.stop(); }
});

test("rota SSE com banco: hello listening=true, evento da organização da demo como `event: live`, outra organização filtrada", async () => {
  const hub = getLiveHub();
  const warm = hub.subscribe({ event: () => {} });
  const deadline = Date.now() + 8_000;
  while (!hub.listening && Date.now() < deadline) await new Promise(r => setTimeout(r, 20));
  warm();
  const ac = new AbortController();
  const res = await GET(new NextRequest("http://localhost:3000/api/live/stream", { signal: ac.signal }));
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let text = "";
  const readUntil = async (ok: () => boolean) => {
    const end = Date.now() + 5_000;
    while (!ok() && Date.now() < end) {
      const chunk = await Promise.race([reader.read(), new Promise<null>(r => setTimeout(() => r(null), end - Date.now()))]);
      if (!chunk || chunk.done) break;
      text += dec.decode(chunk.value, { stream: true });
    }
  };
  try {
    await readUntil(() => text.includes("event: hello"));
    assert.ok(text.startsWith("retry: 3000\n\nevent: hello\n"), "com o banco escutando, o hello já vai no 1º pedaço");
    assert.equal(JSON.parse(/event: hello\ndata: (.*)\n/.exec(text)![1]).listening, true);
    await notifyLive(db(), { type: "message.rejected", orgId: "outra-org", channel: "mqtt", reason: "de outra organização" });
    await notifyLive(db(), rejected("da demo"));
    await readUntil(() => text.includes("da demo"));
    const frames = [...text.matchAll(/event: live\ndata: (.*)\n\n/g)].map(m => parseLiveEvent(m[1]));
    assert.deepEqual(frames.map(e => e?.type === "message.rejected" && e.reason), ["da demo"]);
  } finally { ac.abort(); }
  await new Promise(r => setTimeout(r, 20));
  assert.equal(hub.size, 0, "stream fechado não deixa assinante");
});
