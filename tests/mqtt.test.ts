import { test } from "node:test";
import assert from "node:assert/strict";
import { assertBrokerAuth, loadMqttConfig, mqttPayloadSchema } from "../src/iot/mqtt-payload";


test("payload do firmware MQTT (PR #3) é aceito como veio; sem sensor ou com bootId sem sequence é recusado", () => {
  assert.equal(mqttPayloadSchema.safeParse({ dispositivo_id: "hortifruti_01", PESO: 5.2, VAZAO: 3.1, TEMP: 26.4, UMIDADE: 61 }).success, true);
  assert.equal(mqttPayloadSchema.safeParse({ dispositivo_id: "hortifruti_01", TEMP: 26 }).success, false, "vazão é obrigatória no novo escopo");
  assert.equal(mqttPayloadSchema.safeParse({ dispositivo_id: "hortifruti_01", UMIDADE: 60 }).success, false, "umidade sozinha não é leitura");
  assert.equal(mqttPayloadSchema.safeParse({ dispositivo_id: "x", VAZAO: 1, bootId: "boot-1" }).success, false);
  assert.equal(mqttPayloadSchema.safeParse({ dispositivo_id: "x", VAZAO: 1, bootId: "esp32-ab12", sequence: 3 }).success, true);
  assert.equal(mqttPayloadSchema.safeParse({ dispositivo_id: "x", VAZAO: 1, bootId: "MQTT-1234abcd", sequence: 3 }).success, false, "prefixo da sessão da ponte é reservado");
  assert.equal(mqttPayloadSchema.safeParse({ dispositivo_id: "x", VAZAO: -1 }).success, false);
  assert.equal(mqttPayloadSchema.safeParse({ dispositivo_id: "x", VAZAO: "3" }).success, false, "texto não vira número");
});

test("configuração da ponte: padrões honestos, apelidos explícitos e valor inválido derruba a partida", () => {
  const cfg = loadMqttConfig({});
  assert.equal(cfg.topic, "richards/comercio/telemetria");
  assert.deepEqual([...cfg.simulated], ["VAZAO"], "potenciômetro da bancada é SIMULATED por padrão");
  assert.deepEqual({ ...cfg.aliases }, {}); // mapa sem protótipo: "__proto__" nunca acha nada
  assert.equal(cfg.username, undefined);
  assert.deepEqual([...loadMqttConfig({ MQTT_SIMULATED_SENSORS: "" }).simulated], [], "sensor real ligado: nada simulado");
  assert.deepEqual({ ...loadMqttConfig({ MQTT_DEVICE_ALIASES: "hortifruti_01=RICHARDS-FLOW-001, b = C" }).aliases }, { hortifruti_01: "RICHARDS-FLOW-001", b: "C" });
  assert.throws(() => loadMqttConfig({ MQTT_DEVICE_ALIASES: "sem-igual" }), /MQTT_DEVICE_ALIASES/);
  assert.throws(() => loadMqttConfig({ MQTT_SIMULATED_SENSORS: "UMIDADE" }), /MQTT_SIMULATED_SENSORS/);
});

test("broker sem usuário e senha só é aceito em bancada de demonstração (fail-closed)", () => {
  const open = loadMqttConfig({});
  assert.throws(() => assertBrokerAuth(open, {}), /MQTT_USERNAME/);
  assert.throws(() => assertBrokerAuth(open, { DEMO_MODE: "verdadeiro" }), /MQTT_USERNAME/, "erro de digitação não abre o canal");
  assert.doesNotThrow(() => assertBrokerAuth(open, { DEMO_MODE: "true" }));
  assert.throws(() => assertBrokerAuth(loadMqttConfig({ MQTT_USERNAME: "ponte" }), {}), /MQTT_PASSWORD/, "usuário sem senha não basta");
  assert.doesNotThrow(() => assertBrokerAuth(loadMqttConfig({ MQTT_USERNAME: "ponte", MQTT_PASSWORD: "segredo" }), {}));
});
