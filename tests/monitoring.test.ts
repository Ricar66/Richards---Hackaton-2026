import { test } from "node:test";
import assert from "node:assert/strict";
import { deviceConnectivity, OFFLINE_AFTER_SECONDS } from "../src/modules/monitoring/domain/device-connectivity";
import { FlowAlertPolicy } from "../src/modules/monitoring/domain/flow-alert-policy";

const now = new Date("2026-11-07T13:00:00Z");
const ago = (s: number) => new Date(now.getTime() - s * 1000);

test("conectividade vem do último contato, não do valor gravado", () => {
  assert.equal(deviceConnectivity("ONLINE", ago(30), now), "ONLINE");
  assert.equal(deviceConnectivity("ONLINE", ago(OFFLINE_AFTER_SECONDS + 1), now), "OFFLINE", "ONLINE gravado não prova comunicação");
  assert.equal(deviceConnectivity("OFFLINE", ago(5), now), "ONLINE");
  assert.equal(deviceConnectivity("ONLINE", null, now), "NEVER_SEEN");
  assert.equal(deviceConnectivity("MAINTENANCE", ago(5), now), "MAINTENANCE", "manutenção é decisão humana");
});

test("tolerância de buraco entre amostras é configurável", () => {
  const t = (s: number) => new Date(now.getTime() + s * 1000);
  const samples = [0, 40, 80].map(s => ({ capturedAt: t(s), flowLpm: 2, deltaLiters: 0.5 }));
  assert.equal(new FlowAlertPolicy(1.5, 60).evaluate(samples).suspicious, true, "padrão (45 s) aceita saltos de 40 s");
  assert.equal(new FlowAlertPolicy(1.5, 60, 30).evaluate(samples).suspicious, false, "com 30 s o salto de 40 s quebra a janela");
  assert.throws(() => new FlowAlertPolicy(1.5, 60, 0));
});
