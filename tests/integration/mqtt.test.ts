import { DEVICE_CODE, db, resetAndSeed } from "./helpers";
import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { MqttIngestion, type MqttOutcome, type MqttProcessed } from "../../src/iot/mqtt-ingestion";
import { loadMqttConfig } from "../../src/iot/mqtt-payload";
import { DonationService } from "../../src/modules/donations/application/donation-service";
import { getOccurrenceDetail } from "../../src/modules/monitoring/application/get-occurrence-detail";
import { OccurrenceService } from "../../src/modules/monitoring/application/occurrence-service";
import { DEMO_DEVICE_ID, DEMO_ORG_ID } from "../../src/lib/constants";

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

const DONATION_TRIAGE = {
  foodOrigin: "WHOLE_PRODUCE" as const,
  reviewerQualification: "Nutricionista responsável",
  inspectionOk: true, conservationOk: true, validityOk: true, transportOk: true,
};

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

test("MQTT: temperatura sustentada abre UMA ocorrência; ACKNOWLEDGED continua bloqueando (regra 5) e vazão não vira evidência", async () => {
  const { many } = bridge();
  await many(5, { TEMP: 35, VAZAO: 0.2 });
  assert.equal((await active("TEMPERATURE_EXCURSION")).length, 0, "8 s acima do limite ainda não é excursão");
  const results = await many(12, { TEMP: 29.5, UMIDADE: 70, VAZAO: 0.2 });
  assert.equal(results.filter(r => r.temperature?.alerted).length, 1);
  const [occ] = await active("TEMPERATURE_EXCURSION");
  assert.equal(occ.source, "DEVICE");
  assert.equal(occ.severity, "MEDIUM");
  assert.match(occ.description, /acima de 28,0 °C por 30 segundos \(16 leituras entre 29,5 e 35,0 °C, umidade 70%\)/);
  await new OccurrenceService().transition(occ.id, "ACKNOWLEDGED", "", "operador:teste");
  const later = await many(5, { TEMP: 31, VAZAO: 0.2 });
  assert.equal(later.filter(r => r.temperature?.alerted).length, 0);
  assert.equal((await active("TEMPERATURE_EXCURSION")).length, 1, "reconhecida ainda é ativa");
  assert.equal((await active("UNUSUAL_FLOW")).length, 0);
  const detail = await getOccurrenceDetail(occ.id);
  assert.equal(detail.evidence, null, "leituras de vazão da janela não são evidência de temperatura");
  assert.match(detail.evidenceNote, /temperatura/);
});

test("MQTT: carga estável vira UM lote PENDING_REVIEW; com lote pendente não cria outro; depois de verificado, nova carga cria", async () => {
  await db().donationBatch.create({ data: { organizationId: DEMO_ORG_ID, description: "lote simulado de outra origem", weightKg: 4.2, status: "PENDING_REVIEW", source: "SIMULATED" } });
  const { many } = bridge();
  const load = (kg: number[]) => (i: number) => ({ PESO: kg[i] });
  const first = await many(6, load([0, 5.37, 5.31, 5.42, 5.4, 5.4]));
  const created = first.filter(r => r.donation?.created);
  assert.equal(created.length, 1, "lote de outra origem pendente não bloqueia a balança");
  const lot = await db().donationBatch.findUniqueOrThrow({ where: { id: created[0].donation!.id } });
  assert.equal(lot.status, "PENDING_REVIEW", "regra 6: nunca nasce disponível");
  assert.equal(lot.source, "DEVICE");
  assert.equal(Number(lot.weightKg), 5.3, "menor leitura estável, arredondada para baixo");
  const [audit] = await db().auditEvent.findMany({ where: { entity: "DonationBatch", entityId: lot.id } });
  assert.deepEqual([audit.action, (audit.metadata as Record<string, unknown>).actor], ["CREATED", "dispositivo:TEST-FLOW-001"]);

  const again = await many(6, load([0, 6, 6, 6, 6, 6]));
  assert.deepEqual(again.filter(r => r.donation).map(r => [r.donation!.created, r.donation!.id]), [[false, lot.id]], "um lote da balança aguardando verificação por vez");

  await new DonationService().transition(lot.id, { status: "AVAILABLE", verifiedBy: "Maria (nutricionista)", ...DONATION_TRIAGE }, "operador:teste");
  const next = await many(6, load([0, 6, 6, 6, 6, 6]));
  assert.equal(next.filter(r => r.donation?.created).length, 1);
  assert.equal(await db().donationBatch.count({ where: { source: "DEVICE" } }), 2);
});

test("MQTT: bootId e sequence do firmware tornam a retransmissão idempotente", async () => {
  const { send } = bridge({ MQTT_SIMULATED_SENSORS: "" });
  const a = await send({ VAZAO: 3, bootId: "esp32-abcd", sequence: 7 });
  const b = await send({ VAZAO: 3, bootId: "esp32-abcd", sequence: 7 });
  assert.deepEqual([a.flow?.duplicate, b.flow?.duplicate], [false, true]);
  assert.equal(await db().telemetryReading.count({ where: { bootId: "esp32-abcd" } }), 1);
});
