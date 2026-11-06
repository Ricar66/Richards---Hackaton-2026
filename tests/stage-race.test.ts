// Cenários adversariais da revisão de 06/11 (corrida do anel, feed, autor, refresh e balança bloqueada).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pipeTone, publicActor, ringView, scaleView, settleRefresh, mergeFeed, lineFromEvent, lineFromAudit } from "../src/components/stage/stage-logic";
import { activeOccurrences, flowOccurrenceFor, initModel, reduceStage, type StageModel } from "../src/components/stage/stage-model";
import type { StageSnapshot } from "../src/modules/analytics/application/get-stage-snapshot";
import type { LiveEvent, ReadingCreatedEvent } from "../src/modules/realtime/domain/live-event";
import { ScaleSurplusDetector } from "../src/modules/monitoring/domain/scale-surplus-detector";

const T0 = Date.parse("2026-11-06T14:00:00Z");
const at = (s: number) => T0 + s * 1000;
const iso = (s: number) => new Date(at(s)).toISOString();
function snapshot(over: Partial<StageSnapshot> = {}): StageSnapshot {
  return {
    serverTime: iso(0), organization: { name: "Org", city: "RP", sites: ["U"] },
    devices: [{ id: "d1", code: "FLOW-001", label: "S", kind: "FLOW", siteName: "U", minFlowLpm: 1.5, continuousSeconds: 30, lastSeenAt: iso(-1), connectivity: "ONLINE", rule: null }],
    readings: [], activeOccurrences: [],
    today: { from: iso(-3600), deliveredKg: { value: 0, provenance: "NONE", sources: [] }, deliveredBatches: 0, pendingReview: { value: 0, provenance: "NONE", sources: [] }, activeOccurrences: { value: 0, provenance: "NONE", sources: [] } },
    pendingScaleLots: [], audit: [], ...over,
  };
}
const reading = (s: number, flow: number, obs: number, seq: number, extra: Partial<ReadingCreatedEvent> = {}): LiveEvent => ({
  v: 1, type: "reading.created", orgId: "o", emittedAt: new Date(at(s) + 20).toISOString(), deviceId: "d1", deviceCode: "FLOW-001", siteId: "s",
  bootId: "b1", sequence: seq, capturedAt: iso(s), flowLpm: flow, deltaLiters: flow / 30, source: "SIMULATED", channel: "http",
  rule: { minFlowLpm: 1.5, continuousSeconds: 30, observedSeconds: obs, suspicious: obs >= 30 },
  timing: { receivedAt: new Date(at(s) + 5).toISOString(), emittedAt: new Date(at(s) + 20).toISOString() }, ...extra,
});
const ev = (m: StageModel, e: LiveEvent, arrivalS: number) => reduceStage(m, { type: "event", event: e, arrivalMs: at(arrivalS) });
const ringOf = (m: StageModel, nowS: number) => ringView({ rule: m.rules.d1 ?? null, broken: m.broken.d1 ?? null, occurrence: flowOccurrenceFor(m, "d1"), nowMs: at(nowS), minFlowLpm: 1.5, continuousSeconds: 30 });
const opened = (s: number, id = "X", source: "DEVICE" | "SIMULATED" = "SIMULATED"): LiveEvent => ({ v: 1, type: "occurrence.opened", orgId: "o", emittedAt: iso(s), id, deviceId: "d1", deviceCode: "FLOW-001", kind: "UNUSUAL_FLOW", severity: "HIGH", title: "Fluxo", source, openedAt: iso(s) });
const status = (s: number, st: "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED", id = "X"): LiveEvent => ({ v: 1, type: "occurrence.status", orgId: "o", emittedAt: iso(s), id, deviceId: "d1", kind: "UNUSUAL_FLOW", title: "Fluxo", from: "ACKNOWLEDGED", status: st, actor: "operador", source: "SIMULATED" });

test("corrida: leitura com occurrenceId=X chega DEPOIS do RESOLVED e depois do pedido do snapshot", () => {
  let m = initModel(snapshot());
  m = reduceStage(m, { type: "hello", serverTime: iso(0), arrivalMs: at(0) });
  m = ev(m, opened(32), 32.01);
  for (let s = 0; s <= 52; s += 4) m = ev(m, reading(s, 2.5, s, s / 4, s >= 32 ? { occurrenceId: "X" } : {}), s + 0.03);
  m = ev(m, status(70, "RESOLVED"), 70.0);
  // a ingestão leu X ainda ativa e só avisou depois do commit do RESOLVED; chega depois do pedido do snapshot (70,25)
  m = ev(m, reading(56, 2.5, 56, 14, { occurrenceId: "X" }), 70.3);
  m = reduceStage(m, { type: "snapshot", snapshot: snapshot({ serverTime: iso(70.4) }), requestedAt: at(70.25), receivedAt: at(70.5) });
  assert.equal(flowOccurrenceFor(m, "d1"), null);
  const r = ringOf(m, 70.6);
  assert.notEqual(r.state, "OCORRENCIA_ABERTA", r.detail);
  assert.notEqual(pipeTone(r.state, r.foreign), "danger");
  // mais tarde, sem leitura nova
  m = reduceStage(m, { type: "snapshot", snapshot: snapshot({ serverTime: iso(700) }), requestedAt: at(699.9), receivedAt: at(700.1) });
  assert.notEqual(ringOf(m, 700.2).state, "OCORRENCIA_ABERTA");
  assert.equal(activeOccurrences(m).length, 0);
});

test("ocorrência ASSUMIDA continua no anel depois do snapshot (a limpeza não apaga ativa)", () => {
  let m = initModel(snapshot());
  m = reduceStage(m, { type: "hello", serverTime: iso(0), arrivalMs: at(0) });
  m = ev(m, opened(32), 32.01);
  for (let s = 0; s <= 40; s += 4) m = ev(m, reading(s, 2.5, s, s / 4, s >= 32 ? { occurrenceId: "X" } : {}), s + 0.03);
  m = ev(m, status(45, "ACKNOWLEDGED"), 45);
  const occ = { id: "X", kind: "UNUSUAL_FLOW", severity: "HIGH", status: "ACKNOWLEDGED", title: "Fluxo", source: "SIMULATED" as const, deviceId: "d1", deviceCode: "FLOW-001", openedAt: iso(32) };
  m = reduceStage(m, { type: "snapshot", snapshot: snapshot({ serverTime: iso(45.4), activeOccurrences: [occ] }), requestedAt: at(45.25), receivedAt: at(45.5) });
  const r = ringOf(m, 45.6);
  assert.equal(r.state, "OCORRENCIA_ABERTA");
  assert.equal(r.occurrenceSeal?.label, "OCORRÊNCIA SIMULADA");
  assert.equal(pipeTone(r.state, r.foreign), "danger", "mesma origem: cano vermelho");
});

test("caminho principal com sensor REAL: aberta pela contagem, sem selo extra, cano vermelho, hora real", () => {
  let m = initModel(snapshot());
  m = reduceStage(m, { type: "hello", serverTime: iso(0), arrivalMs: at(0) });
  const real = { source: "DEVICE" as const };
  for (let s = 0; s < 32; s += 4) m = ev(m, reading(s, 2.5, s, s / 4, real), s + 0.03);
  m = ev(m, opened(32.1, "R", "DEVICE"), 32.15);
  m = ev(m, reading(32, 2.5, 32, 8, { ...real, occurrenceId: "R" }), 32.2);
  const r = ringOf(m, 32.3);
  assert.equal(r.state, "OCORRENCIA_ABERTA");
  assert.equal(r.occurrenceSeal, null);
  assert.equal(pipeTone(r.state, r.foreign), "danger");
});

test("publicActor: casos de borda", () => {
  for (const [i, o] of [["operador:", "operador"], ["x:operador:", "x:operador"], ["operador", "operador"], ["preparacao:", "preparação do palco"], ["simulador:preparacao:Victor Hugo", "simulador:preparação do palco"], ["dispositivo:A:B", "dispositivo:A:B"], ["", "—"], ["a:", "a:"]] as const)
    assert.equal(publicActor(i), o, i);
});

test("refresh: falha antiga com o mesmo id do aplicado e sequência longa", () => {
  let g = { applied: 0, failed: 0 };
  const s = (id: number, ok: boolean) => { const v = settleRefresh(g, id, ok); g = v.gate; return v; };
  s(7, true); // B
  assert.equal(s(6, false).error, "keep");
  assert.equal(s(8, false).error, "set");
  assert.equal(s(9, true).error, "clear");
});

test("feed: linha com origem nunca é rebaixada por linha sem origem", () => {
  const a = lineFromAudit({ id: "a", at: iso(10), entity: "DonationBatch", entityId: "L", action: "DELIVERED", actor: "operador", title: "H", source: "SIMULATED", kg: 6, institution: "C", severity: null, deviceCode: null })!;
  const e = lineFromEvent({ v: 1, type: "donation.status", orgId: "o", emittedAt: iso(10), id: "L", kg: 6, from: "RESERVED", status: "DELIVERED" } as LiveEvent)!;
  assert.equal(mergeFeed(mergeFeed([], [a]), [e])[0].source, "SIMULATED");
  assert.equal(mergeFeed([], [e, a])[0].source, "SIMULATED", "mesmo lote, evento e auditoria no mesmo merge");
});

test("balança: pendente verificado no meio, carga mantida, depois esvazia e nova carga cria lote", () => {
  const d = new ScaleSurplusDetector(5, 6);
  const p = (s: number, kg: number) => { d.push({ at: new Date(at(s)), value: kg }); return d.progress().phase; };
  p(0, 6.1); p(2, 6.1); p(4, 6.1);
  const trig = d.push({ at: new Date(at(6)), value: 6.1 });
  assert.equal(trig.trigger, true);
  d.markBlocked("velho");
  assert.equal(d.progress().phase, "blocked");
  assert.equal(p(8, 6.1), "blocked");
  assert.equal(p(10, 0), "idle");
  p(12, 6.0); p(14, 6.0); p(16, 6.0);
  assert.equal(d.push({ at: new Date(at(18)), value: 6.0 }).trigger, true, "rearma depois de esvaziar");
  assert.equal(d.progress().phase, "triggered");
  assert.equal(p(20, 6.0), "disarmed");
  const v = scaleView({ deviceId: "d", deviceCode: "B", kg: 6.1, source: "DEVICE", channel: "mqtt", progress: { phase: "blocked", minKg: 5, stableSeconds: 6, requiredSeconds: 6, pendingLotId: "velho" }, at: at(8) }, { id: "velho", kg: 5.3, deviceCode: "B", at: at(-600) }, at(9));
  assert.match(`${v.label} ${v.sub}`, /já existe lote/, "pesagem bloqueada não diz que virou lote");
  assert.doesNotMatch(`${v.label} ${v.sub}`, /lote criado|virou lote/);
});
