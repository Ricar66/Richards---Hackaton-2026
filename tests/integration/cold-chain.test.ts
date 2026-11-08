import { DEVICE_CODE, db, resetAndSeed } from "./helpers";
import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { MqttIngestion, type MqttProcessed } from "../../src/iot/mqtt-ingestion";
import { loadMqttConfig } from "../../src/iot/mqtt-payload";
import { getColdChain } from "../../src/modules/cold-chain/application/cold-chain-service";
import { DEMO_DEVICE_ID, DEMO_ORG_ID, DEMO_SITE_ID } from "../../src/lib/constants";

beforeEach(resetAndSeed);
after(() => db().$disconnect());

async function equipment(kind: "REFRIGERATOR" | "AMBIENT" = "REFRIGERATOR", code = "GEL-TESTE") {
  return db().coldEquipment.create({ data: { organizationId: DEMO_ORG_ID, siteId: DEMO_SITE_ID, code, label: `Equipamento ${code}`, kind, sensorDeviceId: DEMO_DEVICE_ID } });
}
/** Ponte com relógio controlado: cada mensagem anda `step` segundos, começando 1 h atrás. */
function bridge(step = 10, env: Record<string, string> = {}) {
  let clock = Date.now() - 3600_000;
  const ingestion = new MqttIngestion(loadMqttConfig({ MQTT_DEVICE_ALIASES: `hortifruti_01=${DEVICE_CODE}`, ...env }), () => new Date((clock += step * 1000)));
  const send = async (p: Record<string, unknown>) => {
    const r = await ingestion.handle({ dispositivo_id: "hortifruti_01", ...p });
    assert.equal(r.status, "processed", r.status === "rejected" ? r.reason : "");
    return r as MqttProcessed;
  };
  return { ingestion, send };
}

test("temperatura do sensor vira série do equipamento: 1 por minuto e toda virada de faixa", async () => {
  const gel = await equipment();
  const { send } = bridge(10);
  // 0 s: 3 °C (grava) · 10–50 s: 3 °C (não grava) · 60 s: 3 °C (grava, passou o minuto) · 70 s: 6 °C (grava: saiu da faixa)
  const temps = [3, 3, 3, 3, 3, 3, 3, 6, 6, 3];
  const stored: number[] = [];
  for (const t of temps) stored.push((await send({ TEMP: t, UMIDADE: 60 })).coldStored ?? 0);
  // Mensagens 0 (primeira), 6 (minuto), 7 (saiu da faixa) e 9 (voltou à faixa) gravam.
  assert.deepEqual(stored, [1, 0, 0, 0, 0, 0, 1, 1, 0, 1]);
  const rows = await db().temperatureReading.findMany({ where: { equipmentId: gel.id }, orderBy: { capturedAt: "asc" } });
  assert.deepEqual(rows.map(r => Number(r.temperatureC)), [3, 3, 6, 3]);
  assert.ok(rows.every(r => r.source === "DEVICE" && Number(r.humidityPct) === 60), "DHT11 real é DEVICE; o padrão da ponte só simula VAZAO");
});

test("retentativa da mesma mensagem não duplica a série e equipamento de outro sensor não recebe nada", async () => {
  const gel = await equipment();
  await db().device.create({ data: { id: "outro-sensor", organizationId: DEMO_ORG_ID, siteId: DEMO_SITE_ID, code: "OUTRO-001", label: "Outro", kind: "TEMPERATURE", apiKeyHash: "x" } });
  await db().coldEquipment.create({ data: { organizationId: DEMO_ORG_ID, siteId: DEMO_SITE_ID, code: "GEL-OUTRO", label: "Outra geladeira", kind: "REFRIGERATOR", sensorDeviceId: "outro-sensor" } });
  const { ingestion } = bridge();
  const prepared = await ingestion.prepare({ dispositivo_id: "hortifruti_01", TEMP: 4 });
  assert.equal(prepared.status, "ready");
  if (prepared.status !== "ready") return;
  await ingestion.apply(prepared.message);
  prepared.message.done.cold = undefined; // simula a retentativa sem memória do que já foi gravado
  await ingestion.apply(prepared.message);
  assert.equal(await db().temperatureReading.count({ where: { equipmentId: gel.id } }), 1, "chave (equipamento, captura, origem)");
  assert.equal(await db().temperatureReading.count({ where: { equipment: { code: "GEL-OUTRO" } } }), 0);
});

test("simulado fica na série simulada e o resumo por origem não mistura; sem leitura não há porcentagem", async () => {
  await equipment("REFRIGERATOR");
  const sim = bridge(30, { MQTT_SIMULATED_SENSORS: "TEMP" });
  for (const t of [3, 3, 7, 7, 3]) await sim.send({ TEMP: t });
  const real = await getColdChain({ hours: 24, source: "DEVICE" });
  const e = real.equipments.find(x => x.code === "GEL-TESTE")!;
  assert.equal(e.summary.inRangePct, null, "nenhuma leitura real: nunca 100%");
  assert.equal(e.state, "NO_DATA");
  const simulated = (await getColdChain({ hours: 24, source: "SIMULATED" })).equipments.find(x => x.code === "GEL-TESTE")!;
  assert.equal(simulated.summary.samples, 3, "a cada 30 s: grava a 1ª, a que saiu da faixa e a que voltou (1 por minuto + viradas)");
  assert.equal(simulated.summary.excursionCount, 1);
  assert.equal(simulated.summary.excursions[0].peakC, 7);
  assert.ok(simulated.summary.inRangePct !== null && simulated.summary.inRangePct < 100 && simulated.summary.inRangePct > 0);
  assert.equal(simulated.rangeText, "abaixo de 5 °C");
  assert.equal(simulated.range.reference, "RDC 216/2004, item 4.8.16: refrigerado abaixo de 5 °C");
});

test("equipamento inativo some do painel e a faixa própria só aperta (nunca afrouxa) a norma", async () => {
  await db().coldEquipment.create({ data: { organizationId: DEMO_ORG_ID, siteId: DEMO_SITE_ID, code: "GEL-FROUXA", label: "Geladeira 8 °C", kind: "REFRIGERATOR", maxC: 8, sensorDeviceId: DEMO_DEVICE_ID } });
  await db().coldEquipment.create({ data: { organizationId: DEMO_ORG_ID, siteId: DEMO_SITE_ID, code: "GEL-OFF", label: "Desligada", kind: "REFRIGERATOR", active: false } });
  const s = await getColdChain({ hours: 24, source: "DEVICE" });
  assert.equal(s.equipments.find(x => x.code === "GEL-FROUXA")!.range.maxC, 5);
  assert.equal(s.equipments.some(x => x.code === "GEL-OFF"), false);
});
