import type { FlowRuleProgress, LiveChannel, LiveEvent, LiveSource, LiveTiming, ScaleProgress, TemperatureRuleProgress } from "@/modules/realtime/domain/live-event";
import type { StageAuditEntry } from "@/modules/analytics/application/get-stage-snapshot";
import { DEFAULT_MAX_GAP_SECONDS } from "@/modules/monitoring/domain/flow-alert-policy";
import { OFFLINE_AFTER_SECONDS } from "@/modules/monitoring/domain/device-connectivity";
import { TIME_ZONE } from "@/lib/format";

/**
 * Lógica pura da Sala ao vivo (sem React, sem rede): estado do anel, selos de origem, tempos da viagem do pacote,
 * faixa da vazão e linhas do feed. Tudo que a tela mostra sai de dado do servidor; nada aqui interpola ou soma agregado.
 */
export const STRIP_WINDOW_MS = 120_000;
export const BUFFER_MS = 180_000;
/** Mesmo buraco máximo da regra: acima disso não se liga um ponto ao outro (não se inventa fluxo entre amostras). */
export const MAX_GAP_MS = DEFAULT_MAX_GAP_SECONDS * 1000;
/** Decisão da regra mais velha que isso não vale mais: a próxima leitura já quebraria a janela. */
export const RULE_STALE_MS = MAX_GAP_MS;
export const BROKEN_VISIBLE_MS = 20_000;
export const SEAL_WINDOW_MS = 60_000;
export const SENSOR_STALE_MS = 30_000;
export const OFFLINE_MS = OFFLINE_AFTER_SECONDS * 1000;
/** Ajuste de relógio acima disso: os ms de entrega ganham "≈". */
export const CLOCK_APPROX_MS = 500;
export const FEED_MAX = 40;

// ---------- formatação (fuso fixo: o container roda em UTC) ----------
const hms = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone: TIME_ZONE });
const hm = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TIME_ZONE });
export const clockBR = (ms: number) => hms.format(new Date(ms));
export const hourMinBR = (ms: number) => hm.format(new Date(ms));
const fixed = new Map<number, Intl.NumberFormat>();
/** Número com casas FIXAS (2,50 L/min): a largura não pula entre leituras. */
export function fixedBR(n: number, digits: number) {
  let f = fixed.get(digits);
  if (!f) { f = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }); fixed.set(digits, f); }
  return f.format(n);
}
const kgFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
export const kgNumBR = (n: number) => kgFmt.format(n);
export const kgBR = (n: number) => `${kgFmt.format(n)} kg`;
export const secondsSince = (fromMs: number, nowMs: number) => Math.max(0, Math.floor((nowMs - fromMs) / 1000));
const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Tira o usuário do operador (metade da credencial Basic) de qualquer autor antes de ir para o telão. */
export { publicActor } from "@/modules/realtime/domain/public-actor";
import { publicActor } from "@/modules/realtime/domain/public-actor";

// ---------- selos de origem ----------
export type Seal = "DEVICE" | "SIMULATED" | "MIXED" | "NONE";
export const SEAL_LABEL: Record<Seal, string> = { DEVICE: "TELEMETRIA REAL", SIMULATED: "SIMULADO", MIXED: "MISTO · REAL + SIMULADO", NONE: "SEM PACOTES RECENTES" };
export type Packet = { at: number; source: LiveSource };

/** Selo global pela origem dos pacotes do último minuto (leituras e sinais ao vivo). MANUAL não é pacote de sensor. */
export function originSeal(packets: Iterable<Packet>, nowMs: number, windowMs = SEAL_WINDOW_MS): Seal {
  let device = false, sim = false;
  for (const p of packets) {
    if (Math.abs(nowMs - p.at) > windowMs) continue;
    if (p.source === "DEVICE") device = true; else if (p.source === "SIMULATED") sim = true;
  }
  return device && sim ? "MIXED" : device ? "DEVICE" : sim ? "SIMULATED" : "NONE";
}

/** Provenance de contador do snapshot → selo. */
export const provenanceSeal = (p: string): Seal => (p === "DEVICE" || p === "SIMULATED" || p === "MIXED" ? p : "NONE");

export type SensorKind = "flow" | "temperature" | "scale";
const PHYSICAL: Record<SensorKind, string> = { flow: "YF-S201", temperature: "DHT11", scale: "HX711" };
/** Selo do instrumento com o sensor físico: o potenciômetro da bancada nunca passa por YF-S201. */
export function sensorSeal(kind: SensorKind, source: LiveSource, channel?: LiveChannel): { label: string; simulated: boolean } {
  if (source === "DEVICE") return { label: `${PHYSICAL[kind]} · SENSOR`, simulated: false };
  if (source === "MANUAL") return { label: "MANUAL", simulated: false };
  if (channel === "bancada-virtual") return { label: "BANCADA VIRTUAL · SIMULADO", simulated: true };
  if (kind === "flow" && channel === "mqtt") return { label: "POTENCIÔMETRO · SIMULADO", simulated: true };
  if (channel === "http") return { label: "SIMULADOR · SIMULADO", simulated: true };
  return { label: "SIMULADO", simulated: true };
}
export const CHANNEL_LABEL: Record<LiveChannel, string> = { http: "API HTTP", mqtt: "ponte MQTT", "bancada-virtual": "bancada virtual" };

/** Tom do selo: real (sensor), sim (simulado) ou neutro (manual ou origem ainda desconhecida). */
export type SealTone = "real" | "sim" | "neutral";
export type OriginBadge = { label: string; tone: SealTone };
/** Selo de origem de um registro (mesmo mapeamento do feed). */
export const SOURCE_BADGE: Record<LiveSource, OriginBadge> = { DEVICE: { label: "SENSOR", tone: "real" }, SIMULATED: { label: "SIMULADO", tone: "sim" }, MANUAL: { label: "MANUAL", tone: "neutral" } };
const OCC_BADGE: Record<LiveSource, OriginBadge> = {
  DEVICE: { label: "OCORRÊNCIA DO SENSOR", tone: "real" }, SIMULATED: { label: "OCORRÊNCIA SIMULADA", tone: "sim" }, MANUAL: { label: "OCORRÊNCIA MANUAL", tone: "neutral" },
};
/**
 * Selo da ocorrência ao lado de um instrumento: aparece quando ela é SIMULATED ou quando a origem dela difere da
 * leitura em foco (a regra 5 não olha a origem: uma ocorrência simulada também vale para o sensor real).
 * Origem desconhecida (ainda sem snapshot) também ganha selo: nunca se presume que é do sensor.
 */
export function occurrenceSeal(occurrence: LiveSource | null, reading: LiveSource | null): OriginBadge | null {
  if (occurrence === null) return { label: "ORIGEM A CONFIRMAR", tone: "neutral" };
  if (occurrence === "SIMULATED" || occurrence !== reading) return OCC_BADGE[occurrence];
  return null;
}

// ---------- anel da regra ----------
/** Última decisão da FlowAlertPolicy conhecida para o dispositivo (do evento `reading.created` ou do snapshot). */
export type RuleTrack = FlowRuleProgress & {
  at: number; flowLpm: number; source: LiveSource; sequence: number; occurrenceId?: string; channel?: LiveChannel;
  /** Relógio do navegador quando a decisão chegou por evento (para comparar com o pedido do snapshot, no mesmo relógio). */
  arrivalMs?: number;
};
export type BrokenRun = { seconds: number; at: number };
export type RingState = "OBSERVANDO" | "CONTANDO" | "INTERROMPIDO" | "OCORRENCIA_ABERTA" | "BLOQUEADO_REGRA_5";
export const RING_LABEL: Record<RingState, string> = {
  OBSERVANDO: "OBSERVANDO", CONTANDO: "CONTANDO", INTERROMPIDO: "INTERROMPIDO",
  OCORRENCIA_ABERTA: "OCORRÊNCIA ABERTA", BLOQUEADO_REGRA_5: "BLOQUEADO PELA REGRA 5",
};
export type RingView = {
  state: RingState; label: string; observed: number; limit: number; fraction: number; detail: string; rule: string; decidedAt: number | null;
  /** Selo de origem da ocorrência quando ela é simulada ou de outra origem que a leitura em foco. */
  occurrenceSeal: OriginBadge | null;
  /** A ocorrência ativa não é da mesma origem da leitura em foco (ou a origem ainda é desconhecida). */
  foreign: boolean;
};
/** Ocorrência de fluxo ATIVA do dispositivo. `openedAt`/`source` null = ainda desconhecidos (só a leitura apontou o id). */
export type RingOccurrence = { id: string; openedAt: number | null; source: LiveSource | null };
export type RingInput = {
  rule: RuleTrack | null; broken: BrokenRun | null;
  /** Ocorrência de fluxo ATIVA do dispositivo (regra 5), se houver. */
  occurrence: RingOccurrence | null;
  nowMs: number; minFlowLpm: number; continuousSeconds: number;
};
const stoppedAt = (s: number) => (s < 1 ? "parou na primeira leitura" : `parou em ${s} s`);

/**
 * Estado do anel. Os segundos são os DECIDIDOS pela regra na última leitura (arredondados para baixo):
 * nada anda entre uma leitura e outra.
 */
export function ringView(i: RingInput): RingView {
  const limit = i.rule?.continuousSeconds ?? i.continuousSeconds;
  const min = i.rule?.minFlowLpm ?? i.minFlowLpm;
  const rule = `≥ ${fixedBR(min, 1)} L/min por ${limit} s sem pausa · 1 ativa por sensor (regra 5)`;
  const fresh = i.rule !== null && i.nowMs - i.rule.at <= RULE_STALE_MS;
  const above = fresh && i.rule!.flowLpm >= min;
  const observed = above ? Math.floor(i.rule!.observedSeconds) : 0;
  const base = { observed, limit, rule, decidedAt: i.rule?.at ?? null, occurrenceSeal: null, foreign: false };
  if (i.occurrence) {
    const occ = i.occurrence;
    const sealed = { ...base, occurrenceSeal: occurrenceSeal(occ.source, i.rule?.source ?? null), foreign: i.rule !== null && occ.source !== i.rule.source };
    const runStart = above ? i.rule!.at - i.rule!.observedSeconds * 1000 : null;
    // "Aberta por esta contagem" só com a MESMA origem da leitura, a leitura ligada a ESTA ocorrência (ou, sem o id,
    // a regra já decidida como suspeita) e abertura dentro da contagem. Ocorrência de outra origem (ex.: "Simular
    // alerta" com o sensor real contando) ou anterior à contagem é bloqueio pela regra 5, nunca mérito do sensor.
    const linked = i.rule?.occurrenceId !== undefined ? i.rule.occurrenceId === occ.id : i.rule?.suspicious === true;
    const openedByRun = runStart !== null && !sealed.foreign && linked && occ.openedAt !== null && occ.openedAt >= runStart - 2000;
    if (openedByRun || !above)
      return { ...sealed, state: "OCORRENCIA_ABERTA", label: RING_LABEL.OCORRENCIA_ABERTA, fraction: 1,
        detail: occ.openedAt !== null ? `aberta às ${clockBR(occ.openedAt)} · aguarda verificação humana` : "ocorrência ativa neste sensor · aguarda verificação humana" };
    return { ...sealed, state: "BLOQUEADO_REGRA_5", label: RING_LABEL.BLOQUEADO_REGRA_5, fraction: clamp01(observed / limit),
      detail: `já existe ocorrência de fluxo ativa neste sensor${occ.openedAt !== null ? ` (desde ${hourMinBR(occ.openedAt)})` : ""}: a regra não abre outra até ela ser resolvida` };
  }
  if (above) {
    const left = Math.max(0, Math.ceil(limit - i.rule!.observedSeconds));
    // Limite atingido sem ocorrência ativa (ex.: a anterior foi resolvida e a vazão segue): a regra abre outra na
    // próxima leitura acima do limiar. Não dizer "gravando", que afirmaria uma gravação que não está acontecendo.
    return { ...base, state: "CONTANDO", label: RING_LABEL.CONTANDO, fraction: clamp01(observed / limit), detail: left > 0 ? `abre em ${left} s` : "limite atingido · sem ocorrência ativa: a próxima leitura acima do limiar abre uma" };
  }
  if (i.broken && i.nowMs - i.broken.at <= BROKEN_VISIBLE_MS)
    return { ...base, state: "INTERROMPIDO", label: RING_LABEL.INTERROMPIDO, fraction: 0, detail: `${stoppedAt(i.broken.seconds)} · contagem zerada` };
  const detail = !i.rule ? "aguardando a primeira leitura" : fresh ? `vazão abaixo de ${fixedBR(min, 1)} L/min` : `sem leitura há ${secondsSince(i.rule.at, i.nowMs)} s · a contagem não avança sem amostra`;
  return { ...base, state: "OBSERVANDO", label: RING_LABEL.OBSERVANDO, fraction: 0, detail };
}

export type PipeTone = "ok" | "warn" | "danger";
/**
 * Cor do cano (o fluxo do sensor em foco). Com ocorrência de OUTRA origem (`foreign`), o cano não fica vermelho por
 * ela: mostra só o estado da própria leitura (contando = aviso), e o selo da ocorrência fica no anel.
 */
export const pipeTone = (s: RingState, foreign = false): PipeTone => {
  if (foreign && s === "OCORRENCIA_ABERTA") return "ok";
  if (foreign && s === "BLOQUEADO_REGRA_5") return "warn";
  return s === "OCORRENCIA_ABERTA" || s === "BLOQUEADO_REGRA_5" ? "danger" : s === "CONTANDO" ? "warn" : "ok";
};

// ---------- gêmeo: água, alarme e dígitos (o SVG e o 3D usam as MESMAS funções e não podem divergir) ----------
/** Água do gêmeo: unidades do desenho por segundo para cada L/min MEDIDO. Sem leitura recente, zero ou negativo = parada. */
export const WATER_PER_LPM = 30;
export const WATER_MAX_SPEED = 260;
export function waterSpeed(flowLpm: number | null): number {
  return flowLpm !== null && Number.isFinite(flowLpm) && flowLpm > 0 ? Math.min(WATER_MAX_SPEED, flowLpm * WATER_PER_LPM) : 0;
}
/**
 * Fase da água acumulada quadro a quadro (velocidade × dt, com dt limitado a 0,1 s), em módulo do período.
 * Nunca calcula tempo total × velocidade: quando a vazão muda, a água muda de ritmo sem saltar de posição.
 */
export function advancePhase(phase: number, speed: number, dt: number, period: number): number {
  if (!(period > 0)) return 0;
  const step = speed * Math.min(0.1, Math.max(0, Number.isFinite(dt) ? dt : 0));
  return (((phase + step) % period) + period) % period;
}

/** Alarme do cano e do anel no padrão ISA-18.2: pisca enquanto ninguém assumiu, fica fixo depois de assumido. */
export type AlarmMode = "pulse" | "steady" | null;
/**
 * `status` é o da ocorrência de fluxo ativa do sensor em foco (null = ainda sem snapshot: acabou de abrir, então OPEN).
 * Ocorrência de OUTRA origem (`foreign`) não acende o cano: o selo dela fica no anel.
 */
export function alarmMode(state: RingState, status: string | null, foreign: boolean): AlarmMode {
  if (foreign || (state !== "OCORRENCIA_ABERTA" && state !== "BLOQUEADO_REGRA_5")) return null;
  return status === "ACKNOWLEDGED" ? "steady" : "pulse";
}

/**
 * O gêmeo leva o carimbo de simulado quando a leitura em foco é simulada OU quando o alarme que ele acende vem de uma
 * ocorrência simulada (ex.: a do seed aberta e nenhuma leitura recente): alarme de dado simulado nunca parece real.
 */
export function twinSimulated(readingSimulated: boolean, alarm: AlarmMode, occurrenceSource: LiveSource | null | undefined): boolean {
  return readingSimulated || (alarm !== null && occurrenceSource === "SIMULATED");
}

/** Uma posição do número formatado: o caractere atual, o anterior na MESMA posição (alinhado à direita) e se mudou. */
export type DigitCell = { ch: string; prev: string | null; changed: boolean };
/**
 * Troca de dígito sem valor intermediário: só a posição que mudou anima, saindo o caractere anterior e entrando o novo.
 * Alinhado à direita (1,85 → 12,40 compara centésimo com centésimo). `prev` null = primeiro valor, nada anima.
 */
export function digitCells(prev: string | null, next: string): DigitCell[] {
  const chars = [...next], before = prev === null ? null : [...prev];
  return chars.map((ch, i) => {
    if (before === null) return { ch, prev: null, changed: false };
    const old = before[before.length - (chars.length - i)] ?? null;
    return { ch, prev: old, changed: old !== ch };
  });
}

// ---------- gêmeo 3D: quando ligar e quando voltar ao SVG (o SVG está sempre montado por baixo) ----------
/** Motivo de o gêmeo estar no SVG. "off" é o padrão (chave desligada). */
export type TwinReason = "off" | "reduced" | "no-webgl" | "software" | "error" | "lost" | "budget";
/** Renderizador por software (WARP, SwiftShader, llvmpipe): o WebGL "existe", mas a 24 fps. Fica no SVG. */
export const SOFTWARE_RENDERER = /SwiftShader|Basic Render|llvmpipe|softpipe/i;
export type TwinProbe = { webgl2: boolean; caveatOk: boolean; renderer: string | null };
/** Ordem da cadeia de reserva: chave desligada vence; depois reduzir movimento; depois sem WebGL2; depois software. */
export function twinCapability(i: TwinProbe & { flag: boolean; reduced: boolean }): "ok" | TwinReason {
  if (!i.flag) return "off";
  if (i.reduced) return "reduced";
  if (!i.webgl2) return "no-webgl";
  if (!i.caveatOk || (i.renderer !== null && SOFTWARE_RENDERER.test(i.renderer))) return "software";
  return "ok";
}

/** Orçamento de quadro do 3D: nível 0 = DPR até 1,5; 1 = DPR 1; 2 = desiste e volta ao SVG. Só desce (não oscila). */
export const BUDGET_WARMUP_MS = 1000;
export const BUDGET_SLOW_MS = 20;
export const BUDGET_HOLD_MS = 3000;
/** Tela de 30 Hz (ou navegador limitado a 30 fps): o limite passa a ser 24 fps, não 50. */
export const BUDGET_SLOW_30HZ_MS = 41.7;
/**
 * `baseMs` é a cadência medida no aquecimento (mediana do intervalo do rAF). O intervalo do rAF mede a cadência da TELA,
 * não o custo do quadro: numa tela ou num navegador a 30 Hz a mediana já nasce em ~33 ms, e um limite fixo de 20 ms
 * derrubaria o 3D com a GPU ociosa.
 */
export type BudgetState = { level: 0 | 1 | 2; startedAt: number; slowSince: number | null; baseMs: number | null };
export const budgetStart = (nowMs: number): BudgetState => ({ level: 0, startedAt: nowMs, slowSince: null, baseMs: null });
/** Laço retomado (pausa, aba oculta, vazão zerada): aquece e mede a cadência de novo, sem perder o nível já baixado. */
export const budgetRestart = (s: BudgetState, nowMs: number): BudgetState => ({ ...s, startedAt: nowMs, slowSince: null, baseMs: null });
/** Limite do quadro conforme a cadência: ~60 Hz → 20 ms; ~30 Hz → 41,7 ms; já lento no aquecimento (> 36 ms) → 20 ms. */
export const budgetLimit = (baseMs: number | null) => (baseMs !== null && baseMs > 22 && baseMs <= 36 ? BUDGET_SLOW_30HZ_MS : BUDGET_SLOW_MS);
/**
 * Um passo do monitor: no fim do aquecimento grava a cadência-base; depois, com a mediana do quadro acima do limite por
 * 3 s seguidos, desce um nível e aquece de novo. Mediana boa zera a contagem.
 */
export function frameBudgetStep(s: BudgetState, nowMs: number, medianFrameMs: number): BudgetState {
  if (s.level === 2 || !Number.isFinite(medianFrameMs)) return s;
  if (nowMs - s.startedAt < BUDGET_WARMUP_MS) return s;
  if (s.baseMs === null) return { ...s, baseMs: medianFrameMs };
  if (medianFrameMs <= budgetLimit(s.baseMs)) return s.slowSince === null ? s : { ...s, slowSince: null };
  if (s.slowSince === null) return { ...s, slowSince: nowMs };
  if (nowMs - s.slowSince < BUDGET_HOLD_MS) return s;
  return { level: (s.level + 1) as 1 | 2, startedAt: nowMs, slowSince: null, baseMs: null };
}
export function median(values: readonly number[]): number {
  if (!values.length) return Number.NaN;
  const s = [...values].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Perda de contexto WebGL: a 1ª remonta o 3D num canvas novo; 2 perdas em 60 s = SVG até recarregar a página. */
export function contextLossPolicy(lossTimes: readonly number[], nowMs: number, windowMs = 60_000): "remount" | "stay-svg" {
  return lossTimes.filter(t => nowMs - t <= windowMs && t <= nowMs).length >= 2 ? "stay-svg" : "remount";
}

// ---------- faixa da vazão ----------
export type StripPoint = { t: number; v: number; source: LiveSource };
/**
 * Trechos contínuos da faixa: quebra quando a origem muda ou quando o buraco passa de MAX_GAP_MS.
 * Nunca acrescenta ponto em "agora": a linha termina na última amostra.
 */
export function stripSegments(points: StripPoint[], fromMs: number, toMs: number, maxGapMs = MAX_GAP_MS): StripPoint[][] {
  const inRange = points.filter(p => p.t >= fromMs - maxGapMs && p.t <= toMs).sort((a, b) => a.t - b.t);
  const out: StripPoint[][] = [];
  let cur: StripPoint[] = [];
  for (const p of inRange) {
    const prev = cur[cur.length - 1];
    if (prev && (p.source !== prev.source || p.t - prev.t > maxGapMs)) { out.push(cur); cur = []; }
    cur.push(p);
  }
  if (cur.length) out.push(cur);
  return out;
}
/** Teto do eixo: arredondado para cima num degrau legível, sempre acima do limiar. */
export function stripMax(points: StripPoint[], minFlowLpm: number) {
  const top = Math.max(minFlowLpm * 1.6, 1, ...points.map(p => p.v * 1.15));
  const mag = 10 ** Math.floor(Math.log10(top));
  for (const s of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (s * mag >= top) return s * mag;
  return 10 * mag;
}

// ---------- viagem do pacote ----------
export type TripSample = { kind: "leitura" | "sensor"; channel: LiveChannel; source: LiveSource; deviceCode: string; sequence: number | null; timing: LiveTiming; arrivalMs: number };
export type TripView = {
  /** Dispositivo → servidor: só com horário do dispositivo (HTTP com NTP); relógios diferentes, sempre "≈". */
  deviceMs: number | null;
  /** Recebido → emitido, no relógio do servidor (regra e banco incluídos). */
  processingMs: number | null;
  /** Emitido → chegou na tela, com o ajuste de relógio estimado pelo `hello`. */
  deliveryMs: number | null;
  serverToScreenMs: number | null;
  /** Só existe quando TODOS os trechos foram medidos. */
  totalMs: number | null;
  approx: boolean;
};
export function tripView(s: TripSample, offsetMs: number, offsetKnown: boolean): TripView {
  const received = Date.parse(s.timing.receivedAt), emitted = Date.parse(s.timing.emittedAt);
  const ok = Number.isFinite(received) && Number.isFinite(emitted);
  const processingMs = ok && emitted >= received ? emitted - received : null;
  const rawDelivery = Number.isFinite(emitted) ? s.arrivalMs + offsetMs - emitted : NaN;
  // Negativo além de ruído = ajuste de relógio errado: não vira número.
  const deliveryMs = Number.isFinite(rawDelivery) && rawDelivery >= -50 ? Math.max(0, Math.round(rawDelivery)) : null;
  const deviceAt = s.timing.deviceAt ? Date.parse(s.timing.deviceAt) : NaN;
  const deviceMs = Number.isFinite(deviceAt) && Number.isFinite(received) && received >= deviceAt ? received - deviceAt : null;
  const serverToScreenMs = processingMs !== null && deliveryMs !== null ? processingMs + deliveryMs : null;
  return {
    deviceMs, processingMs, deliveryMs, serverToScreenMs,
    totalMs: deviceMs !== null && serverToScreenMs !== null ? deviceMs + serverToScreenMs : null,
    approx: !offsetKnown || Math.abs(offsetMs) > CLOCK_APPROX_MS,
  };
}

// ---------- temperatura e balança (canal ao vivo, efêmero) ----------
export type TemperatureLive = { deviceId: string; deviceCode: string; c: number; humidityPct?: number; source: LiveSource; channel: LiveChannel; rule: TemperatureRuleProgress; at: number };
export type TemperatureView = { state: "normal" | "contando" | "sustentado"; label: string; fraction: number; limitFraction: number; ruleFraction: number; observed: number; stale: boolean };
export function temperatureView(t: TemperatureLive, nowMs: number): TemperatureView {
  const top = Math.max(t.rule.limitC * 1.25, t.rule.limitC + 5);
  const above = t.c > t.rule.limitC;
  const observed = above ? Math.floor(t.rule.observedSeconds) : 0;
  const limit = `${fixedBR(t.rule.limitC, 0)} °C`;
  const state = t.rule.suspicious ? "sustentado" : above ? "contando" : "normal";
  const label = state === "sustentado" ? `acima de ${limit} por ${t.rule.continuousSeconds} s · indício a verificar`
    : state === "contando" ? `acima de ${limit} · ${observed} s de ${t.rule.continuousSeconds} s` : `abaixo do limite de ${limit}`;
  return { state, label, fraction: clamp01(t.c / top), limitFraction: clamp01(t.rule.limitC / top), ruleFraction: clamp01(observed / t.rule.continuousSeconds), observed, stale: nowMs - t.at > SENSOR_STALE_MS };
}

export type ScaleLive = { deviceId: string; deviceCode: string; kg: number; source: LiveSource; channel: LiveChannel; progress: ScaleProgress; at: number };
export type ScaleLot = { id: string; kg: number; deviceCode: string; at: number };
export type ScalePhase = "vazia" | "abaixo" | "instavel" | "estabilizando" | "pedido" | "lote" | "rearmar" | "bloqueada";
export type ScaleView = { phase: ScalePhase; label: string; sub: string; total: number; lit: number; fill: number; stale: boolean };
/** Escala visual da caixa (representação esquemática): cheia em 10 kg ou no dobro do mínimo. */
export const crateFullKg = (minKg: number) => Math.max(10, minKg * 2);
export function scaleView(s: ScaleLive, lot: ScaleLot | null, nowMs: number): ScaleView {
  const p = s.progress;
  const total = Math.max(1, Math.min(12, Math.ceil(p.requiredSeconds)));
  const stable = Math.floor(p.stableSeconds);
  const base = { total, fill: clamp01(s.kg / crateFullKg(p.minKg)), stale: nowMs - s.at > SENSOR_STALE_MS };
  const min = `mínimo para lote: ${kgBR(p.minKg)}`;
  switch (p.phase) {
    case "idle": return { ...base, phase: s.kg < 0.05 ? "vazia" : "abaixo", label: s.kg < 0.05 ? "vazia" : "abaixo do mínimo", sub: min, lit: 0 };
    case "stabilizing":
      return stable < 1
        ? { ...base, phase: "instavel", label: "instável", sub: "aguardando peso estável", lit: 0 }
        : { ...base, phase: "estabilizando", label: `estabilizando ${Math.min(stable, p.requiredSeconds)}/${p.requiredSeconds} s`, sub: "segundos estáveis confirmados pela ponte", lit: Math.min(total, Math.floor((stable / p.requiredSeconds) * total)) };
    case "triggered":
      return lot ? { ...base, phase: "lote", label: "lote criado · aguardando verificação humana", sub: `${kgBR(lot.kg)} · a balança não decide que é doável`, lit: total }
        : { ...base, phase: "pedido", label: "lote pedido ao servidor", sub: "aguardando a gravação no banco", lit: total };
    case "disarmed":
      return { ...base, phase: "rearmar", label: "esvazie para rearmar", sub: lot ? `lote de ${kgBR(lot.kg)} aguardando verificação humana` : "esta pesagem já virou lote", lit: total };
    case "blocked":
      // A gravação recusou: já havia lote desta balança aguardando verificação. Esta pesagem NÃO virou lote.
      // Sem o lote pendente na tela (verificado nesse meio-tempo, ou snapshot ainda a caminho), não se afirma que ele segue pendente.
      return lot
        ? { ...base, phase: "bloqueada", label: "já existe lote desta balança aguardando verificação", sub: `nada novo criado · pendente: ${kgBR(lot.kg)} · esvazie para rearmar`, lit: total }
        : { ...base, phase: "bloqueada", label: "nada novo criado", sub: "havia lote desta balança aguardando verificação · esvazie para rearmar", lit: total };
  }
}

// ---------- feed ----------
export type FeedTone = "danger" | "warn" | "ok" | "info" | "muted";
export type FeedLine = { key: string; at: number; tone: FeedTone; title: string; detail: string; source: LiveSource | null };
const SEVERITY: Record<string, string> = { LOW: "baixa", MEDIUM: "média", HIGH: "alta", CRITICAL: "crítica" };
const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ");

function occurrenceLine(id: string, action: string, at: number, d: { title: string; severity?: string | null; deviceCode?: string | null; actor?: string | null; source: LiveSource | null }): FeedLine | null {
  const key = `occ:${id}:${action}`;
  const by = d.actor ? `por ${publicActor(d.actor)}` : null;
  switch (action) {
    case "CREATED": return { key, at, tone: "danger", title: "Ocorrência aberta", detail: join(d.title, d.severity && `severidade ${SEVERITY[d.severity] ?? d.severity}`, d.deviceCode), source: d.source };
    case "ACKNOWLEDGED": return { key, at, tone: "warn", title: "Ocorrência assumida", detail: join(d.title, by), source: d.source };
    case "RESOLVED": return { key, at, tone: "ok", title: "Ocorrência resolvida", detail: join(d.title, by), source: d.source };
    case "DISMISSED": return { key, at, tone: "muted", title: "Ocorrência descartada", detail: join(d.title, by), source: d.source };
    default: return null;
  }
}
/** Linha de lote: instituição sim, quem recebeu NUNCA (o tipo nem aceita esse campo). */
function donationLine(id: string, action: string, at: number, d: { kg: number | null; institution?: string | null; deviceCode?: string | null; source: LiveSource | null }): FeedLine | null {
  const key = `don:${id}:${action}`;
  const kg = d.kg !== null ? ` · ${kgBR(d.kg)}` : "";
  switch (action) {
    case "CREATED": return { key, at, tone: "info", title: `Lote criado${kg}`, detail: join(d.deviceCode ? `balança ${d.deviceCode}` : "registro manual", "aguardando verificação humana"), source: d.source };
    case "AVAILABLE": return { key, at, tone: "ok", title: `Lote verificado${kg}`, detail: "verificação humana registrada · disponível para doação", source: d.source };
    case "RESERVED": return { key, at, tone: "info", title: `Lote reservado${kg}`, detail: `para ${d.institution ?? "instituição parceira"}`, source: d.source };
    case "DELIVERED": return { key, at, tone: "ok", title: `Lote entregue${kg}`, detail: `${d.institution ?? "instituição parceira"} confirmou o recebimento`, source: d.source };
    case "CANCELLED": return { key, at, tone: "muted", title: `Lote cancelado${kg}`, detail: "motivo registrado na auditoria", source: d.source };
    default: return null;
  }
}

/** Linha do feed para eventos de negócio. Leitura não vira linha (vai para o pulso) e `sensor.live` também não. */
export function lineFromEvent(e: LiveEvent): FeedLine | null {
  const at = Date.parse(e.emittedAt);
  switch (e.type) {
    case "occurrence.opened": return occurrenceLine(e.id, "CREATED", at, { title: e.title, severity: e.severity, deviceCode: e.deviceCode, source: e.source });
    case "occurrence.status": return occurrenceLine(e.id, e.status, at, { title: e.title, actor: e.actor, source: e.source ?? null });
    case "donation.created": return donationLine(e.id, "CREATED", at, { kg: e.kg, deviceCode: e.origin === "scale" ? e.deviceCode ?? "?" : null, source: e.source });
    case "donation.status": return donationLine(e.id, e.status, at, { kg: e.kg, institution: e.recipientName ?? null, source: e.source ?? null });
    case "message.rejected": return { key: `rej:${e.emittedAt}:${e.channel}:${e.reason}`, at, tone: "warn", title: "Mensagem descartada", detail: join(e.reason, CHANNEL_LABEL[e.channel] ?? e.channel), source: null };
    default: return null;
  }
}
export function lineFromAudit(a: StageAuditEntry): FeedLine | null {
  const at = Date.parse(a.at);
  return a.entity === "Occurrence"
    ? occurrenceLine(a.entityId, a.action, at, { title: a.title, severity: a.action === "CREATED" ? a.severity : null, deviceCode: a.action === "CREATED" ? a.deviceCode : null, actor: a.action === "CREATED" ? null : a.actor, source: a.source })
    : donationLine(a.entityId, a.action, at, { kg: a.kg, institution: a.institution, deviceCode: a.action === "CREATED" ? a.deviceCode : null, source: a.source });
}

/** Marca da regra por dispositivo e origem, para detectar quando a contagem começa ou zera (transições DECIDIDAS pelo servidor). */
export type RuleMark = { above: boolean; observed: number; at: number };
export function ruleTransition(prev: RuleMark | undefined, next: RuleMark, ctx: { key: string; emittedAt: number; deviceCode: string; source: LiveSource; minFlowLpm: number; continuousSeconds: number }): FeedLine[] {
  if (prev && next.at < prev.at) return [];
  const min = `${fixedBR(ctx.minFlowLpm, 1)} L/min`;
  const line = (kind: string, tone: FeedTone, title: string, detail: string): FeedLine => ({ key: `rule:${ctx.key}:${kind}`, at: ctx.emittedAt, tone, title, detail, source: ctx.source });
  if (prev?.above && !next.above)
    return [line("zerou", "muted", "Contagem zerada", join(`${stoppedAt(Math.floor(prev.observed))} de ${ctx.continuousSeconds} s`, `vazão abaixo de ${min}`, ctx.deviceCode))];
  if (prev?.above && next.above && next.observed + 0.5 < prev.observed)
    return [line("reiniciou", "muted", "Contagem reiniciada", join(`lacuna maior que ${DEFAULT_MAX_GAP_SECONDS} s entre leituras`, "a regra não supõe fluxo sem amostra", ctx.deviceCode))];
  if (!prev?.above && next.above)
    return [line("contando", "warn", "Regra começou a contar", join(`${min} ou mais`, `precisa de ${ctx.continuousSeconds} s sem pausa`, ctx.deviceCode))];
  return [];
}

export function offlineLine(device: { id: string; code: string }, lastSeenMs: number): FeedLine {
  return { key: `off:${device.id}:${lastSeenMs}`, at: lastSeenMs + OFFLINE_MS, tone: "warn", title: "Sem comunicação", detail: join(device.code, `último contato ${clockBR(lastSeenMs)}`, `mais de ${OFFLINE_AFTER_SECONDS} s sem pacote`), source: null };
}

/**
 * Junta linhas novas: a primeira vez que uma chave aparece vale (evento e auditoria do mesmo fato não duplicam).
 * Exceção: se a linha guardada não tem origem (evento antigo, sem `source`) e chega a mesma chave COM origem (auditoria
 * do snapshot), a origem entra na linha guardada: o selo SIMULADO nunca se perde por causa da ordem de chegada.
 */
export function mergeFeed(current: FeedLine[], add: (FeedLine | null)[], max = FEED_MAX): FeedLine[] {
  const pos = new Map(current.map((l, i) => [l.key, i] as const));
  const freshPos = new Map<string, number>();
  const fresh: FeedLine[] = [];
  let base = current;
  for (const l of add) {
    if (!l || !Number.isFinite(l.at)) continue;
    const i = pos.get(l.key), j = freshPos.get(l.key);
    if (i === undefined && j === undefined) { freshPos.set(l.key, fresh.length); fresh.push(l); continue; }
    if (l.source === null) continue;
    if (i !== undefined && base[i].source === null) { if (base === current) base = [...current]; base[i] = { ...base[i], source: l.source }; }
    else if (j !== undefined && fresh[j].source === null) fresh[j] = { ...fresh[j], source: l.source };
  }
  if (!fresh.length && base === current) return current;
  return [...fresh, ...base].sort((a, b) => b.at - a.at).slice(0, max);
}

// ---------- ordem das consultas do snapshot ----------
/** Ids crescentes por consulta: o sucesso mais novo aplicado e a falha mais nova exibida. */
export type RefreshGate = { applied: number; failed: number };
export type RefreshVerdict = { gate: RefreshGate; apply: boolean; error: "set" | "clear" | "keep" };
/**
 * Decide o que fazer com a resposta da consulta `id`. Resposta antiga nunca volta o estado no tempo: dado velho não
 * substitui dado novo, e a falha de uma consulta antiga não põe a faixa de erro sobre o sucesso de uma mais nova.
 * Um sucesso só apaga a faixa se for mais novo que a última falha.
 */
export function settleRefresh(g: RefreshGate, id: number, ok: boolean): RefreshVerdict {
  if (id < g.applied) return { gate: g, apply: false, error: "keep" };
  if (ok) return { gate: { ...g, applied: id }, apply: true, error: id > g.failed ? "clear" : "keep" };
  return { gate: { ...g, failed: Math.max(g.failed, id) }, apply: false, error: "set" };
}

// ---------- dispositivo em foco ----------
export type FocusCandidate = { id: string; code: string; kind: string; lastSeenAt: string | null };
/**
 * Dispositivo da vazão: o fixado na URL (?dispositivo=CODIGO); senão mantém o atual enquanto ele manda leitura
 * (30 s) para a tela não pular entre dois sensores; senão o de leitura mais recente.
 */
export function pickFocus(devices: FocusCandidate[], lastReadingAt: Record<string, number>, o: { pinnedCode: string | null; currentId: string | null; nowMs: number }): string | null {
  if (o.pinnedCode) {
    const pinned = devices.find(d => d.code.toLowerCase() === o.pinnedCode!.toLowerCase());
    if (pinned) return pinned.id;
  }
  const last = (id: string) => lastReadingAt[id] ?? -Infinity;
  const current = o.currentId && devices.some(d => d.id === o.currentId) ? o.currentId : null;
  if (current && o.nowMs - last(current) <= 30_000) return current;
  const withReading = devices.filter(d => Number.isFinite(last(d.id))).sort((a, b) => last(b.id) - last(a.id));
  if (withReading.length) return withReading[0].id;
  if (current) return current;
  const seen = (d: FocusCandidate) => (d.lastSeenAt ? Date.parse(d.lastSeenAt) : -Infinity);
  const flow = devices.filter(d => d.kind === "FLOW").sort((a, b) => seen(b) - seen(a))[0] ?? devices[0];
  return flow?.id ?? null;
}
