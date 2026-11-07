import { test } from "node:test";
import assert from "node:assert/strict";
import { publicReadings } from "../src/modules/audience/public-feed";
import { stampLiveEvent, type LiveEventInput } from "../src/modules/realtime/domain/live-event";
const at = "2026-11-07T11:20:00.000Z";
test("plateia recebe apenas campos explícitos da vazão e preserva SIMULATED", () => {
  const e: LiveEventInput = { type: "reading.created", orgId: "privado", deviceId: "id-privado", deviceCode: "HORT-01", siteId: "unidade-privada",
    bootId: "boot-secreto", sequence: 4, capturedAt: at, flowLpm: 2.5, deltaLiters: 1.2, source: "SIMULATED", channel: "mqtt",
    rule: { minFlowLpm: 1.5, continuousSeconds: 30, observedSeconds: 0, suspicious: false },
    timing: { receivedAt: at, emittedAt: at } };
  const [r] = publicReadings(stampLiveEvent(e));
  assert.deepEqual(r, { kind: "flow", deviceCode: "HORT-01", at, source: "SIMULATED", flowLpm: 2.5 });
});
test("temperatura e balança são eventos públicos distintos com origem independente", () => {
  const e: LiveEventInput = { type: "sensor.live", orgId: "org", persisted: false, deviceId: "priv", deviceCode: "HORT-01", at, channel: "mqtt",
    temperature: { c: 27, humidityPct: 65, source: "DEVICE", rule: { limitC: 28, continuousSeconds: 30, observedSeconds: 0, suspicious: false } },
    scale: { kg: 1.62, source: "SIMULATED", progress: { phase: "stabilizing", minKg: 1.5, stableSeconds: 3, requiredSeconds: 6 } },
    timing: { receivedAt: at, emittedAt: at } };
  const r = publicReadings(stampLiveEvent(e));
  assert.deepEqual(r,[],"grandezas retiradas não são publicadas");

  assert.ok(!JSON.stringify(r).includes("priv"));
});
test("atores, nomes e notas privadas NUNCA são encaminhados", () => {
  const status: LiveEventInput = { type: "donation.status", orgId: "org", id: "id", kg: 2, from: "RESERVED", status: "DELIVERED", recipientName: "Instituição", source: "DEVICE" };
  assert.deepEqual(publicReadings(stampLiveEvent(status)), []);
  const manual: LiveEventInput = { type: "donation.created", orgId: "org", id: "id", kg: 2, status: "PENDING_REVIEW", description: "Descrição privada", origin: "manual", source: "MANUAL" };
  assert.deepEqual(publicReadings(stampLiveEvent(manual)), []);
  const scale: LiveEventInput = { type: "donation.created", orgId: "org", id: "id-secreto", kg: 1.5, status: "PENDING_REVIEW", description: "Privado", origin: "scale", deviceCode: "HORT-01", source: "DEVICE" };
  assert.deepEqual(publicReadings(stampLiveEvent(scale, new Date(at))), []);
});
