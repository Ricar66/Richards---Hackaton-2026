import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { FlowAlertPolicy } from "../domain/flow-alert-policy";
import { openFlowOccurrence } from "./open-flow-occurrence";
import { getDb } from "@/lib/db";
import type { FlowRuleProgress, LiveChannel, ReadingCreatedEvent } from "@/modules/realtime/domain/live-event";
import { notifyLiveSafe } from "@/modules/realtime/infrastructure/notify-event";
export const telemetrySchema = z.object({
  deviceCode: z.string().min(3).max(80), bootId: z.string().min(4).max(80),
  sequence: z.number().int().min(0),
  flowLpm: z.number().finite().min(0).max(1000),
  deltaLiters: z.number().finite().min(0).max(10000),
  capturedAt: z.iso.datetime({ offset: true }),
});
export type TelemetryCommand = z.infer<typeof telemetrySchema>;
/** `rule`: estado decidido pela FlowAlertPolicy para esta leitura (ausente em duplicata, que não é reavaliada). */
export type IngestResult = { accepted: true; duplicate: boolean; alerted: boolean; occurrenceId?: string; rule?: FlowRuleProgress };
/** Dispositivo já identificado pelo canal: chave no HTTP, broker autenticado no MQTT. */
export type IngestDevice = { id: string; organizationId: string; siteId: string; code: string; minFlowLpm: number; continuousSeconds: number };
/** `receivedAt`: quando o servidor (rota HTTP ou ponte) recebeu a mensagem; só vai para o carimbo de tempo do evento ao vivo. */
export type IngestReading = { bootId: string; sequence: number; flowLpm: number; deltaLiters: number; capturedAt: Date; receivedAt?: Date };
export type IngestChannel = LiveChannel;
/** Como o canal aparece na nota da timeline: a auditoria nunca mente sobre por onde a leitura entrou. */
export const CHANNEL_NOTE: Record<IngestChannel, string> = { http: "", mqtt: " (via MQTT)", "bancada-virtual": " (bancada virtual)" };
const hash = (s: string) => createHash("sha256").update(s).digest();

/**
 * Caminho único de gravação de leitura e avaliação da regra de fluxo, comum ao HTTP e à ponte MQTT:
 * idempotência, último contato, regra por dispositivo (regra 3) e ocorrência única (regra 5) valem igual nos dois canais.
 * Leitura NOVA gravada vira `reading.created` no canal ao vivo (best-effort: falha do aviso nunca recusa a leitura);
 * duplicata não avisa nada.
 */
export async function ingestReading(device: IngestDevice, reading: IngestReading, source: "DEVICE" | "SIMULATED", channel: IngestChannel = "http"): Promise<IngestResult> {
  const db = getDb();
  const time = reading.capturedAt;
  // Idempotência por (deviceId, bootId, sequence) decidida pela constraint UNIQUE (INSERT ... ON CONFLICT DO NOTHING):
  // retentativas e requisições simultâneas nunca somam volume duas vezes nem viram erro 503.
  const { count } = await db.telemetryReading.createMany({ data: [{
    deviceId: device.id, bootId: reading.bootId, sequence: reading.sequence,
    flowLpm: reading.flowLpm, deltaLiters: reading.deltaLiters, capturedAt: time, source,
  }], skipDuplicates: true });
  if (count === 0) return { accepted: true, duplicate: true, alerted: false };
  // Só o último contato: conectividade é calculada na leitura e MAINTENANCE (decisão humana) não pode ser sobrescrito.
  await db.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
  const since = new Date(time.getTime() - Math.max(device.continuousSeconds + 60, 120) * 1000);
  // Mesma origem da leitura atual: amostra simulada nunca sustenta alerta de DEVICE (nem o contrário).
  // Mais recentes primeiro: com leituras frequentes (MQTT a cada 2 s) o limite de 120 não pode cortar a ponta da janela.
  const history = await db.telemetryReading.findMany({ where: { deviceId: device.id, source, capturedAt: { gte: since, lte: time } }, orderBy: { capturedAt: "desc" }, take: 120 });
  const policy = new FlowAlertPolicy(device.minFlowLpm, device.continuousSeconds);
  const decision = policy.evaluate(history.map(x => ({ capturedAt: x.capturedAt, flowLpm: Number(x.flowLpm), deltaLiters: Number(x.deltaLiters) })));
  const rule: FlowRuleProgress = { minFlowLpm: device.minFlowLpm, continuousSeconds: device.continuousSeconds, observedSeconds: decision.observedSeconds, suspicious: decision.suspicious };
  const announce = (occurrenceId?: string) => {
    const emittedAt = new Date();
    const event: Omit<ReadingCreatedEvent, "v" | "emittedAt"> = {
      type: "reading.created", orgId: device.organizationId, deviceId: device.id, deviceCode: device.code, siteId: device.siteId,
      bootId: reading.bootId, sequence: reading.sequence, capturedAt: time.toISOString(),
      flowLpm: reading.flowLpm, deltaLiters: reading.deltaLiters, source, channel, rule,
      // Só o HTTP traz hora do próprio dispositivo (NTP); no MQTT o `capturedAt` é a hora da ponte.
      timing: { receivedAt: (reading.receivedAt ?? emittedAt).toISOString(), emittedAt: emittedAt.toISOString(), ...(channel === "http" ? { deviceAt: time.toISOString() } : {}) },
      ...(occurrenceId ? { occurrenceId } : {}),
    };
    return notifyLiveSafe(event, emittedAt);
  };
  if (!decision.suspicious) { await announce(); return { accepted: true, duplicate: false, alerted: false, rule }; }
  const simulated = source === "SIMULATED";
  const via = CHANNEL_NOTE[channel];
  let opened: Awaited<ReturnType<typeof openFlowOccurrence>>;
  // A leitura já está gravada: mesmo se abrir a ocorrência falhar, o fato "leitura recebida" é avisado.
  try { opened = await openFlowOccurrence({
    organizationId: device.organizationId, siteId: device.siteId, deviceId: device.id, deviceCode: device.code, source,
    title: "Fluxo contínuo fora do padrão",
    description: `Vazão igual ou superior a ${device.minFlowLpm} L/min por ${Math.round(decision.observedSeconds)} segundos. Requer verificação.`,
    suspectedLiters: decision.suspectVolumeLiters,
    eventNote: (simulated ? "Gerada automaticamente a partir de leituras SIMULADAS" : "Gerada automaticamente a partir de leituras do sensor") + via,
    actor: `${simulated ? "simulador" : "dispositivo"}:${device.code}`,
    evidence: {
      channel,
      windowStart: new Date(time.getTime() - decision.observedSeconds * 1000).toISOString(), windowEnd: time.toISOString(),
      observedSeconds: decision.observedSeconds, suspectVolumeLiters: decision.suspectVolumeLiters,
      rule: { minFlowLpm: device.minFlowLpm, continuousSeconds: device.continuousSeconds },
      trigger: { bootId: reading.bootId, sequence: reading.sequence },
    },
  }); } catch (error) { await announce(); throw error; }
  await announce(opened.occurrenceId);
  return { accepted: true, duplicate: false, alerted: opened.created, occurrenceId: opened.occurrenceId, rule };
}

/** Canal HTTP do firmware: autentica pela chave do dispositivo e confere o relógio antes de gravar. */
export class IngestTelemetry {
  async execute(command: TelemetryCommand, deviceKey: string, simulated = false, receivedAt = new Date()): Promise<IngestResult> {
    const device = await getDb().device.findUnique({ where: { code: command.deviceCode } });
    const stored = device ? Buffer.from(device.apiKeyHash, "hex") : null;
    // Hash malformado no banco não pode virar exceção (timingSafeEqual exige tamanhos iguais).
    if (!device || !stored || stored.length !== 32 || !deviceKey || !timingSafeEqual(hash(deviceKey), stored))
      throw new Error("NOT_AUTHORIZED");
    const time = new Date(command.capturedAt);
    const skew = Math.abs(Date.now() - time.getTime());
    if (skew > 5 * 60_000) throw new Error("CLOCK_SKEW");
    return ingestReading(device, {
      bootId: command.bootId, sequence: command.sequence, flowLpm: command.flowLpm, deltaLiters: command.deltaLiters, capturedAt: time, receivedAt,
    }, simulated ? "SIMULATED" : "DEVICE", "http");
  }
}
