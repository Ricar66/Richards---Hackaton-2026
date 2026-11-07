import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clockBR, lineFromAudit, lineFromEvent, mergeFeed, occurrenceSeal, originSeal, pickFocus, pipeTone, publicActor, ringView, ruleTransition, scaleView, sensorSeal,
  settleRefresh, stripSegments, temperatureView, tripView, type RingOccurrence, type RuleTrack, type StripPoint,
} from "../src/components/stage/stage-logic";
import { activeOccurrences, flowOccurrenceFor, focusSource, initModel, reduceStage, type StageModel } from "../src/components/stage/stage-model";
import type { StageSnapshot } from "../src/modules/analytics/application/get-stage-snapshot";
import type { LiveEvent, ReadingCreatedEvent } from "../src/modules/realtime/domain/live-event";

const T0 = Date.parse("2026-11-07T14:00:00Z");
const at = (s: number) => T0 + s * 1000;
const iso = (s: number) => new Date(at(s)).toISOString();
const rule = (p: Partial<RuleTrack> = {}): RuleTrack => ({ minFlowLpm: 1.5, continuousSeconds: 30, observedSeconds: 0, suspicious: false, at: at(0), flowLpm: 0, source: "SIMULATED", sequence: 1, ...p });
const ring = (r: RuleTrack | null, o: { now?: number; occurrence?: RingOccurrence | null; broken?: { seconds: number; at: number } | null } = {}) =>
  ringView({ rule: r, broken: o.broken ?? null, occurrence: o.occurrence ?? null, nowMs: o.now ?? at(1), minFlowLpm: 1.5, continuousSeconds: 30 });
const occ = (openedAt: number | null, source: RingOccurrence["source"] = "SIMULATED", id = "oc"): RingOccurrence => ({ id, openedAt, source });

test("autor no telão nunca leva o usuário do operador", () => {
  assert.equal(publicActor("operador:ricardo"), "operador");
  assert.equal(publicActor("simulador:operador:admin"), "simulador:operador");
  assert.equal(publicActor("dispositivo:RICHARDS-FLOW-001"), "dispositivo:RICHARDS-FLOW-001");
  assert.equal(publicActor("acesso-local-sem-autenticacao"), "operador local");
  assert.equal(publicActor("preparacao:ricardo.moretti"), "preparação do palco", "usuário do Windows não vai ao telão");
  assert.equal(publicActor(null), "—");
});

test("autor no telão: usuário com espaço sai INTEIRO (máscara por prefixo, não até o primeiro espaço)", () => {
  assert.equal(publicActor("operador:Fulano Silva"), "operador", "o sobrenome é parte da credencial Basic");
  assert.equal(publicActor("preparacao:Victor Hugo"), "preparação do palco", "usuário do Windows com espaço");
  assert.equal(publicActor("simulador:operador:Fulano Silva"), "simulador:operador", "autor composto do 'Simular alerta'");
  assert.equal(publicActor("simulador:acesso-local-sem-autenticacao"), "simulador:operador local");
  assert.equal(publicActor("simulador:RICHARDS-FLOW-001"), "simulador:RICHARDS-FLOW-001", "código de dispositivo não é segredo");
  assert.doesNotMatch(["operador:Fulano Silva", "preparacao:Victor Hugo", "simulador:operador:Fulano Silva"].map(publicActor).join(" "), /Silva|Hugo|Fulano|Victor/);
});

test("selo global pela origem dos pacotes do último minuto", () => {
  const now = at(100);
  assert.equal(originSeal([], now), "NONE");
  assert.equal(originSeal([{ at: at(95), source: "DEVICE" }], now), "DEVICE");
  assert.equal(originSeal([{ at: at(95), source: "SIMULATED" }], now), "SIMULATED");
  assert.equal(originSeal([{ at: at(95), source: "SIMULATED" }, { at: at(90), source: "DEVICE" }], now), "MIXED");
  assert.equal(originSeal([{ at: at(10), source: "DEVICE" }, { at: at(99), source: "SIMULATED" }], now), "SIMULATED", "pacote real de 90 s atrás não conta");
  assert.equal(originSeal([{ at: at(99), source: "MANUAL" }], now), "NONE", "registro manual não é pacote de sensor");
});

test("selo do instrumento diz o sensor físico (potenciômetro nunca vira YF-S201)", () => {
  assert.deepEqual(sensorSeal("flow", "SIMULATED", "mqtt"), { label: "POTENCIÔMETRO · SIMULADO", simulated: true });
  assert.deepEqual(sensorSeal("flow", "DEVICE", "http"), { label: "YF-S201 · SENSOR", simulated: false });
  assert.equal(sensorSeal("scale", "SIMULATED", "bancada-virtual").label, "BANCADA VIRTUAL · SIMULADO");
  assert.equal(sensorSeal("temperature", "DEVICE", "mqtt").label, "DHT11 · SENSOR");
  assert.equal(sensorSeal("flow", "SIMULATED").label, "SIMULADO", "sem canal (snapshot): só o carimbo");
});

test("anel: observando, contando com segundos decididos e nada entre leituras", () => {
  assert.equal(ring(null).state, "OBSERVANDO");
  assert.match(ring(null).detail, /primeira leitura/);
  assert.equal(ring(rule({ flowLpm: 0.4 })).state, "OBSERVANDO");
  const counting = rule({ flowLpm: 2.4, observedSeconds: 18.7 });
  const v = ring(counting, { now: at(1) });
  assert.equal(v.state, "CONTANDO");
  assert.equal(v.observed, 18, "segundos inteiros, arredondados para baixo");
  assert.equal(v.detail, "abre em 12 s");
  assert.equal(ring(counting, { now: at(20) }).observed, 18, "o relógio andar não avança a contagem: só leitura nova");
  const stale = ring(counting, { now: at(46) });
  assert.equal(stale.state, "OBSERVANDO", "decisão velha (> 45 s) não vale");
  assert.match(stale.detail, /sem leitura há 46 s/);
  assert.equal(ring(rule({ flowLpm: 2.4, observedSeconds: 0 })).state, "CONTANDO", "primeira amostra acima do limiar já conta (0 s)");
});

test("anel: interrompido, ocorrência aberta e bloqueio pela regra 5", () => {
  const broken = ring(rule({ flowLpm: 0.2 }), { broken: { seconds: 12, at: at(0) }, now: at(5) });
  assert.equal(broken.state, "INTERROMPIDO");
  assert.match(broken.detail, /parou em 12 s/);
  assert.equal(ring(rule({ flowLpm: 0.2 }), { broken: { seconds: 12, at: at(0) }, now: at(25) }).state, "OBSERVANDO", "o aviso some depois de 20 s");

  // (A ocorrência agora entra com id e origem: "aberta por esta contagem" exige a mesma origem da leitura.)
  const run = rule({ flowLpm: 2.5, observedSeconds: 33, suspicious: true, at: at(33) });
  const opened = ring(run, { occurrence: occ(at(33)), now: at(34) });
  assert.equal(opened.state, "OCORRENCIA_ABERTA", "aberta por esta contagem");
  assert.equal(opened.fraction, 1);

  const seed = occ(at(-16 * 60));
  const blocked = ring(rule({ flowLpm: 2.5, observedSeconds: 12, at: at(12) }), { occurrence: seed, now: at(13) });
  assert.equal(blocked.state, "BLOQUEADO_REGRA_5");
  assert.equal(blocked.observed, 12, "a contagem continua visível");
  assert.match(blocked.detail, /já existe ocorrência de fluxo ativa/);
  assert.equal(ring(rule({ flowLpm: 0, at: at(12) }), { occurrence: seed, now: at(13) }).state, "OCORRENCIA_ABERTA", "sem fluxo: a ocorrência ativa é o estado");
});

test("anel: ocorrência de outra origem nunca vira mérito do sensor em foco e ganha selo próprio", () => {
  // YF-S201 real contando 12 s; o operador clica "Simular alerta" (UNUSUAL_FLOW SIMULATED no mesmo dispositivo).
  const real = rule({ flowLpm: 2.4, observedSeconds: 12, at: at(12), source: "DEVICE" });
  const sim = ring(real, { occurrence: occ(at(12), "SIMULATED"), now: at(13) });
  assert.equal(sim.state, "BLOQUEADO_REGRA_5", "a contagem do sensor real não abriu nada");
  assert.equal(sim.fraction, 12 / 30, "nada de 60 traços acesos com 12 s de 30 s");
  assert.deepEqual(sim.occurrenceSeal, { label: "OCORRÊNCIA SIMULADA", tone: "sim" });
  assert.equal(sim.foreign, true);
  assert.equal(pipeTone(sim.state, sim.foreign), "warn", "o cano mostra a contagem do sensor, não a ocorrência simulada");
  // Sensor real parado e ocorrência simulada ativa: o anel mostra a ocorrência, mas carimbada.
  const still = ring(rule({ flowLpm: 0, at: at(12), source: "DEVICE" }), { occurrence: occ(at(5), "SIMULATED"), now: at(13) });
  assert.equal(still.state, "OCORRENCIA_ABERTA");
  assert.equal(still.occurrenceSeal?.label, "OCORRÊNCIA SIMULADA");
  assert.equal(pipeTone(still.state, still.foreign), "ok", "cano vermelho só para ocorrência da mesma origem da leitura");
  // Mesma origem, mas aberta durante a contagem sem a regra ter chegado ao limite (outro "Simular alerta"): bloqueio.
  const simRun = ring(rule({ flowLpm: 2.4, observedSeconds: 12, at: at(12) }), { occurrence: occ(at(11), "SIMULATED"), now: at(13) });
  assert.equal(simRun.state, "BLOQUEADO_REGRA_5");
  assert.equal(simRun.occurrenceSeal?.label, "OCORRÊNCIA SIMULADA", "simulada é sempre carimbada");
  // Leitura ligada a OUTRA ocorrência (id diferente) não conta como aberta por esta contagem.
  const other = ring(rule({ flowLpm: 2.5, observedSeconds: 33, suspicious: true, at: at(33), source: "DEVICE", occurrenceId: "oc-x" }), { occurrence: occ(at(33), "DEVICE", "oc-y"), now: at(34) });
  assert.equal(other.state, "BLOQUEADO_REGRA_5");
  // Sensor real que abriu a própria ocorrência: aberta, sem selo extra (o instrumento já diz SENSOR), cano vermelho.
  const own = ring(rule({ flowLpm: 2.5, observedSeconds: 33, suspicious: true, at: at(33), source: "DEVICE", occurrenceId: "oc" }), { occurrence: occ(at(33), "DEVICE"), now: at(34) });
  assert.equal(own.state, "OCORRENCIA_ABERTA");
  assert.equal(own.occurrenceSeal, null);
  assert.equal(pipeTone(own.state, own.foreign), "danger");
  // Hora e origem ainda desconhecidas (só a leitura apontou o id): nada é inventado.
  const unknown = ring(rule({ flowLpm: 2.5, observedSeconds: 33, suspicious: true, at: at(33), occurrenceId: "oc" }), { occurrence: occ(null, null), now: at(34) });
  assert.equal(unknown.state, "BLOQUEADO_REGRA_5", "sem a origem, não se afirma que esta contagem abriu a ocorrência");
  assert.equal(unknown.occurrenceSeal?.label, "ORIGEM A CONFIRMAR");
  assert.doesNotMatch(unknown.detail, /\d\d:\d\d/, "sem horário inventado");
});

test("selo da ocorrência: simulada sempre; real só quando a leitura em foco é de outra origem", () => {
  assert.deepEqual(occurrenceSeal("SIMULATED", "SIMULATED"), { label: "OCORRÊNCIA SIMULADA", tone: "sim" });
  assert.deepEqual(occurrenceSeal("SIMULATED", "DEVICE"), { label: "OCORRÊNCIA SIMULADA", tone: "sim" });
  assert.equal(occurrenceSeal("DEVICE", "DEVICE"), null);
  assert.deepEqual(occurrenceSeal("DEVICE", "SIMULATED"), { label: "OCORRÊNCIA DO SENSOR", tone: "real" });
  assert.equal(occurrenceSeal("DEVICE", null)?.label, "OCORRÊNCIA DO SENSOR", "sem leitura para comparar: diz a origem");
  assert.equal(occurrenceSeal(null, "DEVICE")?.label, "ORIGEM A CONFIRMAR", "origem desconhecida nunca é presumida real");
});

test("viagem: só trechos medidos, ≈ com ajuste de relógio e nada de soma com trecho desconhecido", () => {
  const timing = { receivedAt: iso(0), emittedAt: new Date(at(0) + 31).toISOString() };
  const sample = { kind: "leitura" as const, channel: "mqtt" as const, source: "SIMULATED" as const, deviceCode: "D1", sequence: 7, timing, arrivalMs: at(0) + 31 + 12 };
  const v = tripView(sample, 0, true);
  assert.equal(v.processingMs, 31);
  assert.equal(v.deliveryMs, 12);
  assert.equal(v.serverToScreenMs, 43);
  assert.equal(v.deviceMs, null, "MQTT não manda horário");
  assert.equal(v.totalMs, null, "sem o trecho do dispositivo não há total");
  assert.equal(v.approx, false);
  const skewed = tripView({ ...sample, arrivalMs: at(0) + 31 + 12 - 800 }, 800, true);
  assert.equal(skewed.deliveryMs, 12, "o ajuste do hello corrige a entrega");
  assert.equal(skewed.approx, true, "ajuste > 500 ms ganha ≈");
  assert.equal(tripView(sample, 0, false).approx, true, "sem hello o ajuste é desconhecido");
  const http = tripView({ ...sample, channel: "http", timing: { ...timing, deviceAt: new Date(at(0) - 212).toISOString() } }, 0, true);
  assert.equal(http.deviceMs, 212);
  assert.equal(http.totalMs, 255);
  assert.equal(tripView({ ...sample, arrivalMs: at(0) - 5000 }, 0, true).deliveryMs, null, "entrega negativa = relógio errado, não vira número");
});

test("faixa: buraco > 45 s ou troca de origem interrompe a linha, e ela termina na última amostra", () => {
  const p = (s: number, v: number, source: StripPoint["source"] = "DEVICE"): StripPoint => ({ t: at(s), v, source });
  const segs = stripSegments([p(0, 1), p(15, 2), p(30, 2), p(80, 2), p(82, 2, "SIMULATED"), p(84, 2.4, "SIMULATED")], at(-10), at(90));
  assert.equal(segs.length, 3);
  assert.deepEqual(segs.map(s => s.length), [3, 1, 2], "50 s sem amostra quebra; origem nova quebra");
  assert.equal(segs.at(-1)!.at(-1)!.t, at(84), "nenhum ponto inventado em 'agora'");
  assert.equal(stripSegments([p(100, 1)], at(0), at(90)).length, 0, "amostra no futuro do recorte não entra");
});

test("balança: fases decididas pela ponte e lote só depois de gravado", () => {
  const s = (phase: "idle" | "stabilizing" | "triggered" | "disarmed", kg: number, stable = 0) => ({ deviceId: "d", deviceCode: "BAL", kg, source: "DEVICE" as const, channel: "mqtt" as const, progress: { phase, minKg: 1, stableSeconds: stable, requiredSeconds: 6 }, at: at(0) });
  assert.equal(scaleView(s("idle", 0), null, at(1)).label, "vazia");
  assert.equal(scaleView(s("stabilizing", 6.2, 0.4), null, at(1)).label, "instável");
  const st = scaleView(s("stabilizing", 6.2, 4.6), null, at(1));
  assert.equal(st.label, "estabilizando 4/6 s");
  assert.equal(st.lit, 4);
  assert.equal(st.total, 6);
  assert.equal(scaleView(s("triggered", 6.2, 6), null, at(1)).label, "lote pedido ao servidor", "sem confirmação do banco não diz que criou");
  const lot = { id: "l1", kg: 6.2, deviceCode: "BAL", source: "DEVICE" as const, at: at(1) };
  assert.equal(scaleView(s("triggered", 6.2, 6), lot, at(1)).label, "lote criado · aguardando verificação humana");
  assert.equal(scaleView(s("disarmed", 6.2, 6), lot, at(1)).label, "esvazie para rearmar");
  assert.equal(scaleView(s("idle", 0), null, at(40)).stale, true);
});

test("balança: pesagem recusada por lote pendente diz 'nada novo criado', nunca que esta pesagem virou lote", () => {
  const blocked = { deviceId: "d", deviceCode: "BAL", kg: 6.1, source: "DEVICE" as const, channel: "mqtt" as const, progress: { phase: "blocked" as const, minKg: 1, stableSeconds: 6, requiredSeconds: 6, pendingLotId: "l-old" }, at: at(0) };
  const pending = { id: "l-old", kg: 5.3, deviceCode: "BAL", source: "DEVICE" as const, at: at(-600) };
  const v = scaleView(blocked, pending, at(1));
  assert.equal(v.phase, "bloqueada");
  assert.equal(`${v.label} · ${v.sub}`.startsWith("já existe lote desta balança aguardando verificação · nada novo criado"), true, `${v.label} · ${v.sub}`);
  assert.match(v.sub, /5,3 kg/, "o kg mostrado é o do lote PENDENTE, identificado como tal");
  assert.doesNotMatch(`${v.label} ${v.sub}`, /lote criado|virou lote/);
  const unknown = scaleView(blocked, null, at(1));
  assert.equal(unknown.label, "nada novo criado", "sem o lote na tela (verificado nesse meio-tempo?): não afirma que ele segue pendente");
  assert.doesNotMatch(`${unknown.label} ${unknown.sub}`, /lote criado|virou lote/);
});

test("temperatura: limite, progresso da regra e indício (nunca perda)", () => {
  const t = (c: number, observed: number, suspicious = false) => ({ deviceId: "d", deviceCode: "D", c, source: "DEVICE" as const, channel: "mqtt" as const, rule: { limitC: 28, continuousSeconds: 30, observedSeconds: observed, suspicious }, at: at(0) });
  assert.equal(temperatureView(t(24.6, 0), at(1)).state, "normal");
  const counting = temperatureView(t(29.1, 12.9), at(1));
  assert.equal(counting.state, "contando");
  assert.equal(counting.observed, 12);
  assert.match(counting.label, /12 s de 30 s/);
  assert.match(temperatureView(t(30, 31, true), at(1)).label, /indício a verificar/);
});

test("feed: instituição sim, quem recebeu nunca; evento e auditoria do mesmo fato não duplicam", () => {
  const delivered = { v: 1, type: "donation.status", orgId: "o", emittedAt: iso(10), id: "lote-1", kg: 6.2, from: "RESERVED", status: "DELIVERED", recipientName: "Cozinha Comunitária", receivedBy: "Maria da Silva" } as unknown as LiveEvent;
  const line = lineFromEvent(delivered)!;
  assert.match(line.title, /Lote entregue · 6,2 kg/);
  assert.match(line.detail, /Cozinha Comunitária/);
  assert.doesNotMatch(JSON.stringify(line), /Maria/, "nome de quem recebeu não vai para o telão");
  const audit = lineFromAudit({ id: "a", at: iso(11), entity: "DonationBatch", entityId: "lote-1", action: "DELIVERED", actor: "operador", title: "Hortaliças", source: "MANUAL", kg: 6.2, institution: "Cozinha Comunitária", severity: null, deviceCode: null });
  const feed = mergeFeed(mergeFeed([], [line]), [audit]);
  assert.equal(feed.length, 1);
  assert.equal(feed[0].source, "MANUAL", "evento sem origem (antigo) ganha a origem da auditoria do mesmo fato");
  const status = lineFromEvent({ v: 1, type: "occurrence.status", orgId: "o", emittedAt: iso(12), id: "oc", deviceId: "d", kind: "UNUSUAL_FLOW", title: "Fluxo contínuo", from: "OPEN", status: "ACKNOWLEDGED", actor: "operador:ricardo" } as LiveEvent)!; // evento antigo, sem origem
  assert.equal(status.title, "Ocorrência assumida");
  assert.doesNotMatch(status.detail, /ricardo/);
  const rejected = lineFromEvent({ v: 1, type: "message.rejected", orgId: "o", emittedAt: iso(13), channel: "mqtt", reason: "JSON inválido" })!;
  assert.equal(rejected.title, "Mensagem descartada");
  assert.equal(lineFromEvent({ v: 1, type: "resync", orgId: "o", emittedAt: iso(1), reason: "x" }), null);
  const sorted = mergeFeed(feed, [status, rejected]);
  assert.deepEqual(sorted.map(l => l.title), ["Mensagem descartada", "Ocorrência assumida", "Lote entregue · 6,2 kg"], "mais novo no topo");
});

test("feed: mudança de estado de lote ou ocorrência SIMULATED chega carimbada e o selo não se perde", () => {
  const delivered: LiveEvent = { v: 1, type: "donation.status", orgId: "o", emittedAt: iso(10), id: "richards-don-02", kg: 6, from: "RESERVED", status: "DELIVERED", recipientName: "Cozinha Comunitária", source: "SIMULATED" };
  assert.equal(lineFromEvent(delivered)!.source, "SIMULATED", "Lote entregue · 6 kg do seed: SIMULADO no telão");
  const resolved: LiveEvent = { v: 1, type: "occurrence.status", orgId: "o", emittedAt: iso(11), id: "oc", deviceId: "d1", kind: "UNUSUAL_FLOW", title: "Fluxo contínuo", from: "ACKNOWLEDGED", status: "RESOLVED", actor: "operador", source: "SIMULATED" };
  assert.equal(lineFromEvent(resolved)!.source, "SIMULATED");
  // A ordem inversa (auditoria primeiro) também termina carimbada, e linha com origem nunca perde a origem.
  const audited = mergeFeed(mergeFeed([], [lineFromAudit({ id: "b", at: iso(12), entity: "Occurrence", entityId: "oc2", action: "RESOLVED", actor: "operador", title: "Fluxo", source: "SIMULATED", kg: null, institution: null, severity: null, deviceCode: null })]),
    [{ key: "occ:oc2:RESOLVED", at: at(12), tone: "ok", title: "Ocorrência resolvida", detail: "x", source: null }]);
  assert.equal(audited[0].source, "SIMULATED");
});

test("snapshot: a falha de uma consulta antiga não põe a faixa de erro sobre o sucesso de uma mais nova", () => {
  let g = { applied: 0, failed: 0 };
  const step = (id: number, ok: boolean) => { const v = settleRefresh(g, id, ok); g = v.gate; return [v.apply, v.error]; };
  assert.deepEqual(step(1, true), [true, "clear"]);
  // A (id 2) sai com o banco lento; B (id 3) sai depois e responde primeiro; A falha por último.
  assert.deepEqual(step(3, true), [true, "clear"]);
  assert.deepEqual(step(2, false), [false, "keep"], "erro antigo não sobrescreve o sucesso mais novo");
  assert.deepEqual(step(2, true), [false, "keep"], "resposta antiga não volta o estado no tempo");
  // Falha nova continua aparecendo; um sucesso mais VELHO que a falha aplica o dado, mas não apaga a faixa.
  assert.deepEqual(step(5, false), [false, "set"]);
  assert.deepEqual(step(4, true), [true, "keep"]);
  assert.deepEqual(step(6, true), [true, "clear"], "sucesso mais novo que a falha limpa a faixa");
});

test("transições da regra viram linha só quando a decisão do servidor muda", () => {
  const ctx = { key: "k", emittedAt: at(0), deviceCode: "D1", source: "SIMULATED" as const, minFlowLpm: 1.5, continuousSeconds: 30 };
  assert.equal(ruleTransition(undefined, { above: true, observed: 0, at: at(0) }, ctx)[0].title, "Regra começou a contar");
  assert.equal(ruleTransition({ above: true, observed: 4, at: at(0) }, { above: true, observed: 6, at: at(2) }, ctx).length, 0);
  const reset = ruleTransition({ above: true, observed: 12.8, at: at(0) }, { above: false, observed: 0, at: at(2) }, ctx);
  assert.equal(reset[0].title, "Contagem zerada");
  assert.match(reset[0].detail, /parou em 12 s de 30 s/);
  assert.equal(ruleTransition({ above: true, observed: 40, at: at(0) }, { above: true, observed: 0, at: at(60) }, ctx)[0].title, "Contagem reiniciada");
  assert.equal(ruleTransition({ above: true, observed: 4, at: at(10) }, { above: false, observed: 0, at: at(5) }, ctx).length, 0, "leitura fora de ordem não gera linha");
});

test("foco: fixado na URL, estável enquanto o sensor fala e senão o mais recente", () => {
  const devices = [{ id: "a", code: "FLOW-A", kind: "FLOW", lastSeenAt: null }, { id: "b", code: "FLOW-B", kind: "FLOW", lastSeenAt: null }];
  assert.equal(pickFocus(devices, { a: at(0), b: at(5) }, { pinnedCode: "flow-a", currentId: null, nowMs: at(6) }), "a");
  assert.equal(pickFocus(devices, { a: at(0), b: at(5) }, { pinnedCode: null, currentId: null, nowMs: at(6) }), "b");
  assert.equal(pickFocus(devices, { a: at(0), b: at(5) }, { pinnedCode: null, currentId: "a", nowMs: at(6) }), "a", "não pula de sensor a cada pacote");
  assert.equal(pickFocus(devices, { a: at(0), b: at(40) }, { pinnedCode: null, currentId: "a", nowMs: at(41) }), "b", "o atual calou há mais de 30 s");
  assert.equal(pickFocus(devices, {}, { pinnedCode: null, currentId: null, nowMs: at(0) }), "a");
});

// ---------- redutor ----------
function snapshot(over: Partial<StageSnapshot> = {}): StageSnapshot {
  return {
    serverTime: iso(0),
    organization: { name: "Mercado Aurora · Unidade Centro", city: "Ribeirão Preto", sites: ["Unidade Centro"] },
    devices: [{ id: "d1", code: "FLOW-001", label: "Sensor", kind: "FLOW", siteName: "Unidade Centro", minFlowLpm: 1.5, continuousSeconds: 30, lastSeenAt: iso(-1), connectivity: "ONLINE", rule: null }],
    readings: [],
    activeOccurrences: [],
    today: { from: iso(-3600), deliveredKg: { value: 12, provenance: "MANUAL", sources: [{ source: "MANUAL", value: 12 }] }, deliveredBatches: 1, pendingReview: { value: 0, provenance: "NONE", sources: [] }, activeOccurrences: { value: 0, provenance: "NONE", sources: [] } },
    pendingScaleLots: [], audit: [],
    ...over,
  };
}
const reading = (s: number, flowLpm: number, observedSeconds: number, seq: number, extra: Partial<ReadingCreatedEvent> = {}): LiveEvent => ({
  v: 1, type: "reading.created", orgId: "o", emittedAt: new Date(at(s) + 20).toISOString(), deviceId: "d1", deviceCode: "FLOW-001", siteId: "s",
  bootId: "b1", sequence: seq, capturedAt: iso(s), flowLpm, deltaLiters: flowLpm / 30, source: "SIMULATED", channel: "mqtt",
  rule: { minFlowLpm: 1.5, continuousSeconds: 30, observedSeconds, suspicious: observedSeconds >= 30 },
  timing: { receivedAt: new Date(at(s) + 5).toISOString(), emittedAt: new Date(at(s) + 20).toISOString() }, ...extra,
});
const run = (m: StageModel, events: LiveEvent[]) => events.reduce((acc, e) => reduceStage(acc, { type: "event", event: e, arrivalMs: Date.parse(e.emittedAt) + 10 }), m);

test("redutor: leituras alimentam faixa, pulso e regra; contadores continuam os do snapshot", () => {
  let m = initModel(snapshot());
  m = reduceStage(m, { type: "hello", serverTime: iso(0), arrivalMs: at(0) });
  m = run(m, [reading(2, 0.3, 0, 1), reading(4, 2.4, 0, 2), reading(6, 2.4, 2, 3), reading(8, 2.4, 4, 4), reading(10, 0.2, 0, 5)]);
  assert.equal(m.readings.d1.length, 5);
  assert.equal(m.readingCount, 5);
  assert.deepEqual(m.feed.map(l => l.title), ["Contagem zerada", "Regra começou a contar"]);
  assert.deepEqual(m.broken.d1, { seconds: 4, at: at(10) });
  assert.equal(m.trip?.sequence, 5);
  assert.equal(m.snapshot?.today.deliveredKg.value, 12, "evento nunca soma agregado");
  m = run(m, [reading(10, 0.2, 0, 5)]);
  assert.equal(m.readings.d1.length, 5, "mesma (bootId, sequence) não duplica ponto");
});

test("redutor: ocorrência por evento vale até o snapshot e o snapshot antigo não a apaga", () => {
  let m = initModel(snapshot());
  const opened: LiveEvent = { v: 1, type: "occurrence.opened", orgId: "o", emittedAt: iso(33), id: "oc1", deviceId: "d1", deviceCode: "FLOW-001", kind: "UNUSUAL_FLOW", severity: "HIGH", title: "Fluxo contínuo fora do padrão", source: "SIMULATED", openedAt: iso(33) };
  m = run(m, [opened]);
  assert.equal(activeOccurrences(m).length, 1);
  assert.equal(flowOccurrenceFor(m, "d1")?.id, "oc1");
  // Snapshot pedido ANTES do evento chega depois: não pode apagar a ocorrência.
  m = reduceStage(m, { type: "snapshot", snapshot: snapshot({ serverTime: iso(32) }), requestedAt: at(31), receivedAt: at(34) });
  assert.equal(activeOccurrences(m).length, 1);
  m = run(m, [{ v: 1, type: "occurrence.status", orgId: "o", emittedAt: iso(50), id: "oc1", deviceId: "d1", kind: "UNUSUAL_FLOW", title: "Fluxo contínuo fora do padrão", from: "OPEN", status: "RESOLVED", actor: "operador:x", source: "SIMULATED" }]);
  assert.equal(activeOccurrences(m).length, 0);
  assert.equal(flowOccurrenceFor(m, "d1"), null);
});

test("redutor: leitura suspeita com occurrenceId cobre o intervalo até o evento da ocorrência", () => {
  const m = run(initModel(snapshot()), [reading(33, 2.5, 33, 9, { occurrenceId: "oc9" })]);
  assert.equal(flowOccurrenceFor(m, "d1")?.id, "oc9");
  assert.equal(flowOccurrenceFor(m, "d1")?.openedAt, null, "sem o evento da ocorrência, a hora de abertura é desconhecida (nunca a da leitura)");
});

// Anel como a Sala calcula (live-stage.tsx): regra guardada + ocorrência de fluxo ativa do dispositivo.
const ringOf = (m: StageModel, nowS: number) => ringView({ rule: m.rules.d1 ?? null, broken: m.broken.d1 ?? null, occurrence: flowOccurrenceFor(m, "d1", undefined, focusSource(m.rules.d1 ?? null, (m.readings.d1 ?? []).at(-1) ?? null)), nowMs: at(nowS), minFlowLpm: 1.5, continuousSeconds: 30 });
const openedEv = (s: number, source: "DEVICE" | "SIMULATED" = "SIMULATED", id = "X"): LiveEvent => ({ v: 1, type: "occurrence.opened", orgId: "o", emittedAt: iso(s), id, deviceId: "d1", deviceCode: "FLOW-001", kind: "UNUSUAL_FLOW", severity: "HIGH", title: "Fluxo contínuo fora do padrão", source, openedAt: iso(s) });
const statusEv = (s: number, status: "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED", id = "X"): LiveEvent => ({ v: 1, type: "occurrence.status", orgId: "o", emittedAt: iso(s), id, deviceId: "d1", kind: "UNUSUAL_FLOW", title: "Fluxo contínuo fora do padrão", from: "OPEN", status, actor: "operador", source: "SIMULATED" });
const liveOcc = (s: number) => ({ id: "X", kind: "UNUSUAL_FLOW", severity: "HIGH", status: "OPEN", title: "Fluxo contínuo fora do padrão", source: "SIMULATED" as const, deviceId: "d1", deviceCode: "FLOW-001", openedAt: iso(s) });

test("redutor: ocorrência resolvida não volta ao anel quando o snapshot chega e as leituras pararam (contingência pnpm simulate)", () => {
  // pnpm simulate --scenario leak --samples 14 --interval 4: 2,5 L/min o tempo todo; a regra chega a 30 s na leitura de 32 s.
  let m = initModel(snapshot());
  m = reduceStage(m, { type: "hello", serverTime: iso(0), arrivalMs: at(0) });
  for (let i = 0; i < 14; i++) {
    const s = i * 4;
    if (s === 32) m = run(m, [openedEv(32)]);
    m = run(m, [reading(s, 2.5, s, i, s >= 32 ? { occurrenceId: "X", rule: { minFlowLpm: 1.5, continuousSeconds: 30, observedSeconds: s, suspicious: true } } : {})]);
    if (s === 32) m = reduceStage(m, { type: "snapshot", snapshot: snapshot({ serverTime: iso(32.3), activeOccurrences: [liveOcc(32)] }), requestedAt: at(32.25), receivedAt: at(32.4) });
  }
  const open = ringOf(m, 53);
  assert.equal(open.state, "OCORRENCIA_ABERTA");
  assert.match(open.detail, new RegExp(`aberta às ${clockBR(at(32))}`), "hora REAL de abertura da ocorrência");
  assert.doesNotMatch(open.detail, new RegExp(clockBR(at(52))), "nunca a hora da última leitura");

  // O operador resolve aos 70 s; 250 ms depois a Sala pede o snapshot, que já não lista X (e traz a mesma regra da leitura de 52 s).
  m = run(m, [statusEv(70, "RESOLVED")]);
  assert.notEqual(ringOf(m, 70.1).state, "OCORRENCIA_ABERTA");
  const stageRule = { minFlowLpm: 1.5, continuousSeconds: 30, observedSeconds: 52, suspicious: true, at: iso(52), bootId: "b1", sequence: 13, source: "SIMULATED" as const, flowLpm: 2.5 };
  const devices = snapshot().devices.map(d => ({ ...d, rule: stageRule }));
  m = reduceStage(m, { type: "snapshot", snapshot: snapshot({ serverTime: iso(70.4), devices }), requestedAt: at(70.26), receivedAt: at(70.5) });
  assert.equal(activeOccurrences(m).length, 0);
  assert.equal(flowOccurrenceFor(m, "d1"), null, "a ocorrência encerrada não volta pelo atalho da leitura");
  const after = ringOf(m, 70.6);
  assert.notEqual(after.state, "OCORRENCIA_ABERTA");
  assert.equal(pipeTone(after.state, after.foreign) === "danger", false, "cano não fica vermelho por ocorrência encerrada");
  // Dez minutos depois, snapshot sem leituras (180 s) e sem regra: continua sem ocorrência.
  m = reduceStage(m, { type: "snapshot", snapshot: snapshot({ serverTime: iso(670) }), requestedAt: at(669.9), receivedAt: at(670.1) });
  m = reduceStage(m, { type: "tick", arrivalMs: at(671) });
  assert.notEqual(ringOf(m, 671).state, "OCORRENCIA_ABERTA");
});

test("redutor: resolvida com o stream fora (sem evento) também sai do anel quando o snapshot não a lista", () => {
  let m = initModel(snapshot());
  m = reduceStage(m, { type: "hello", serverTime: iso(0), arrivalMs: at(0) });
  m = run(m, [reading(32, 2.5, 32, 8, { occurrenceId: "X", rule: { minFlowLpm: 1.5, continuousSeconds: 30, observedSeconds: 32, suspicious: true } })]);
  assert.equal(flowOccurrenceFor(m, "d1")?.id, "X");
  // Snapshot pedido DEPOIS da leitura, sem X entre as ativas: o vínculo da leitura caducou.
  m = reduceStage(m, { type: "snapshot", snapshot: snapshot({ serverTime: iso(40) }), requestedAt: at(39.9), receivedAt: at(40.1) });
  assert.equal(flowOccurrenceFor(m, "d1"), null);
  assert.notEqual(ringOf(m, 40.2).state, "OCORRENCIA_ABERTA");
  // Snapshot pedido ANTES da leitura (chegou atrasado) não apaga o vínculo novo.
  let n = initModel(snapshot());
  n = reduceStage(n, { type: "hello", serverTime: iso(0), arrivalMs: at(0) });
  n = run(n, [reading(32, 2.5, 32, 8, { occurrenceId: "X", rule: { minFlowLpm: 1.5, continuousSeconds: 30, observedSeconds: 32, suspicious: true } })]);
  n = reduceStage(n, { type: "snapshot", snapshot: snapshot({ serverTime: iso(31) }), requestedAt: at(30), receivedAt: at(33) });
  assert.equal(flowOccurrenceFor(n, "d1")?.id, "X");
});

test("redutor: 'Simular alerta' com o sensor real contando NÃO bloqueia o sensor real (regra 5 por origem) nem vira mérito dele", () => {
  // Antes da regra 5 por origem (99fe784) o anel mostrava BLOQUEADO; o helper deste teste não passava a origem e
  // seguia "passando" com a regra velha (revisão adversarial R6). Agora o anel é calculado como a Sala calcula.
  let m = initModel(snapshot());
  m = reduceStage(m, { type: "hello", serverTime: iso(0), arrivalMs: at(0) });
  const real = { source: "DEVICE" as const, channel: "http" as const };
  m = run(m, [reading(0, 2.4, 0, 1, real), reading(6, 2.4, 6, 2, real), reading(12, 2.4, 12, 3, real)]);
  m = run(m, [openedEv(12.5, "SIMULATED", "SIM-1")]);
  const v = ringOf(m, 13);
  assert.equal(v.state, "CONTANDO", "a simulada não impede o sensor real de abrir a dele");
  assert.equal(v.observed, 12);
  assert.equal(v.occurrenceSeal, null, "o anel do sensor real não carrega o selo da ocorrência simulada");
  assert.notEqual(pipeTone(v.state, v.foreign), "danger");
  // A simulada continua visível no anel quando a leitura em foco é a simulada.
  assert.equal(flowOccurrenceFor(m, "d1", activeOccurrences(m), "SIMULATED")?.id, "SIM-1");
});

test("redutor ignora evento legado de jornada retirada",()=>{const m=initModel(snapshot());const next=run(m,[{v:1,type:"donation.status",orgId:"o",emittedAt:iso(10),id:"retired",kg:6,from:"RESERVED",status:"DELIVERED"}as LiveEvent]);assert.equal(next.feed.length,0);});

test("redutor: dispositivo calado vira linha uma vez, só se esteve online na sessão", () => {
  let m = initModel(snapshot({ devices: [
    { id: "d1", code: "FLOW-001", label: "S", kind: "FLOW", siteName: "U", minFlowLpm: 1.5, continuousSeconds: 30, lastSeenAt: iso(-1), connectivity: "ONLINE", rule: null },
    { id: "d2", code: "OLD-002", label: "S", kind: "FLOW", siteName: "U", minFlowLpm: 1.5, continuousSeconds: 30, lastSeenAt: iso(-86400), connectivity: "OFFLINE", rule: null },
  ] }));
  m = reduceStage(m, { type: "hello", serverTime: iso(0), arrivalMs: at(0) });
  m = reduceStage(m, { type: "tick", arrivalMs: at(60) });
  assert.equal(m.feed.length, 0);
  m = reduceStage(m, { type: "tick", arrivalMs: at(125) });
  assert.deepEqual(m.feed.map(l => l.title), ["Sem comunicação"]);
  assert.match(m.feed[0].detail, /FLOW-001/);
  m = reduceStage(m, { type: "tick", arrivalMs: at(130) });
  assert.equal(m.feed.length, 1, "não repete");
});

test("redutor: primeiro render igual no servidor e no navegador (sem relógio no estado inicial)", () => {
  const a = initModel(snapshot()), b = initModel(snapshot());
  assert.deepEqual(a, b);
  assert.equal(a.clientNow, null);
  assert.equal(a.offsetKnown, false);
});

test("redutor: evento malformado é ignorado sem derrubar a tela", () => {
  const m = initModel(snapshot());
  const broken = { v: 1, type: "reading.created", orgId: "o", emittedAt: iso(1), deviceId: "d1" } as unknown as LiveEvent;
  assert.doesNotThrow(() => reduceStage(m, { type: "event", event: broken, arrivalMs: at(1) }));
  const noRule = reduceStage(m, { type: "event", event: broken, arrivalMs: at(1) });
  assert.equal(noRule.readingCount, 0, "leitura sem decisão da regra não entra");
  const weird = { v: 1, type: "sensor.live", orgId: "o", emittedAt: iso(1), deviceId: "d1", deviceCode: "D", channel: "mqtt", at: iso(1), temperature: { c: 20 } } as unknown as LiveEvent;
  assert.deepEqual(reduceStage(m, { type: "event", event: weird, arrivalMs: at(1) }).temperature, {}, "temperatura sem regra não é desenhada");
});

test("regra 5 por origem: o anel e o cano usam a ocorrência da MESMA origem da leitura em foco", () => {
  let m = initModel(snapshot());
  const open = (id: string, source: "DEVICE" | "SIMULATED"): LiveEvent => ({ v: 1, type: "occurrence.opened", orgId: "o", emittedAt: iso(33), id, deviceId: "d1", deviceCode: "FLOW-001", kind: "UNUSUAL_FLOW", severity: "HIGH", title: "Fluxo", source, openedAt: iso(33) });
  m = run(m, [open("sim1", "SIMULATED")]);
  assert.equal(flowOccurrenceFor(m, "d1", activeOccurrences(m), "DEVICE"), null, "a simulada não vale para a leitura REAL: não bloqueia nem acende o sensor real");
  assert.equal(flowOccurrenceFor(m, "d1", activeOccurrences(m), "SIMULATED")?.id, "sim1");
  assert.equal(flowOccurrenceFor(m, "d1")?.id, "sim1", "sem leitura em foco: mostra a ativa (o selo diz a origem)");
  m = run(m, [open("real1", "DEVICE")]);
  assert.equal(flowOccurrenceFor(m, "d1", activeOccurrences(m), "DEVICE")?.id, "real1");
  assert.equal(flowOccurrenceFor(m, "d1", activeOccurrences(m), "SIMULATED")?.id, "sim1");
  // O id que só a leitura apontou (antes do evento) também respeita a origem da leitura.
  let n = initModel(snapshot());
  n = run(n, [reading(40, 2, 31, 9, { occurrenceId: "simX" })]);
  assert.equal(flowOccurrenceFor(n, "d1", activeOccurrences(n), "SIMULATED")?.id, "simX");
  assert.equal(flowOccurrenceFor(n, "d1", activeOccurrences(n), "DEVICE"), null);
});

test("regra 5 por origem: a origem em foco é a da leitura MAIS NOVA (uma decisão velha de outra origem não esconde a ocorrência)", () => {
  const rule = { at: at(10), source: "SIMULATED" as const };
  assert.equal(focusSource(rule, { capturedAt: iso(50), source: "DEVICE" }), "DEVICE", "sensor real voltou depois da bancada: vale a leitura real");
  assert.equal(focusSource(rule, { capturedAt: iso(10), source: "SIMULATED" }), "SIMULATED");
  assert.equal(focusSource(rule, null), "SIMULATED");
  assert.equal(focusSource(null, { capturedAt: iso(5), source: "DEVICE" }), "DEVICE");
  assert.equal(focusSource(null, null), null);
  // Fim a fim no redutor: a regra simulada fica guardada, chega leitura real sem decisão nova e há ocorrência REAL ativa.
  let m = initModel(snapshot());
  m = run(m, [reading(10, 2, 9, 1)]); // decisão da regra numa leitura SIMULATED
  m = reduceStage(m, { type: "event", event: { v: 1, type: "occurrence.opened", orgId: "o", emittedAt: iso(40), id: "real9", deviceId: "d1", deviceCode: "FLOW-001", kind: "UNUSUAL_FLOW", severity: "HIGH", title: "Fluxo", source: "DEVICE", openedAt: iso(40) }, arrivalMs: at(40) });
  const lastReal = { capturedAt: iso(45), source: "DEVICE" as const };
  assert.equal(flowOccurrenceFor(m, "d1", activeOccurrences(m), focusSource(m.rules.d1 ?? null, lastReal))?.id, "real9", "a ocorrência real aparece no anel do sensor real");
  assert.match(ringView({ rule: null, broken: null, occurrence: null, nowMs: at(1), minFlowLpm: 1.5, continuousSeconds: 30 }).rule, /1 ativa por sensor e origem \(regra 5\)/, "espaço inseguível: '(regra' e '5)' nunca ficam em linhas separadas");
});

test("snapshot legado não reinsere lotes na Sala hídrica",()=>{const m=initModel(snapshot({pendingScaleLots:[{id:"old",deviceCode:"BAL",kg:5,source:"DEVICE",createdAt:iso(-20)}]}));assert.deepEqual(m.scaleLots,{});});
