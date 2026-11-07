import { DEVICE_CODE, db, resetAndSeed } from "./helpers";
import { after, afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MqttIngestion } from "../../src/iot/mqtt-ingestion";
import { createBridgeQueue, createMessageProcessor, deviceFromTopic, isPermanentError, subscriptionsFor, type DeadLetterRecord } from "../../src/iot/mqtt-connection";
import { loadMqttConfig, topicMatches, type MqttBridgeConfig } from "../../src/iot/mqtt-payload";
import { Prisma } from "../../src/generated/prisma/client";
import { DEMO_DEVICE_ID } from "../../src/lib/constants";

/**
 * Confiabilidade da ponte MQTT (auditoria final + revisão adversarial de 06/11). O MQTT.js confirma na chegada e a ponte
 * grava por uma fila própria: nada segura o laço de pacotes (o ping do keepalive segue com o banco fora). A falha do
 * banco é injetada por gatilho (nenhum gancho no código de produção).
 */
const TOPIC = "richards/comercio/telemetria";
const silent = { log() {}, warn() {}, error() {} };
let dir = "";
function setup(env: Record<string, string> = {}) {
  dir = mkdtempSync(join(tmpdir(), "richards-mqtt-"));
  const cfg: MqttBridgeConfig = loadMqttConfig({ MQTT_DEVICE_ALIASES: `hortifruti_01=${DEVICE_CODE}`, MQTT_DEAD_LETTER: join(dir, "carta-morta.ndjson"), ...env });
  // Relógio da ingestão bem longe de agora: se a hora da leitura vier dele (e não da chegada), o teste vê.
  const ingestion = new MqttIngestion(cfg, () => new Date(Date.UTC(2020, 0, 1)));
  return { cfg, ingestion };
}
async function injectFailure(table = "TelemetryReading") {
  await db().$executeRawUnsafe(`CREATE OR REPLACE FUNCTION richards_test_falha() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'banco indisponível (falha injetada)'; END $$ LANGUAGE plpgsql`);
  await db().$executeRawUnsafe(`CREATE TRIGGER richards_test_falha BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION richards_test_falha()`);
}
async function clearFailure() {
  for (const t of ["TelemetryReading", "Occurrence"]) await db().$executeRawUnsafe(`DROP TRIGGER IF EXISTS richards_test_falha ON "${t}"`);
  await db().$executeRawUnsafe(`DROP FUNCTION IF EXISTS richards_test_falha()`);
}
const body = (b: unknown) => Buffer.from(typeof b === "string" ? b : JSON.stringify(b));
const readings = () => db().telemetryReading.findMany({ where: { deviceId: DEMO_DEVICE_ID }, orderBy: { capturedAt: "asc" } });
// Só linhas completas (terminadas em \n): a carta morta pode estar no meio de um append quando o teste lê.
const deadLines = (cfg: MqttBridgeConfig) => existsSync(cfg.deadLetterPath)
  ? readFileSync(cfg.deadLetterPath, "utf8").split("\n").slice(0, -1).filter(Boolean).map(l => JSON.parse(l) as DeadLetterRecord) : [];
const until = async (cond: () => boolean | Promise<boolean>, ms = 15_000) => { const t = Date.now(); while (!(await cond())) { if (Date.now() - t > ms) throw new Error("tempo esgotado esperando a condição"); await new Promise(r => setTimeout(r, 25)); } };

beforeEach(async () => { await clearFailure(); await resetAndSeed(); });
afterEach(clearFailure);
after(() => db().$disconnect());

test("M3.1 banco recusando: a fila insiste e, ao voltar, grava UMA vez com a hora da CHEGADA (não a do relógio nem a da retentativa)", async () => {
  const { cfg, ingestion } = setup();
  await injectFailure();
  let attempts = 0, recoveredAt = 0;
  const process = createMessageProcessor(ingestion, cfg, { log: silent, sleep: async () => { if (++attempts === 2) { await clearFailure(); recoveredAt = Date.now(); } } });
  const arrived = new Date(Date.now() - 5_000);
  assert.equal(await process(TOPIC, body({ dispositivo_id: "hortifruti_01", VAZAO: 2.4 }), arrived), "persisted");
  const rows = await readings();
  assert.equal(rows.length, 1, "a retentativa grava uma vez");
  assert.equal(rows[0].capturedAt.getTime(), arrived.getTime(), "a hora da leitura é a da CHEGADA na ponte");
  assert.ok(rows[0].capturedAt.getTime() < recoveredAt);
});

test("M3.2 banco FORA desde a chegada (prepare falha): a hora continua a da chegada, não a de quando o banco voltou", async () => {
  const { cfg, ingestion } = setup();
  let calls = 0;
  const real = ingestion.prepare.bind(ingestion);
  ingestion.prepare = async (...a: Parameters<typeof real>) => { if (++calls <= 2) throw new Error("Can't reach database server"); return real(...a); };
  const process = createMessageProcessor(ingestion, cfg, { log: silent, sleep: async () => {} });
  const arrived = new Date(Date.now() - 30_000);
  assert.equal(await process(TOPIC, body({ dispositivo_id: "hortifruti_01", VAZAO: 1.3 }), arrived), "persisted");
  assert.equal(calls, 3);
  assert.equal((await readings())[0].capturedAt.getTime(), arrived.getTime());
});

test("M3.3 a fila não segura a chegada: enquanto a 1ª espera o banco, as seguintes entram na fila na hora e são gravadas em ordem, cada uma com a SUA hora", async () => {
  const { cfg, ingestion } = setup();
  await injectFailure();
  let release!: () => void;
  const gate = new Promise<void>(r => (release = r));
  const process = createMessageProcessor(ingestion, cfg, { log: silent, sleep: async () => { await gate; await clearFailure(); } });
  const queue = createBridgeQueue(process, cfg, silent);
  const t0 = Date.now() - 10_000;
  const pushedAt: number[] = [];
  for (const [i, v] of [1.1, 2.2, 3.3].entries()) { const s = performance.now(); queue.push({ topic: TOPIC, payload: body({ dispositivo_id: "hortifruti_01", VAZAO: v }), receivedAt: new Date(t0 + i * 2000) }); pushedAt.push(performance.now() - s); }
  assert.ok(Math.max(...pushedAt) < 5, `push é imediato (o MQTT.js segue livre): ${pushedAt.map(x => x.toFixed(2)).join(", ")} ms`);
  assert.equal(queue.size(), 2, "a 1ª está em retentativa, as outras esperam na fila");
  release();
  await until(async () => (await readings()).length === 3);
  const rows = await readings();
  assert.deepEqual(rows.map(r => Number(r.flowLpm)), [1.1, 2.2, 3.3], "ordem de chegada");
  assert.deepEqual(rows.map(r => r.capturedAt.getTime() - t0), [0, 2000, 4000], "cada uma com a hora em que chegou");
  // Volume = vazão × intervalo REAL entre chegadas (2 s); com a hora do processamento daria ~0 L para a 2ª e a 3ª.
  assert.deepEqual(rows.map(r => Number(r.deltaLiters)), [0.037, 0.073, 0.11]);
});

test("M3.4 prazo esgotado: carta morta com hora de chegada, conteúdo, motivo e erro; a fila segue com a próxima", async () => {
  const { cfg, ingestion } = setup({ MQTT_RETRY_BUDGET_SECONDS: "2" });
  await injectFailure();
  let clock = Date.now();
  const process = createMessageProcessor(ingestion, cfg, { log: silent, now: () => clock, sleep: async ms => { clock += ms; } });
  assert.equal(await process(TOPIC, body({ dispositivo_id: "hortifruti_01", VAZAO: 4.4 }), new Date()), "dead-letter");
  const [line] = deadLines(cfg);
  assert.equal(line.topic, TOPIC); assert.match(line.payload, /"VAZAO":4.4/); assert.match(line.error, /banco indisponível/);
  assert.equal(line.reason, "prazo esgotado"); assert.ok(Date.parse(line.receivedAt) > 0 && line.attempts >= 2);
  assert.equal(line.partial?.flow, null, "nada gravado: partial vazio");
  await clearFailure();
  assert.equal(await process(TOPIC, body({ dispositivo_id: "hortifruti_01", VAZAO: 0.5 }), new Date()), "persisted");
  assert.deepEqual((await readings()).map(r => Number(r.flowLpm)), [0.5]);
});

test("M3.5 gravação PARCIAL: vazão gravada e temperatura falhando vão para a carta morta como PARCIAL, com bootId/sequence da vazão", async () => {
  const { cfg, ingestion } = setup({ MQTT_RETRY_BUDGET_SECONDS: "2", MQTT_TEMP_SECONDS: "1", MQTT_SIMULATED_SENSORS: "" });
  let clock = Date.now();
  const process = createMessageProcessor(ingestion, cfg, { log: silent, now: () => clock, sleep: async ms => { clock += ms; } });
  const base = Date.now() - 10_000;
  await process(TOPIC, body({ dispositivo_id: "hortifruti_01", TEMP: 35 }), new Date(base));
  await injectFailure("Occurrence");
  assert.equal(await process(TOPIC, body({ dispositivo_id: "hortifruti_01", VAZAO: 0.2, TEMP: 36 }), new Date(base + 3000)), "dead-letter");
  const line = deadLines(cfg).at(-1)!;
  assert.ok(line.partial?.flow, "a vazão já tinha sido gravada");
  assert.equal(typeof line.partial.flow.sequence, "number"); assert.ok(line.partial.flow.bootId);
  assert.equal(line.partial.temperature, null, "a temperatura ficou de fora");
  assert.equal((await readings()).length, 1, "a vazão gravada continua lá (não é desfeita)");
});

test("M3.6 erro permanente vai direto para a carta morta, sem esperar o prazo; erro de conexão continua transitório", async () => {
  const { cfg, ingestion } = setup();
  let sleeps = 0;
  ingestion.apply = async () => { throw new Prisma.PrismaClientKnownRequestError("valor fora da faixa", { code: "P2020", clientVersion: "test" }); };
  const process = createMessageProcessor(ingestion, cfg, { log: silent, sleep: async () => { sleeps++; } });
  assert.equal(await process(TOPIC, body({ dispositivo_id: "hortifruti_01", VAZAO: 1 }), new Date()), "dead-letter");
  assert.equal(sleeps, 0); assert.equal(deadLines(cfg).at(-1)!.reason, "erro permanente ao gravar");
  assert.equal(isPermanentError(new Prisma.PrismaClientKnownRequestError("x", { code: "P1001", clientVersion: "t" })), false, "servidor inalcançável: transitório");
  assert.equal(isPermanentError(new Error("Connection terminated unexpectedly")), false);
});

test("M3.7 tentativa que nunca responde: o prazo é de relógio (teto por tentativa); a carta morta diz que a situação é incerta", async () => {
  const { cfg, ingestion } = setup({ MQTT_RETRY_BUDGET_SECONDS: "1" });
  let calls = 0;
  ingestion.apply = () => { calls++; return new Promise(() => {}); }; // pendurada para sempre
  const process = createMessageProcessor(ingestion, cfg, { log: silent, attemptTimeoutMs: 150, settleTimeoutMs: 100 });
  const t = Date.now();
  assert.equal(await process(TOPIC, body({ dispositivo_id: "hortifruti_01", VAZAO: 1 }), new Date()), "dead-letter");
  assert.ok(Date.now() - t < 3_000, `liberou em ${Date.now() - t} ms`);
  assert.equal(calls, 1, "nunca duas tentativas ao mesmo tempo: a pendurada não ganha companhia");
  const line = deadLines(cfg).at(-1)!;
  assert.match(line.error, /sem resposta/);
  assert.equal(line.attemptStillRunning, true, "a carta morta não afirma 'NÃO GRAVADA' com a tentativa ainda rodando");
});

test("M3.7b tentativa atrasada que termina depois do teto: a seguinte espera por ela e nada é gravado duas vezes", async () => {
  const { cfg, ingestion } = setup({ MQTT_RETRY_BUDGET_SECONDS: "10" });
  const real = ingestion.apply.bind(ingestion);
  let calls = 0;
  ingestion.apply = async m => { calls++; if (calls === 1) await new Promise(r => setTimeout(r, 400)); return real(m); };
  const process = createMessageProcessor(ingestion, cfg, { log: silent, attemptTimeoutMs: 100, sleep: async () => {} });
  assert.equal(await process(TOPIC, body({ dispositivo_id: "hortifruti_01", VAZAO: 1.7 }), new Date()), "persisted");
  assert.equal(calls, 2);
  assert.equal((await readings()).length, 1, "a atrasada gravou; a seguinte viu o done e não repetiu");
});

test("M3.8 encerrar a ponte: a mensagem em curso para de insistir e ela e o resto da fila vão para a carta morta (nada some)", async () => {
  const { cfg, ingestion } = setup();
  await injectFailure();
  let stopping = false;
  const process = createMessageProcessor(ingestion, cfg, { log: silent, stopping: () => stopping, sleep: () => new Promise(r => setTimeout(r, 30)) });
  const queue = createBridgeQueue(process, cfg, silent);
  for (const v of [1, 2, 3]) queue.push({ topic: TOPIC, payload: body({ dispositivo_id: "hortifruti_01", VAZAO: v }), receivedAt: new Date() });
  await new Promise(r => setTimeout(r, 120));
  stopping = true;
  await queue.stop();
  const lines = deadLines(cfg);
  assert.deepEqual(lines.map(l => JSON.parse(l.payload).VAZAO).sort(), [1, 2, 3]);
  assert.ok(lines.every(l => l.reason === "ponte encerrada antes de gravar"));
  queue.push({ topic: TOPIC, payload: body({ dispositivo_id: "hortifruti_01", VAZAO: 9 }), receivedAt: new Date() });
  await until(() => deadLines(cfg).length === 4);
});

test("M3.9 fila cheia: a mensagem excedente vai para a carta morta (nunca é descartada em silêncio)", async () => {
  const { cfg, ingestion } = setup({ MQTT_QUEUE_MAX: "1" });
  let release!: () => void;
  const gate = new Promise<void>(r => (release = r));
  const queue = createBridgeQueue(async () => { await gate; return "persisted"; }, cfg, silent);
  void ingestion;
  for (const v of [1, 2, 3]) queue.push({ topic: TOPIC, payload: body({ dispositivo_id: "hortifruti_01", VAZAO: v }), receivedAt: new Date() });
  await until(() => deadLines(cfg).length === 1);
  assert.equal(JSON.parse(deadLines(cfg)[0].payload).VAZAO, 3); assert.equal(deadLines(cfg)[0].reason, "fila cheia");
  release();
});

test("M3.10 recusas definitivas sem retentar: JSON inválido, desconhecido, outro dispositivo no tópico, apelido '__proto__'", async () => {
  const { cfg, ingestion } = setup();
  let sleeps = 0;
  const process = createMessageProcessor(ingestion, cfg, { log: silent, sleep: async () => { sleeps++; } });
  assert.equal(await process(TOPIC, body("{nao-e-json"), new Date()), "rejected");
  assert.equal(await process(TOPIC, body({ dispositivo_id: "fantasma", VAZAO: 1 }), new Date()), "rejected");
  assert.equal(await process(TOPIC, body({ dispositivo_id: "__proto__", VAZAO: 1 }), new Date()), "rejected", "__proto__ não acha nada no mapa de apelidos");
  assert.equal(await process(TOPIC, body({ dispositivo_id: "constructor", VAZAO: 1 }), new Date()), "rejected");
  assert.equal(await process(`${TOPIC}/outro_sensor`, body({ dispositivo_id: "hortifruti_01", VAZAO: 1 }), new Date()), "rejected", "o JSON não fala em nome de outro dispositivo");
  assert.equal(await process(`${TOPIC}/hortifruti_01`, body({ dispositivo_id: "hortifruti_01", VAZAO: 1 }), new Date()), "persisted", "tópico do próprio dispositivo");
  assert.equal(sleeps, 0, "recusa definitiva não espera nem retenta");
  assert.equal((await readings()).length, 1);
});

test("M3.11 tópicos: compartilhado por padrão; estrito exige <tópico>/<dispositivo>; curinga no MQTT_TOPIC volta a funcionar", () => {
  const loose = loadMqttConfig({});
  const strict = loadMqttConfig({ MQTT_REQUIRE_DEVICE_TOPIC: "true" });
  assert.equal(deviceFromTopic(loose, TOPIC), undefined);
  assert.equal(deviceFromTopic(loose, `${TOPIC}/sensor_1`), "sensor_1");
  assert.equal(deviceFromTopic(strict, TOPIC), null, "estrito: tópico compartilhado recusado");
  assert.equal(deviceFromTopic(strict, `${TOPIC}/sensor_1`), "sensor_1");
  assert.equal(deviceFromTopic(loose, `${TOPIC}/a/b`), null);
  assert.equal(deviceFromTopic(loose, "outro/topico"), null);
  const wild = loadMqttConfig({ MQTT_TOPIC: "richards/+/telemetria" });
  assert.deepEqual(subscriptionsFor(wild), ["richards/+/telemetria"], "curinga: assina só o filtro (sem '/+' inválido depois de '#')");
  assert.equal(deviceFromTopic(wild, "richards/comercio/telemetria"), undefined);
  assert.equal(deviceFromTopic(wild, "richards/comercio/outra"), null);
  assert.deepEqual(subscriptionsFor(loadMqttConfig({ MQTT_TOPIC: "richards/#" })), ["richards/#"]);
  assert.ok(topicMatches("a/#", "a") && topicMatches("a/#", "a/b/c") && !topicMatches("a/+", "a/b/c"));
  assert.throws(() => loadMqttConfig({ MQTT_TOPIC: "a/#", MQTT_REQUIRE_DEVICE_TOPIC: "true" }), /sem curinga/);
  assert.equal(loose.retryBudgetMs, 120_000); assert.equal(loose.keepaliveSeconds, 60); assert.equal(loose.queueMax, 2000);
  assert.equal(loose.deadLetterPath, ".mqtt-dead-letter.ndjson");
});
