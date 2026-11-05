import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMqttConfig, mqttPayloadSchema } from "../src/iot/mqtt-payload";
import { TemperatureAlertPolicy } from "../src/modules/monitoring/domain/temperature-alert-policy";
import { ScaleSurplusDetector } from "../src/modules/monitoring/domain/scale-surplus-detector";

const t0 = new Date("2026-11-07T13:00:00Z");
const at = (s: number) => new Date(t0.getTime() + s * 1000);

test("payload do firmware MQTT (PR #3) é aceito como veio; sem sensor ou com bootId sem sequence é recusado", () => {
  assert.equal(mqttPayloadSchema.safeParse({ dispositivo_id: "hortifruti_01", PESO: 5.2, VAZAO: 3.1, TEMP: 26.4, UMIDADE: 61 }).success, true);
  assert.equal(mqttPayloadSchema.safeParse({ dispositivo_id: "hortifruti_01", TEMP: 26 }).success, true, "cada sensor é opcional");
  assert.equal(mqttPayloadSchema.safeParse({ dispositivo_id: "hortifruti_01", UMIDADE: 60 }).success, false, "umidade sozinha não é leitura");
  assert.equal(mqttPayloadSchema.safeParse({ dispositivo_id: "x", VAZAO: 1, bootId: "boot-1" }).success, false);
  assert.equal(mqttPayloadSchema.safeParse({ dispositivo_id: "x", VAZAO: -1 }).success, false);
  assert.equal(mqttPayloadSchema.safeParse({ dispositivo_id: "x", VAZAO: "3" }).success, false, "texto não vira número");
});

test("configuração da ponte: padrões honestos, apelidos explícitos e valor inválido derruba a partida", () => {
  const cfg = loadMqttConfig({});
  assert.equal(cfg.topic, "richards/comercio/telemetria");
  assert.deepEqual([...cfg.simulated], ["VAZAO"], "potenciômetro da bancada é SIMULATED por padrão");
  assert.deepEqual(cfg.aliases, {});
  assert.equal(cfg.username, undefined);
  assert.deepEqual([...loadMqttConfig({ MQTT_SIMULATED_SENSORS: "" }).simulated], [], "sensor real ligado: nada simulado");
  assert.deepEqual(loadMqttConfig({ MQTT_DEVICE_ALIASES: "hortifruti_01=RICHARDS-FLOW-001, b = C" }).aliases, { hortifruti_01: "RICHARDS-FLOW-001", b: "C" });
  assert.throws(() => loadMqttConfig({ MQTT_DEVICE_ALIASES: "sem-igual" }), /MQTT_DEVICE_ALIASES/);
  assert.throws(() => loadMqttConfig({ MQTT_SIMULATED_SENSORS: "UMIDADE" }), /MQTT_SIMULATED_SENSORS/);
  assert.throws(() => loadMqttConfig({ MQTT_TEMP_LIMIT_C: "quente" }), /MQTT_TEMP_LIMIT_C/);
  assert.equal(loadMqttConfig({ MQTT_SCALE_MIN_KG: "2.5" }).scaleMinKg, 2.5);
});

test("temperatura: só alerta acima do limite de forma sustentada; pico isolado e buraco não alertam", () => {
  const policy = new TemperatureAlertPolicy(28, 30);
  const series = (values: number[], step = 2) => values.map((v, i) => ({ at: at(i * step), value: v }));
  const hot = policy.evaluate(series(Array(16).fill(29)));
  assert.equal(hot.suspicious, true);
  assert.equal(hot.observedSeconds, 30);
  assert.equal(policy.evaluate(series([25, 25, 35, 25])).suspicious, false, "pico isolado não é excursão");
  assert.equal(policy.evaluate(series(Array(16).fill(28))).suspicious, false, "igual ao limite não está acima");
  assert.equal(policy.evaluate([{ at: at(0), value: 30 }, { at: at(50), value: 30 }]).suspicious, false, "sem amostra por 50 s não se afirma continuidade");
  const dip = policy.evaluate(series([29, 29, 29, 29, 29, 29, 29, 27, 29, 29, 29]));
  assert.equal(dip.suspicious, false, "queda abaixo do limite reinicia a janela");
  assert.equal(dip.minC, 29);
});

test("balança: um lote por carga estável, peso conservador e rearme só depois de esvaziar", () => {
  const scale = new ScaleSurplusDetector(5, 6);
  const push = (s: number, kg: number) => scale.push({ at: at(s), value: kg });
  assert.equal(push(0, 0).trigger, false);
  assert.equal(push(2, 5.37).trigger, false, "uma leitura não prova estabilidade");
  assert.equal(push(4, 5.31).trigger, false);
  const hit = push(8, 5.42);
  assert.equal(hit.trigger, true);
  assert.equal(hit.trigger && hit.weightKg, 5.3, "menor leitura do trecho, arredondada para baixo");
  assert.equal(push(10, 5.4).trigger, false, "mesma carga não gera outro lote");
  assert.equal(push(12, 3.0).trigger, false, "acima da metade do mínimo não rearma");
  assert.equal(push(14, 5.4).trigger, false);
  assert.equal(push(16, 0.1).trigger, false, "balança esvaziada: rearma");
  push(18, 7.0); push(20, 7.0);
  assert.equal(push(24, 7.0).trigger, true, "nova carga gera novo lote");
  const fresh = new ScaleSurplusDetector(2, 4);
  fresh.push({ at: at(0), value: 2.3 }); const r = fresh.push({ at: at(4), value: 2.3 });
  assert.equal(r.trigger && r.weightKg, 2.3, "sem erro de ponto flutuante no arredondamento");
  fresh.rearm();
  assert.equal(fresh.push({ at: at(6), value: 2.3 }).trigger, true, "rearme manual após falha de gravação");
});
