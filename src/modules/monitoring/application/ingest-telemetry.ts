import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { FlowAlertPolicy } from "../domain/flow-alert-policy";
import { openFlowOccurrence } from "./open-flow-occurrence";
import { getDb } from "@/lib/db";
export const telemetrySchema = z.object({
  deviceCode: z.string().min(3).max(80), bootId: z.string().min(4).max(80),
  sequence: z.number().int().min(0),
  flowLpm: z.number().finite().min(0).max(1000),
  deltaLiters: z.number().finite().min(0).max(10000),
  capturedAt: z.iso.datetime({ offset: true }),
});
export type TelemetryCommand = z.infer<typeof telemetrySchema>;
export type IngestResult = { accepted: true; duplicate: boolean; alerted: boolean; occurrenceId?: string };
/** Dispositivo já identificado pelo canal: chave no HTTP, broker autenticado no MQTT. */
export type IngestDevice = { id: string; organizationId: string; siteId: string; code: string; minFlowLpm: number; continuousSeconds: number };
export type IngestReading = { bootId: string; sequence: number; flowLpm: number; deltaLiters: number; capturedAt: Date };
export type IngestChannel = "http" | "mqtt";
const hash = (s: string) => createHash("sha256").update(s).digest();

/**
 * Caminho único de gravação de leitura e avaliação da regra de fluxo, comum ao HTTP e à ponte MQTT:
 * idempotência, último contato, regra por dispositivo (regra 3) e ocorrência única (regra 5) valem igual nos dois canais.
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
  if (!decision.suspicious) return { accepted: true, duplicate: false, alerted: false };
  const simulated = source === "SIMULATED";
  const via = channel === "mqtt" ? " (via MQTT)" : "";
  const opened = await openFlowOccurrence({
    organizationId: device.organizationId, siteId: device.siteId, deviceId: device.id, source,
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
  });
  return { accepted: true, duplicate: false, alerted: opened.created, occurrenceId: opened.occurrenceId };
}

/** Canal HTTP do firmware: autentica pela chave do dispositivo e confere o relógio antes de gravar. */
export class IngestTelemetry {
  async execute(command: TelemetryCommand, deviceKey: string, simulated = false): Promise<IngestResult> {
    const device = await getDb().device.findUnique({ where: { code: command.deviceCode } });
    const stored = device ? Buffer.from(device.apiKeyHash, "hex") : null;
    // Hash malformado no banco não pode virar exceção (timingSafeEqual exige tamanhos iguais).
    if (!device || !stored || stored.length !== 32 || !deviceKey || !timingSafeEqual(hash(deviceKey), stored))
      throw new Error("NOT_AUTHORIZED");
    const time = new Date(command.capturedAt);
    const skew = Math.abs(Date.now() - time.getTime());
    if (skew > 5 * 60_000) throw new Error("CLOCK_SKEW");
    return ingestReading(device, {
      bootId: command.bootId, sequence: command.sequence, flowLpm: command.flowLpm, deltaLiters: command.deltaLiters, capturedAt: time,
    }, simulated ? "SIMULATED" : "DEVICE", "http");
  }
}
