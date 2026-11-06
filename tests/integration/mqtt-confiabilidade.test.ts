import { DEVICE_CODE, db, resetAndSeed } from "./helpers";
import { after, afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MqttIngestion } from "../../src/iot/mqtt-ingestion";
import { attachAckAfterPersist, createMessageProcessor, deviceFromTopic } from "../../src/iot/mqtt-connection";
import { loadMqttConfig, type MqttBridgeConfig } from "../../src/iot/mqtt-payload";
import { DEMO_DEVICE_ID } from "../../src/lib/constants";

/**
 * Fase 3 da auditoria final: a ponte só confirma ao broker (PUBACK) depois de gravar no PostgreSQL. Testa o mesmo
 * `handleMessage` que o MQTT.js chama, com a falha do banco injetada por gatilho (nenhum gancho no código de produção).
 */
const TOPIC = "richards/comercio/telemetria";
const silent = { log() {}, warn() {}, error() {} };
let dir = "";
function setup(env: Record<string, string> = {}) {
  dir = mkdtempSync(join(tmpdir(), "richards-mqtt-"));
  const cfg: MqttBridgeConfig = loadMqttConfig({ MQTT_DEVICE_ALIASES: `hortifruti_01=${DEVICE_CODE}`, MQTT_DEAD_LETTER: join(dir, "carta-morta.ndjson"), ...env });
  let clock = Date.now() - 60_000;
  const ingestion = new MqttIngestion(cfg, () => new Date((clock += 2000)));
  return { cfg, ingestion };
}
async function injectFailure() {
  await db().$executeRawUnsafe(`CREATE OR REPLACE FUNCTION richards_test_falha() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'banco indisponível (falha injetada)'; END $$ LANGUAGE plpgsql`);
  await db().$executeRawUnsafe(`CREATE TRIGGER richards_test_falha BEFORE INSERT ON "TelemetryReading" FOR EACH ROW EXECUTE FUNCTION richards_test_falha()`);
}
async function clearFailure() {
  await db().$executeRawUnsafe(`DROP TRIGGER IF EXISTS richards_test_falha ON "TelemetryReading"`);
  await db().$executeRawUnsafe(`DROP FUNCTION IF EXISTS richards_test_falha()`);
}
type Packet = { topic: string; payload: Buffer | string; messageId?: number; qos?: number };
const packet = (body: unknown, messageId?: number, topic = TOPIC): Packet => ({ topic, payload: Buffer.from(typeof body === "string" ? body : JSON.stringify(body)), messageId, qos: 1 });
const fakeClient = () => ({ handleMessage: (_p: Packet, cb: (e?: Error) => void) => cb() });
const acked = (client: ReturnType<typeof fakeClient>, p: Packet) => new Promise<number>(resolve => client.handleMessage(p, () => resolve(Date.now())));
const readings = () => db().telemetryReading.findMany({ where: { deviceId: DEMO_DEVICE_ID }, orderBy: { capturedAt: "asc" } });

beforeEach(async () => { await clearFailure(); await resetAndSeed(); });
afterEach(clearFailure);
after(() => db().$disconnect());

test("M3.1 PUBACK só depois de gravar: com o banco recusando não confirma; ao voltar grava UMA vez, com a hora da chegada", async () => {
  const { cfg, ingestion } = setup();
  await injectFailure();
  let attempts = 0, recoveredAt = 0;
  // 1ª espera dura 400 ms de verdade (o teste confere aos 150 ms que nada foi confirmado); na 2ª, o banco "volta".
  const process = createMessageProcessor(ingestion, cfg, { log: silent, sleep: async () => {
    if (++attempts === 1) await new Promise(r => setTimeout(r, 400));
    else if (attempts === 2) { await clearFailure(); recoveredAt = Date.now(); }
  } });
  const client = fakeClient();
  attachAckAfterPersist(client, process);
  const ack = acked(client, packet({ dispositivo_id: "hortifruti_01", VAZAO: 2.4 }, 7));
  const pending = await Promise.race([ack.then(() => "confirmou"), new Promise(r => setTimeout(() => r("ainda não"), 150))]);
  assert.equal(pending, "ainda não", "não confirma ao broker enquanto o banco recusa");
  const ackAt = await ack;
  assert.ok(ackAt >= recoveredAt, "confirma só depois de o banco voltar e a leitura entrar");
  const rows = await readings();
  assert.equal(rows.length, 1, "a retentativa grava uma vez");
  assert.ok(rows[0].capturedAt.getTime() < recoveredAt, "a hora é a da CHEGADA (primeira tentativa), não a da retentativa");
});

test("M3.2 ordem preservada: a segunda mensagem espera a primeira (que estava em retentativa)", async () => {
  const { cfg, ingestion } = setup();
  await injectFailure();
  let attempts = 0;
  const process = createMessageProcessor(ingestion, cfg, { log: silent, sleep: async () => { if (++attempts === 2) await clearFailure(); } });
  const client = fakeClient();
  attachAckAfterPersist(client, process);
  const order: string[] = [];
  const a = acked(client, packet({ dispositivo_id: "hortifruti_01", VAZAO: 1.1 }, 1)).then(() => order.push("A"));
  const b = acked(client, packet({ dispositivo_id: "hortifruti_01", VAZAO: 2.2 }, 2)).then(() => order.push("B"));
  await Promise.all([a, b]);
  assert.deepEqual(order, ["A", "B"]);
  assert.deepEqual((await readings()).map(r => Number(r.flowLpm)), [1.1, 2.2], "gravadas na ordem de chegada");
});

test("M3.3 reentrega idêntica (mesmo id e conteúdo) durante o processamento não duplica a leitura", async () => {
  const { cfg, ingestion } = setup();
  await injectFailure();
  let attempts = 0;
  const process = createMessageProcessor(ingestion, cfg, { log: silent, sleep: async () => { if (++attempts === 2) await clearFailure(); } });
  const client = fakeClient();
  attachAckAfterPersist(client, process);
  const body = { dispositivo_id: "hortifruti_01", VAZAO: 3.3 };
  await Promise.all([acked(client, packet(body, 42)), acked(client, packet(body, 42))]);
  assert.equal((await readings()).length, 1);
});

test("M3.4 prazo esgotado: guarda na carta morta (hora de chegada, conteúdo, erro), confirma e segue com a próxima", async () => {
  const { cfg, ingestion } = setup({ MQTT_RETRY_BUDGET_SECONDS: "1" });
  await injectFailure();
  let fake = Date.now();
  const process = createMessageProcessor(ingestion, cfg, { log: silent, now: () => fake, sleep: async ms => { fake += ms; } });
  const client = fakeClient();
  attachAckAfterPersist(client, process);
  await acked(client, packet({ dispositivo_id: "hortifruti_01", VAZAO: 4.4 }, 9));
  assert.ok(existsSync(cfg.deadLetterPath));
  const [line] = readFileSync(cfg.deadLetterPath, "utf8").trim().split("\n").map(l => JSON.parse(l));
  assert.equal(line.topic, TOPIC);
  assert.match(line.payload, /"VAZAO":4.4/);
  assert.match(line.error, /banco indisponível/);
  assert.ok(Date.parse(line.receivedAt) > 0 && line.attempts >= 2);
  await clearFailure();
  await acked(client, packet({ dispositivo_id: "hortifruti_01", VAZAO: 0.5 }, 10));
  assert.deepEqual((await readings()).map(r => Number(r.flowLpm)), [0.5], "a fila não trava: a próxima entra");
});

test("M3.5 recusas definitivas confirmam sem retentar: JSON inválido, dispositivo desconhecido, outro dispositivo no tópico", async () => {
  const { cfg, ingestion } = setup();
  let sleeps = 0;
  const process = createMessageProcessor(ingestion, cfg, { log: silent, sleep: async () => { sleeps++; } });
  assert.equal(await process(TOPIC, Buffer.from("{nao-e-json"), new Date()), "rejected");
  assert.equal(await process(TOPIC, Buffer.from(JSON.stringify({ dispositivo_id: "fantasma", VAZAO: 1 })), new Date()), "rejected");
  assert.equal(await process(`${TOPIC}/outro_sensor`, Buffer.from(JSON.stringify({ dispositivo_id: "hortifruti_01", VAZAO: 1 })), new Date()), "rejected", "o JSON não fala em nome de outro dispositivo");
  assert.equal(await process(`${TOPIC}/hortifruti_01`, Buffer.from(JSON.stringify({ dispositivo_id: "hortifruti_01", VAZAO: 1 })), new Date()), "persisted", "tópico do próprio dispositivo");
  assert.equal(sleeps, 0, "recusa definitiva não espera nem retenta");
  assert.equal((await readings()).length, 1);
});

test("M3.6 tópicos: compartilhado aceito por padrão; modo estrito exige <tópico>/<dispositivo>; outros recusados", () => {
  const loose = loadMqttConfig({});
  const strict = loadMqttConfig({ MQTT_REQUIRE_DEVICE_TOPIC: "true" });
  assert.equal(deviceFromTopic(loose, TOPIC), undefined);
  assert.equal(deviceFromTopic(loose, `${TOPIC}/sensor_1`), "sensor_1");
  assert.equal(deviceFromTopic(strict, TOPIC), null, "estrito: tópico compartilhado recusado");
  assert.equal(deviceFromTopic(strict, `${TOPIC}/sensor_1`), "sensor_1");
  assert.equal(deviceFromTopic(loose, `${TOPIC}/a/b`), null);
  assert.equal(deviceFromTopic(loose, "outro/topico"), null);
  assert.equal(loose.retryBudgetMs, 120_000);
  assert.equal(loose.deadLetterPath, ".mqtt-dead-letter.ndjson");
});
