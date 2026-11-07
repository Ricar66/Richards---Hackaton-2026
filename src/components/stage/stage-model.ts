import { isWaterEvent, type LiveEvent, type LiveSource } from "@/modules/realtime/domain/live-event";
import type { StageOccurrence, StageReading, StageSnapshot } from "@/modules/analytics/application/get-stage-snapshot";
import {
  BUFFER_MS, OFFLINE_MS, lineFromAudit, lineFromEvent, mergeFeed, offlineLine, ruleTransition, scaleLotKey,
  type BrokenRun, type FeedLine, type Packet, type RingOccurrence, type RuleMark, type RuleTrack, type ScaleLive, type ScaleLot, type TemperatureLive, type TripSample,
} from "./stage-logic";

/**
 * Estado da Sala ao vivo como redutor puro: snapshot do servidor + eventos do stream. Toda hora vem na ação
 * (nada de relógio aqui dentro), então o mesmo estado sai no servidor e no navegador e os testes são determinísticos.
 * Regra de ouro: agregados (kg, contagens) só do snapshot; eventos só mudam listas, leituras e a decisão da regra.
 */
type OccOverride = { active: boolean; at: number; status?: string; data?: StageOccurrence };
export type StageModel = {
  snapshot: StageSnapshot | null;
  /** Hora do servidor da primeira informação recebida: âncora fixa da faixa (coordenadas pequenas no SVG). */
  anchorMs: number | null;
  readings: Record<string, StageReading[]>;
  rules: Record<string, RuleTrack>;
  marks: Record<string, RuleMark>;
  broken: Record<string, BrokenRun>;
  overrides: Record<string, OccOverride>;
  /**
   * Ocorrências encerradas (RESOLVED/DISMISSED) vistas por evento nesta sessão, com a hora de chegada. Encerrada não
   * reabre (estado final), então o snapshot NÃO limpa esta lista: nenhum caminho volta a tratá-la como ativa.
   */
  closed: Record<string, number>;
  temperature: Record<string, TemperatureLive>;
  scale: Record<string, ScaleLive>;
  scaleLots: Record<string, ScaleLot>;
  lastSeen: Record<string, number>;
  online: Record<string, boolean>;
  feed: FeedLine[];
  readingCount: number;
  lastReadingAt: number | null;
  /** Incrementa a cada leitura: o ponto do topo pisca UMA vez por pacote. */
  pulse: number;
  trip: TripSample | null;
  offsetMs: number;
  offsetKnown: boolean;
  /** Relógio do navegador no último tique (null no primeiro render: servidor e navegador geram o mesmo HTML). */
  clientNow: number | null;
};
export type StageAction =
  | { type: "snapshot"; snapshot: StageSnapshot; requestedAt: number | null; receivedAt: number | null }
  | { type: "hello"; serverTime: string; arrivalMs: number }
  | { type: "event"; event: LiveEvent; arrivalMs: number }
  | { type: "tick"; arrivalMs: number };

const readingKey = (r: { bootId: string; sequence: number }) => `${r.bootId}:${r.sequence}`;
const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

function mergeReadings(current: StageReading[] | undefined, add: StageReading[], horizonMs: number): StageReading[] {
  const map = new Map<string, StageReading>();
  for (const r of current ?? []) map.set(readingKey(r), r);
  for (const r of add) map.set(readingKey(r), r);
  return [...map.values()].filter(r => ms(r.capturedAt) >= horizonMs).sort((a, b) => ms(a.capturedAt) - ms(b.capturedAt));
}

export function initModel(snapshot: StageSnapshot | null): StageModel {
  const empty: StageModel = {
    snapshot: null, anchorMs: null, readings: {}, rules: {}, marks: {}, broken: {}, overrides: {}, closed: {}, temperature: {}, scale: {}, scaleLots: {},
    lastSeen: {}, online: {}, feed: [], readingCount: 0, lastReadingAt: null, pulse: 0, trip: null, offsetMs: 0, offsetKnown: false, clientNow: null,
  };
  return snapshot ? applySnapshot(empty, snapshot, null, null) : empty;
}

function applySnapshot(m: StageModel, s: StageSnapshot, requestedAt: number | null, receivedAt: number | null): StageModel {
  const serverNow = ms(s.serverTime);
  const horizon = serverNow - BUFFER_MS;
  const byDevice: Record<string, StageReading[]> = {};
  for (const r of s.readings) (byDevice[r.deviceId] ??= []).push(r);
  const readings: Record<string, StageReading[]> = {};
  for (const id of new Set([...Object.keys(m.readings), ...Object.keys(byDevice)])) readings[id] = mergeReadings(m.readings[id], byDevice[id] ?? [], horizon);

  const rules = { ...m.rules }, marks = { ...m.marks }, lastSeen = { ...m.lastSeen }, online = { ...m.online };
  for (const d of s.devices) {
    const seen = ms(d.lastSeenAt);
    if (Number.isFinite(seen) && !(lastSeen[d.id] >= seen)) lastSeen[d.id] = seen;
    if (d.connectivity === "ONLINE") online[d.id] = true;
    if (!d.rule) continue;
    const at = ms(d.rule.at);
    // A decisão mais nova vence (o evento pode chegar antes do snapshot que estava a caminho).
    const known = rules[d.id];
    if (!known || known.at < at) rules[d.id] = { ...d.rule, at };
    const markKey = `${d.id}:${d.rule.source}`;
    if (!marks[markKey] || marks[markKey].at <= at) marks[markKey] = { above: d.rule.flowLpm >= d.rule.minFlowLpm, observed: d.rule.observedSeconds, at };
  }
  // O snapshot é a verdade para tudo que aconteceu antes de ele ser pedido; eventos posteriores continuam valendo.
  const keep = (at: number) => requestedAt !== null && at >= requestedAt;
  // Leitura que chegou ANTES do pedido apontando uma ocorrência que o snapshot já não lista como ativa: o vínculo
  // caducou (resolvida ou descartada, inclusive com o stream fora). Sem isso, o anel voltaria a "OCORRÊNCIA ABERTA".
  const activeIds = new Set(s.activeOccurrences.map(o => o.id));
  for (const [id, r] of Object.entries(rules)) {
    if (r.occurrenceId && !activeIds.has(r.occurrenceId) && requestedAt !== null && (r.arrivalMs ?? -Infinity) < requestedAt)
      rules[id] = { ...r, occurrenceId: undefined };
  }
  const overrides = Object.fromEntries(Object.entries(m.overrides).filter(([, o]) => keep(o.at)));
  const scaleLots:Record<string,ScaleLot>={};

  // Ajuste de relógio pelo ponto médio da ida e volta (o `hello` refina). Snapshot do primeiro render não serve: chegou sem medida.
  const offset = requestedAt !== null && receivedAt !== null && !m.offsetKnown ? { offsetMs: serverNow - (requestedAt + receivedAt) / 2, offsetKnown: true } : {};
  return {
    ...m, ...offset, snapshot: s, anchorMs: m.anchorMs ?? serverNow, readings, rules, marks, lastSeen, online, overrides, scaleLots,
    feed: mergeFeed(m.feed, s.audit.filter(a=>a.entity==="Occurrence").map(lineFromAudit)),
  };
}

function applyEvent(m: StageModel, e: LiveEvent, arrivalMs: number): StageModel {
  if(!isWaterEvent(e))return m;
  const serverArrival = arrivalMs + m.offsetMs;
  const anchorMs = m.anchorMs ?? serverArrival;
  const line = lineFromEvent(e);
  const feed = line ? mergeFeed(m.feed, [line]) : m.feed;
  switch (e.type) {
    case "reading.created": {
      if (!e.rule || !Number.isFinite(e.flowLpm)) return { ...m, anchorMs, feed };
      const at = ms(e.capturedAt), seen = ms(e.timing?.receivedAt);
      const reading: StageReading = { deviceId: e.deviceId, bootId: e.bootId, sequence: e.sequence, capturedAt: e.capturedAt, flowLpm: e.flowLpm, deltaLiters: e.deltaLiters, source: e.source };
      const readings = { ...m.readings, [e.deviceId]: mergeReadings(m.readings[e.deviceId], [reading], serverArrival - BUFFER_MS) };
      const track: RuleTrack = { ...e.rule, at, flowLpm: e.flowLpm, source: e.source, sequence: e.sequence, occurrenceId: e.occurrenceId, channel: e.channel, arrivalMs };
      const current = m.rules[e.deviceId];
      const newer = !current || current.at <= at;
      const markKey = `${e.deviceId}:${e.source}`;
      const prev = m.marks[markKey];
      const next: RuleMark = { above: e.flowLpm >= e.rule.minFlowLpm, observed: e.rule.observedSeconds, at };
      const lines = ruleTransition(prev, next, { key: `${e.deviceId}:${e.source}:${e.bootId}:${e.sequence}`, emittedAt: ms(e.emittedAt), deviceCode: e.deviceCode, source: e.source, minFlowLpm: e.rule.minFlowLpm, continuousSeconds: e.rule.continuousSeconds });
      const broken = prev && prev.above && at >= prev.at && (!next.above || next.observed + 0.5 < prev.observed)
        ? { ...m.broken, [e.deviceId]: { seconds: Math.floor(prev.observed), at } } : m.broken;
      return {
        ...m, anchorMs, readings, feed: mergeFeed(feed, lines),
        rules: newer ? { ...m.rules, [e.deviceId]: track } : m.rules,
        marks: !prev || prev.at <= at ? { ...m.marks, [markKey]: next } : m.marks,
        broken, lastSeen: Number.isFinite(seen) && !(m.lastSeen[e.deviceId] >= seen) ? { ...m.lastSeen, [e.deviceId]: seen } : m.lastSeen,
        online: { ...m.online, [e.deviceId]: true },
        readingCount: m.readingCount + 1, lastReadingAt: serverArrival, pulse: m.pulse + 1,
        trip: e.timing ? { kind: "leitura", channel: e.channel, source: e.source, deviceCode: e.deviceCode, sequence: e.sequence, timing: e.timing, arrivalMs } : m.trip,
      };
    }
    case "sensor.live": {
      const at = ms(e.at), seen = ms(e.timing?.receivedAt);
      const temperature = e.temperature?.rule && Number.isFinite(e.temperature.c) ? { ...m.temperature, [e.deviceId]: { deviceId: e.deviceId, deviceCode: e.deviceCode, c: e.temperature.c, humidityPct: e.temperature.humidityPct, source: e.temperature.source, channel: e.channel, rule: e.temperature.rule, at } } : m.temperature;
      const scale = e.scale?.progress && Number.isFinite(e.scale.kg) ? { ...m.scale, [e.deviceId]: { deviceId: e.deviceId, deviceCode: e.deviceCode, kg: e.scale.kg, source: e.scale.source, channel: e.channel, progress: e.scale.progress, at } } : m.scale;
      const source = e.temperature?.source ?? e.scale?.source ?? "SIMULATED";
      return {
        ...m, anchorMs, temperature, scale, online: { ...m.online, [e.deviceId]: true },
        lastSeen: Number.isFinite(seen) && !(m.lastSeen[e.deviceId] >= seen) ? { ...m.lastSeen, [e.deviceId]: seen } : m.lastSeen,
        trip: e.timing ? { kind: "sensor", channel: e.channel, source, deviceCode: e.deviceCode, sequence: null, timing: e.timing, arrivalMs } : m.trip,
      };
    }
    case "occurrence.opened":
      return { ...m, anchorMs, feed, overrides: { ...m.overrides, [e.id]: { active: true, at: arrivalMs, data: {
        id: e.id, kind: e.kind, severity: e.severity, status: "OPEN", title: e.title, source: e.source, deviceId: e.deviceId, deviceCode: e.deviceCode, openedAt: e.openedAt,
      } } } };
    case "occurrence.status": {
      const old = m.overrides[e.id];
      const active = e.status === "ACKNOWLEDGED";
      const closed = active ? m.closed : capClosed({ ...m.closed, [e.id]: arrivalMs });
      return { ...m, anchorMs, feed, closed, overrides: { ...m.overrides, [e.id]: { ...old, active, at: arrivalMs, status: e.status } } };
    }
    case "donation.created":
      return e.origin === "scale" && e.deviceCode
        ? { ...m, anchorMs, feed, scaleLots: { ...m.scaleLots, [scaleLotKey(e.deviceCode, e.source)]: { id: e.id, kg: e.kg, deviceCode: e.deviceCode, source: e.source, at: arrivalMs } } }
        : { ...m, anchorMs, feed };
    case "donation.status":
      // Verificado ou cancelado: deixou de aguardar verificação (o snapshot que vem a seguir confirma).
      return { ...m, anchorMs, feed, scaleLots: Object.fromEntries(Object.entries(m.scaleLots).filter(([, l]) => l.id !== e.id)) };
    default:
      return feed === m.feed ? m : { ...m, anchorMs, feed };
  }
}

function applyTick(m: StageModel, arrivalMs: number): StageModel {
  const now = arrivalMs + m.offsetMs;
  const devices = m.snapshot?.devices ?? [];
  let online = m.online;
  const lines: FeedLine[] = [];
  for (const d of devices) {
    const seen = m.lastSeen[d.id];
    // Só quem esteve online nesta sessão vira linha: dispositivo desligado há dias não polui o feed.
    if (online[d.id] && Number.isFinite(seen) && now - seen > OFFLINE_MS) {
      online = { ...online, [d.id]: false };
      lines.push(offlineLine(d, seen));
    }
  }
  return { ...m, clientNow: arrivalMs, online, feed: lines.length ? mergeFeed(m.feed, lines) : m.feed };
}

export function reduceStage(m: StageModel, a: StageAction): StageModel {
  switch (a.type) {
    case "snapshot": return applySnapshot(m, a.snapshot, a.requestedAt, a.receivedAt);
    case "hello": {
      const server = ms(a.serverTime);
      return Number.isFinite(server) ? { ...m, offsetMs: server - a.arrivalMs, offsetKnown: true, anchorMs: m.anchorMs ?? server } : m;
    }
    case "event":
      // Evento malformado é ignorado: a tela de palco nunca cai por causa de um pacote.
      try { return applyEvent(m, a.event, a.arrivalMs); } catch { return m; }
    case "tick": return applyTick(m, a.arrivalMs);
  }
}

// ---------- seletores ----------
/** Hora do servidor estimada agora (null antes do primeiro tique). */
export const serverNow = (m: StageModel) => (m.clientNow === null ? null : m.clientNow + m.offsetMs);

/** Ocorrências ativas: snapshot com as mudanças vindas por evento depois dele. Lista, não contagem (a contagem é do snapshot). */
export function activeOccurrences(m: StageModel): StageOccurrence[] {
  const out = new Map<string, StageOccurrence>();
  for (const o of m.snapshot?.activeOccurrences ?? []) out.set(o.id, o);
  for (const [id, o] of Object.entries(m.overrides)) {
    if (!o.active) { out.delete(id); continue; }
    const base = out.get(id) ?? o.data;
    if (base) out.set(id, { ...base, status: o.status ?? base.status });
  }
  // Encerrada por evento não volta (snapshot pedido antes do encerramento e entregue depois, por exemplo).
  for (const id of Object.keys(m.closed)) out.delete(id);
  return [...out.values()].sort((a, b) => ms(b.openedAt) - ms(a.openedAt));
}

const CLOSED_MAX = 200;
/** Lista de encerradas limitada (as mais recentes ficam): sessão longa no telão não acumula sem fim. */
function capClosed(c: Record<string, number>): Record<string, number> {
  const entries = Object.entries(c);
  return entries.length <= CLOSED_MAX ? c : Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, CLOSED_MAX));
}
const finite = (n: number) => (Number.isFinite(n) ? n : null);

/**
 * Ocorrência de fluxo ativa do dispositivo, com a hora REAL de abertura e a origem do registro.
 * O `occurrenceId` da leitura cobre só o intervalo até o evento ou o snapshot chegarem; nesse caso a hora e a origem
 * ainda são desconhecidas (null) e a tela não inventa nenhuma das duas. Encerrada por evento nunca volta por aqui.
 * A regra 5 é por ORIGEM: com a origem da leitura em foco conhecida (`source`), só a ocorrência da mesma origem vale
 * para o anel e o cano (uma simulada não bloqueia nem acende o sensor real). Sem leitura em foco, vale qualquer ativa
 * (o selo dela diz de onde veio).
 */
/**
 * Origem em foco no anel e no cano: a da leitura MAIS RECENTE do sensor. A decisão da regra fica guardada até chegar
 * outra; se a última leitura é mais nova e de outra origem (ex.: o sensor real voltou depois da bancada), vale ela.
 */
export function focusSource(rule: Pick<RuleTrack, "at" | "source"> | null, last: Pick<StageReading, "capturedAt" | "source"> | null): LiveSource | null {
  if (last && (!rule || Date.parse(last.capturedAt) > rule.at)) return last.source;
  return rule?.source ?? last?.source ?? null;
}

export function flowOccurrenceFor(m: StageModel, deviceId: string, active = activeOccurrences(m), source: LiveSource | null = null): RingOccurrence | null {
  const mine = active.filter(o => o.kind === "UNUSUAL_FLOW" && o.deviceId === deviceId);
  const found = source ? mine.find(o => o.source === source) : mine[0];
  if (found) return { id: found.id, openedAt: finite(ms(found.openedAt)), source: found.source };
  const rule = m.rules[deviceId];
  const id = rule?.suspicious ? rule.occurrenceId : undefined;
  // O id veio de uma leitura daquela origem: só vale se for a origem em foco.
  if (id && !(id in m.closed) && m.overrides[id]?.active !== false && (!source || rule?.source === source)) return { id, openedAt: null, source: null };
  return null;
}

/** Pacotes para o selo global: leituras no buffer + último sinal ao vivo de cada dispositivo. */
export function packets(m: StageModel): Packet[] {
  const out: Packet[] = [];
  for (const list of Object.values(m.readings)) for (const r of list) out.push({ at: ms(r.capturedAt), source: r.source });
  for (const t of Object.values(m.temperature)) out.push({ at: t.at, source: t.source });
  for (const s of Object.values(m.scale)) out.push({ at: s.at, source: s.source });
  return out;
}

/** Última leitura de cada dispositivo (hora do servidor ou do dispositivo), para escolher o foco. */
export function lastReadingByDevice(m: StageModel): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, list] of Object.entries(m.readings)) if (list.length) out[id] = ms(list[list.length - 1].capturedAt);
  return out;
}

/** Sinal ao vivo mais recente entre os dispositivos (temperatura ou balança), preferindo o dispositivo em foco. */
export function latestLive<T extends { at: number; deviceId: string }>(map: Record<string, T>, focusId: string | null): T | null {
  const all = Object.values(map);
  if (!all.length) return null;
  const focus = focusId ? map[focusId] : undefined;
  const newest = all.reduce((a, b) => (b.at > a.at ? b : a));
  return focus && newest.at - focus.at < 30_000 ? focus : newest;
}
