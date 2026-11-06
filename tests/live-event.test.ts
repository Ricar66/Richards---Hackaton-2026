import { test } from "node:test";
import assert from "node:assert/strict";
import { LIVE_PAYLOAD_LIMIT, encodeLiveEvent, parseLiveEvent, stampLiveEvent, type LiveEventInput } from "../src/modules/realtime/domain/live-event";

const NOW = new Date("2026-11-06T13:00:00.000Z");
const rejected: LiveEventInput = { type: "message.rejected", orgId: "org-x", channel: "mqtt", reason: "JSON inválido" };
const reading: LiveEventInput = {
  type: "reading.created", orgId: "org-x", deviceId: "d1", deviceCode: "FLOW-01", siteId: "s1", bootId: "boot-1", sequence: 7,
  capturedAt: NOW.toISOString(), flowLpm: 2.5, deltaLiters: 0.6, source: "SIMULATED", channel: "http",
  rule: { minFlowLpm: 1.5, continuousSeconds: 30, observedSeconds: 12, suspicious: false },
  timing: { receivedAt: NOW.toISOString(), emittedAt: NOW.toISOString(), deviceAt: NOW.toISOString() },
};

test("stamp põe versão e hora de emissão; encode → parse devolve o mesmo evento", () => {
  const event = stampLiveEvent(reading, NOW);
  assert.equal(event.v, 1);
  assert.equal(event.emittedAt, NOW.toISOString());
  assert.deepEqual(parseLiveEvent(encodeLiveEvent(event)), event);
});

test("parse recusa JSON quebrado, versão ou tipo desconhecido e campos obrigatórios ausentes (nunca adivinha)", () => {
  const ok = JSON.parse(encodeLiveEvent(stampLiveEvent(rejected, NOW)));
  assert.ok(parseLiveEvent(JSON.stringify(ok)));
  assert.equal(parseLiveEvent("{nao-e-json"), null);
  assert.equal(parseLiveEvent("null"), null);
  assert.equal(parseLiveEvent("42"), null);
  assert.equal(parseLiveEvent(JSON.stringify({ ...ok, v: 2 })), null);
  assert.equal(parseLiveEvent(JSON.stringify({ ...ok, type: "reading.deleted" })), null);
  assert.equal(parseLiveEvent(JSON.stringify({ ...ok, orgId: undefined })), null);
  assert.equal(parseLiveEvent(JSON.stringify({ ...ok, emittedAt: 123 })), null);
});

test("evento acima do limite do NOTIFY vira resync (nunca JSON truncado), contando bytes e não caracteres", () => {
  const big = stampLiveEvent({ ...rejected, reason: "x".repeat(LIVE_PAYLOAD_LIMIT) }, NOW);
  const resync = parseLiveEvent(encodeLiveEvent(big));
  assert.equal(resync?.type, "resync");
  assert.equal(resync?.orgId, "org-x");
  assert.equal(resync?.emittedAt, NOW.toISOString());
  assert.match(resync?.type === "resync" ? resync.reason : "", /message\.rejected/);
  // "ç" ocupa 2 bytes: 4000 caracteres passam de 7500 bytes, mesmo com o texto abaixo de 7500 caracteres.
  const accents = stampLiveEvent({ ...rejected, reason: "ç".repeat(4000) }, NOW);
  assert.ok(JSON.stringify(accents).length < LIVE_PAYLOAD_LIMIT);
  assert.equal(parseLiveEvent(encodeLiveEvent(accents))?.type, "resync");
  const fits = stampLiveEvent({ ...rejected, reason: "x".repeat(1000) }, NOW);
  assert.equal(encodeLiveEvent(fits), JSON.stringify(fits));
  assert.ok(new TextEncoder().encode(encodeLiveEvent(big)).length <= LIVE_PAYLOAD_LIMIT);
});

test("mudança de estado de ocorrência e de lote leva a origem do registro (SIMULATED carimbado no telão)", () => {
  const occ: LiveEventInput = { type: "occurrence.status", orgId: "org-x", id: "oc", deviceId: "d1", kind: "UNUSUAL_FLOW", title: "Fluxo", from: "OPEN", status: "RESOLVED", actor: "operador", source: "SIMULATED" };
  const lot: LiveEventInput = { type: "donation.status", orgId: "org-x", id: "lote", kg: 6, from: "RESERVED", status: "DELIVERED", recipientName: "Cozinha", source: "SIMULATED" };
  for (const input of [occ, lot]) {
    const back = parseLiveEvent(encodeLiveEvent(stampLiveEvent(input, NOW)));
    assert.ok(back && (back.type === "occurrence.status" || back.type === "donation.status"));
    assert.equal(back.source, "SIMULATED", `${input.type} preserva a origem no NOTIFY/SSE`);
  }
  // Evento antigo, sem origem, continua aceito (a tela carimba quando a auditoria do snapshot chega).
  const legacy = parseLiveEvent(JSON.stringify({ ...stampLiveEvent(lot, NOW), source: undefined }));
  assert.equal(legacy?.type, "donation.status");
});

test("fase 'blocked' da balança viaja com o lote pendente", () => {
  const live: LiveEventInput = {
    type: "sensor.live", orgId: "org-x", persisted: false, deviceId: "d1", deviceCode: "BAL", channel: "mqtt", at: NOW.toISOString(),
    scale: { kg: 6.1, source: "DEVICE", progress: { phase: "blocked", minKg: 5, stableSeconds: 6, requiredSeconds: 6, pendingLotId: "lote-pendente" } },
    timing: { receivedAt: NOW.toISOString(), emittedAt: NOW.toISOString() },
  };
  const back = parseLiveEvent(encodeLiveEvent(stampLiveEvent(live, NOW)));
  assert.ok(back?.type === "sensor.live");
  assert.deepEqual([back.scale?.progress.phase, back.scale?.progress.pendingLotId], ["blocked", "lote-pendente"]);
});

test("payload codificado é uma linha só (seguro para o campo data do SSE)", () => {
  const event = stampLiveEvent({ ...rejected, reason: "linha 1\nlinha 2\r\nfim" }, NOW);
  const encoded = encodeLiveEvent(event);
  assert.ok(!/[\r\n]/.test(encoded));
  assert.equal(parseLiveEvent(encoded)?.type, "message.rejected");
});
