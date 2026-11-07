import { DEVICE_CODE, db, resetAndSeed } from "./helpers";
import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { MqttIngestion, type MqttOutcome, type MqttProcessed } from "../../src/iot/mqtt-ingestion";
import { loadMqttConfig } from "../../src/iot/mqtt-payload";
import { DEMO_DEVICE_ID } from "../../src/lib/constants";

beforeEach(resetAndSeed);
after(() => db().$disconnect());

type Payload = Record<string, unknown>;
/** Ponte com relógio controlado: cada mensagem anda `step` segundos, começando 3 min atrás. */
function bridge(env: Record<string, string> = {}, step = 2) {
  let clock = Date.now() - 180_000;
  const ingestion = new MqttIngestion(loadMqttConfig({ MQTT_DEVICE_ALIASES: `hortifruti_01=${DEVICE_CODE}`, ...env }), () => new Date((clock += step * 1000)));
  const send = async (p: Payload) => {
    const r = await ingestion.handle({ dispositivo_id: "hortifruti_01", ...p });
    assert.equal(r.status, "processed", r.status === "rejected" ? r.reason : "");
    return r as MqttProcessed;
  };
  const many = async (n: number, p: Payload | ((i: number) => Payload)) => {
    const out: MqttProcessed[] = [];
    for (let i = 0; i < n; i++) out.push(await send(typeof p === "function" ? p(i) : p));
    return out;
  };
  return { ingestion, send, many };
}
const active = (kind: "UNUSUAL_FLOW" | "TEMPERATURE_EXCURSION") =>
  db().occurrence.findMany({ where: { deviceId: DEMO_DEVICE_ID, kind, status: { in: ["OPEN", "ACKNOWLEDGED"] } } });


test("MQTT: payload do firmware via apelido grava a leitura (potenciômetro = SIMULATED) com volume pelo intervalo real", async () => {
  const { ingestion, many } = bridge({}, 5);
  await many(2, { PESO: 0, VAZAO: 3, TEMP: 25, UMIDADE: 60 });
  const rows = await db().telemetryReading.findMany({ where: { deviceId: DEMO_DEVICE_ID }, orderBy: { sequence: "asc" } });
  assert.deepEqual(rows.map(r => [r.source, r.bootId, r.sequence]), [["SIMULATED", ingestion.bootId, 0], ["SIMULATED", ingestion.bootId, 1]]);
  assert.deepEqual(rows.map(r => Number(r.deltaLiters)), [0.1, 0.25], "1ª: intervalo declarado (2 s); 2ª: 5 s desde a anterior");
  const device = await db().device.findUniqueOrThrow({ where: { id: DEMO_DEVICE_ID } });
  assert.ok(device.lastSeenAt);
  assert.equal(device.state, "OFFLINE", "a ponte não grava ONLINE: conectividade vem do último contato");
});

test("MQTT: dispositivo desconhecido ou payload inválido é descartado sem gravar nada (sem cair em outro sensor)", async () => {
  const { ingestion } = bridge();
  const outcomes: MqttOutcome[] = [
    await ingestion.handle({ dispositivo_id: "balcao_99", VAZAO: 3, PESO: 9, TEMP: 40 }),
    await ingestion.handle({ dispositivo_id: "hortifruti_01", VAZAO: "muito" }),
    await ingestion.handle({ VAZAO: 3 }),
  ];
  assert.deepEqual(outcomes.map(o => o.status), ["rejected", "rejected", "rejected"]);
  assert.equal(await db().telemetryReading.count(), 0);
  assert.equal(await db().donationBatch.count(), 0);
  assert.equal(await db().occurrence.count(), 0);
});

test("MQTT: vazão segue a regra do dispositivo; pico de 9 L/min não abre, 2 L/min por 30 s abre UMA com auditoria do canal", async () => {
  const { send, many } = bridge({ MQTT_SIMULATED_SENSORS: "" });
  await send({ VAZAO: 9 }); await send({ VAZAO: 0 });
  assert.equal((await active("UNUSUAL_FLOW")).length, 0, "leitura isolada alta não é fluxo contínuo");
  const results = await many(20, { VAZAO: 2 });
  assert.equal(results.filter(r => r.flow?.alerted).length, 1);
  assert.equal(results.findIndex(r => r.flow?.alerted), 15, "abre quando a janela chega a 30 s (16 leituras a cada 2 s)");
  const [occ] = await active("UNUSUAL_FLOW");
  assert.equal(occ.source, "DEVICE");
  const [audit] = await db().auditEvent.findMany({ where: { entityId: occ.id } });
  const meta = audit.metadata as Record<string, unknown>;
  assert.equal(meta.channel, "mqtt");
  assert.equal(meta.actor, "dispositivo:TEST-FLOW-001");
});

test("MQTT: com o potenciômetro (padrão), o alerta de fluxo sai SIMULATED e com actor de simulador", async () => {
  const { many } = bridge();
  await many(17, { VAZAO: 2 });
  const [occ] = await active("UNUSUAL_FLOW");
  assert.equal(occ.source, "SIMULATED");
  const [event] = await db().occurrenceEvent.findMany({ where: { occurrenceId: occ.id } });
  assert.equal(event.actor, "simulador:TEST-FLOW-001");
});

test("MQTT: campos retirados são ignorados e pacote sem vazão é recusado",async()=>{
 const {ingestion}=bridge();const r=await ingestion.handle({dispositivo_id:"hortifruti_01",VAZAO:.2,TEMP:40,PESO:50});assert.equal(r.status,"processed");assert.equal(await db().donationBatch.count(),0);assert.equal(await db().occurrence.count({where:{kind:"TEMPERATURE_EXCURSION"}}),0);assert.equal((await ingestion.handle({dispositivo_id:"hortifruti_01",TEMP:40,PESO:50})).status,"rejected");
});

test("MQTT: bootId e sequence do firmware tornam a retransmissão idempotente", async () => {
  const { send } = bridge({ MQTT_SIMULATED_SENSORS: "" });
  const a = await send({ VAZAO: 3, bootId: "esp32-abcd", sequence: 7 });
  const b = await send({ VAZAO: 3, bootId: "esp32-abcd", sequence: 7 });
  assert.deepEqual([a.flow?.duplicate, b.flow?.duplicate], [false, true]);
  assert.equal(await db().telemetryReading.count({ where: { bootId: "esp32-abcd" } }), 1);
});
