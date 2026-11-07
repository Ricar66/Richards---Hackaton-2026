import { test } from "node:test";
import assert from "node:assert/strict";
import { assertBrokerAuth, loadMqttConfig, mqttPayloadSchema } from "../src/iot/mqtt-payload";
import { TemperatureAlertPolicy } from "../src/modules/monitoring/domain/temperature-alert-policy";
import { ScaleSurplusDetector } from "../src/modules/monitoring/domain/scale-surplus-detector";

const t0 = new Date("2026-11-07T13:00:00Z");
const at = (s: number) => new Date(t0.getTime() + s * 1000);

test("payload do firmware MQTT (PR #3) é aceito como veio; sem sensor ou com bootId sem sequence é recusado", () => {
  assert.equal(mqttPayloadSchema.safeParse({ dispositivo_id: "hortifruti_01", PESO: 5.2, VAZAO: 3.1, TEMP: 26.4, UMIDADE: 61 }).success, true);
  assert.equal(mqttPayloadSchema.safeParse({ dispositivo_id: "hortifruti_01", TEMP: 26 }).success, true, "cada sensor é opcional");
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
  assert.throws(() => loadMqttConfig({ MQTT_TEMP_LIMIT_C: "quente" }), /MQTT_TEMP_LIMIT_C/);
  assert.equal(loadMqttConfig({ MQTT_SCALE_MIN_KG: "2.5" }).scaleMinKg, 2.5);
  assert.equal(loadMqttConfig({}).scaleMinKg, 1.5, "limiar padrão da balança física");
});

test("broker sem usuário e senha só é aceito em bancada de demonstração (fail-closed)", () => {
  const open = loadMqttConfig({});
  assert.throws(() => assertBrokerAuth(open, {}), /MQTT_USERNAME/);
  assert.throws(() => assertBrokerAuth(open, { DEMO_MODE: "verdadeiro" }), /MQTT_USERNAME/, "erro de digitação não abre o canal");
  assert.doesNotThrow(() => assertBrokerAuth(open, { DEMO_MODE: "true" }));
  assert.throws(() => assertBrokerAuth(loadMqttConfig({ MQTT_USERNAME: "ponte" }), {}), /MQTT_PASSWORD/, "usuário sem senha não basta");
  assert.doesNotThrow(() => assertBrokerAuth(loadMqttConfig({ MQTT_USERNAME: "ponte", MQTT_PASSWORD: "segredo" }), {}));
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

test("balança: progress() expõe a fase decidida na última leitura (idle → stabilizing → triggered → disarmed → idle)", () => {
  const scale = new ScaleSurplusDetector(5, 6);
  const step = (s: number, kg: number) => { scale.push({ at: at(s), value: kg }); const p = scale.progress(); return [p.phase, p.stableSeconds]; };
  assert.deepEqual(scale.progress(), { phase: "idle", stableSeconds: 0, minKg: 5, requiredSeconds: 6 }, "antes de qualquer leitura");
  assert.deepEqual(step(0, 0), ["idle", 0]);
  assert.deepEqual(step(2, 4), ["idle", 0], "entre a metade e o mínimo ainda não conta");
  assert.deepEqual(step(4, 5.4), ["stabilizing", 0]);
  assert.deepEqual(step(6, 5.4), ["stabilizing", 2]);
  assert.deepEqual(step(10, 5.4), ["triggered", 6]);
  assert.deepEqual(step(12, 5.4), ["disarmed", 8], "mesma carga: já pediu o lote");
  assert.deepEqual(step(14, 0.1), ["idle", 0], "esvaziou: rearma");
  const failed = new ScaleSurplusDetector(2, 4);
  failed.push({ at: at(0), value: 3 }); failed.push({ at: at(4), value: 3 });
  assert.equal(failed.progress().phase, "triggered");
  failed.rearm();
  assert.equal(failed.progress().phase, "stabilizing", "gravação falhou: volta a contar, não finge lote pedido");
});

test("balança: pedido recusado por lote pendente vira fase 'blocked' (nunca 'triggered' nem 'disarmed') até esvaziar", () => {
  const scale = new ScaleSurplusDetector(5, 6);
  const step = (s: number, kg: number) => { scale.push({ at: at(s), value: kg }); return scale.progress(); };
  step(0, 0); step(2, 6.1); step(4, 6.1); step(6, 6.1);
  assert.equal(step(8, 6.1).phase, "triggered", "a carga estabilizou e pediu o lote");
  scale.markBlocked("lote-pendente");
  assert.deepEqual(scale.progress(), { phase: "blocked", stableSeconds: 6, minKg: 5, requiredSeconds: 6, pendingLotId: "lote-pendente" }, "esta pesagem não virou lote");
  assert.deepEqual([step(10, 6.1).phase, scale.progress().pendingLotId], ["blocked", "lote-pendente"], "a leitura seguinte não diz 'esta pesagem já virou lote'");
  assert.equal(scale.push({ at: at(12), value: 6.1 }).trigger, false, "um pedido por carga: não insiste a cada leitura");
  assert.deepEqual([step(14, 0.1).phase, scale.progress().pendingLotId], ["idle", undefined], "esvaziou: rearma e esquece o bloqueio");
  step(16, 6.1); step(18, 6.1); step(20, 6.1);
  assert.equal(step(22, 6.1).phase, "triggered", "nova carga pede de novo");
  assert.equal(step(24, 6.1).phase, "disarmed", "pedido aceito: fase normal de rearme");
  scale.markBlocked("x");
  assert.equal(scale.progress().phase, "disarmed", "markBlocked só vale logo depois do pedido");
  const failed = new ScaleSurplusDetector(2, 4);
  failed.push({ at: at(0), value: 3 }); failed.push({ at: at(4), value: 3 });
  failed.markBlocked("p"); failed.rearm();
  assert.equal(failed.progress().phase, "stabilizing");
  assert.equal(failed.push({ at: at(6), value: 3 }).trigger, true, "rearme manual limpa o bloqueio");
});
