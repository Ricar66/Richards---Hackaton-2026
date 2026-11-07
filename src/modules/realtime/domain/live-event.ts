/**
 * Contrato v1 do barramento ao vivo: PostgreSQL NOTIFY → rota SSE → navegador.
 *
 * Regras de honestidade:
 * - Só viaja fato JÁ GRAVADO (o NOTIFY dentro da transação só é entregue no COMMIT), com uma exceção explícita:
 *   `sensor.live`, que é efêmero e leva `persisted: false` (temperatura, umidade e peso da bancada ainda não têm série no banco).
 * - Agregados (KPIs, séries, kg entregues) NUNCA são somados a partir de eventos: a tela refaz a busca no servidor.
 * - Nome de quem recebeu um lote não viaja (o telão é público).
 * Domínio puro: sem banco, HTTP ou framework.
 */
export const LIVE_CHANNEL = "richards_events";
export const LIVE_EVENT_VERSION = 1 as const;
/** O NOTIFY aceita até 8000 bytes; acima deste limite o evento vira `resync` e a tela busca o snapshot. */
export const LIVE_PAYLOAD_LIMIT = 7500;

export type LiveSource = "DEVICE" | "SIMULATED" | "MANUAL";
export type LiveChannel = "http" | "mqtt" | "bancada-virtual";

/** Estado da regra de fluxo DECIDIDO pela FlowAlertPolicy para esta leitura (nunca interpolado na tela). */
export type FlowRuleProgress = { minFlowLpm: number; continuousSeconds: number; observedSeconds: number; suspicious: boolean };
/** Estado da regra de temperatura decidido pela TemperatureAlertPolicy para esta leitura. */
export type TemperatureRuleProgress = { limitC: number; continuousSeconds: number; observedSeconds: number; suspicious: boolean };
/** Estado do detector da balança (ScaleSurplusDetector) depois desta leitura. */
export type ScaleProgress = {
  /**
   * idle: abaixo do mínimo · stabilizing: contando segundos estáveis · triggered: lote acabou de ser pedido (e gravado) ·
   * disarmed: já registrou, esvazie para rearmar · blocked: a carga estabilizou, mas já havia lote desta balança
   * aguardando verificação; NADA novo foi criado (esvazie para rearmar).
   */
  phase: "idle" | "stabilizing" | "triggered" | "disarmed" | "blocked";
  minKg: number; stableSeconds: number; requiredSeconds: number;
  /** Só em `blocked`: o lote pendente que impediu a criação. */
  pendingLotId?: string;
};
/** Carimbos de tempo para a "viagem do pacote". Só trechos medidos no mesmo relógio; a tela nunca soma trecho desconhecido. */
export type LiveTiming = {
  /** Quando o servidor (rota HTTP ou ponte) recebeu a mensagem. */
  receivedAt: string;
  /** Quando o evento foi emitido (logo antes do commit/NOTIFY). */
  emittedAt: string;
  /** Hora informada pelo dispositivo (HTTP com NTP). Ausente no MQTT, que não manda horário. */
  deviceAt?: string;
};

type Base = { v: typeof LIVE_EVENT_VERSION; orgId: string; emittedAt: string };

export type ReadingCreatedEvent = Base & {
  type: "reading.created";
  deviceId: string; deviceCode: string; siteId: string;
  bootId: string; sequence: number; capturedAt: string;
  flowLpm: number; deltaLiters: number; source: LiveSource; channel: LiveChannel;
  rule: FlowRuleProgress; timing: LiveTiming;
  /** Ocorrência de fluxo ativa ligada a esta leitura (aberta agora ou já existente: regra 5). */
  occurrenceId?: string;
};
export type OccurrenceOpenedEvent = Base & {
  type: "occurrence.opened";
  id: string; deviceId: string | null; deviceCode: string | null;
  kind: "UNUSUAL_FLOW" | "DEVICE_OFFLINE" | "TEMPERATURE_EXCURSION" | "MANUAL";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string; source: LiveSource; openedAt: string; channel?: LiveChannel;
};
export type OccurrenceStatusEvent = Base & {
  type: "occurrence.status";
  id: string; deviceId: string | null; kind: OccurrenceOpenedEvent["kind"]; title: string;
  from: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED"; status: "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";
  actor: string;
  /**
   * Origem do registro (regra 1: SIMULATED carimbado também na mudança de estado). Obrigatória: o compilador
   * impede emissor que esqueça. O leitor ainda tolera ausência (tela sem selo até o snapshot trazer a origem).
   */
  source: LiveSource;
};
export type DonationCreatedEvent = Base & {
  type: "donation.created";
  id: string; kg: number; status: "PENDING_REVIEW"; source: LiveSource;
  origin: "manual" | "scale"; deviceCode?: string; description: string;
};
export type DonationStatusEvent = Base & {
  type: "donation.status";
  id: string; kg: number;
  from: "PENDING_REVIEW" | "AVAILABLE" | "RESERVED" | "DELIVERED" | "CANCELLED";
  status: "AVAILABLE" | "RESERVED" | "DELIVERED" | "CANCELLED";
  /** Só o nome da instituição; quem recebeu NÃO viaja. */
  recipientName?: string;
  /** Origem do lote (regra 1). Obrigatória no emissor; o leitor tolera ausência. */
  source: LiveSource;
};
export type SensorLiveEvent = Base & {
  type: "sensor.live";
  persisted: false;
  deviceId: string; deviceCode: string; channel: LiveChannel; at: string;
  temperature?: { c: number; humidityPct?: number; source: LiveSource; rule: TemperatureRuleProgress };
  scale?: { kg: number; source: LiveSource; progress: ScaleProgress };
  timing: LiveTiming;
};
export type MessageRejectedEvent = Base & {
  type: "message.rejected";
  channel: LiveChannel;
  /** Motivo curto e sem dados sensíveis (ex.: "JSON inválido", "dispositivo não cadastrado"). */
  reason: string;
};
export type ResyncEvent = Base & { type: "resync"; reason: string };

export type LiveEvent =
  | ReadingCreatedEvent | OccurrenceOpenedEvent | OccurrenceStatusEvent
  | DonationCreatedEvent | DonationStatusEvent | SensorLiveEvent
  | MessageRejectedEvent | ResyncEvent;
export type LiveEventType = LiveEvent["type"];
/** Evento sem os campos que o emissor preenche (versão e hora de emissão). */
export type LiveEventInput = LiveEvent extends infer E ? E extends LiveEvent ? Omit<E, "v" | "emittedAt"> : never : never;

const TYPES: ReadonlySet<string> = new Set<LiveEventType>([
  "reading.created", "occurrence.opened", "occurrence.status", "donation.created", "donation.status",
  "sensor.live", "message.rejected", "resync",
]);

/** Monta o evento com versão e hora de emissão. */
export function stampLiveEvent(input: LiveEventInput, now = new Date()): LiveEvent {
  return { ...input, v: LIVE_EVENT_VERSION, emittedAt: now.toISOString() } as LiveEvent;
}

/** Serializa para o NOTIFY. Se passar do limite, devolve um `resync` (a tela busca o snapshot): nunca trunca JSON. */
export function encodeLiveEvent(event: LiveEvent): string {
  const json = JSON.stringify(event);
  if (new TextEncoder().encode(json).length <= LIVE_PAYLOAD_LIMIT) return json;
  const resync: ResyncEvent = { v: LIVE_EVENT_VERSION, type: "resync", orgId: event.orgId, emittedAt: event.emittedAt, reason: `evento ${event.type} grande demais` };
  return JSON.stringify(resync);
}

/** Lê um evento vindo do NOTIFY ou do SSE. Versão ou tipo desconhecido → null (ignorado, nunca adivinhado). */
export function parseLiveEvent(raw: string): LiveEvent | null {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== "object") return null;
  const e = value as { v?: unknown; type?: unknown; orgId?: unknown; emittedAt?: unknown };
  if (e.v !== LIVE_EVENT_VERSION || typeof e.type !== "string" || !TYPES.has(e.type)) return null;
  if (typeof e.orgId !== "string" || typeof e.emittedAt !== "string") return null;
  return value as LiveEvent;
}

/** Quadros de controle da rota SSE (não passam pelo banco). */
export type LiveHello = { serverTime: string; listening: boolean };
export type LiveHeartbeat = { serverTime: string; listening: boolean };
