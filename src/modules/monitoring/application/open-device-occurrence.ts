import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { auditRecord } from "@/modules/audit/infrastructure/audit-record";
import type { LiveChannel } from "@/modules/realtime/domain/live-event";
import { notifyLive } from "@/modules/realtime/infrastructure/notify-event";
export type DeviceOccurrenceKind = "UNUSUAL_FLOW" | "TEMPERATURE_EXCURSION" | "MANUAL";
export type OpenDeviceOccurrenceInput = {
  kind: DeviceOccurrenceKind; severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  organizationId: string; siteId: string; deviceId: string;
  /** Código do dispositivo para o aviso ao vivo; ausente, é buscado na mesma transação. */
  deviceCode?: string;
  source: "DEVICE" | "SIMULATED" | "MANUAL"; title: string; description: string; suspectedLiters?: number | null;
  eventNote: string; actor: string; evidence: Record<string, Prisma.InputJsonValue | null>;
};
export type OpenDeviceOccurrenceResult = { created: boolean; occurrenceId: string };
const CHANNELS: ReadonlySet<string> = new Set<LiveChannel>(["http", "mqtt", "bancada-virtual"]);
export const OCCURRENCE_TX = { maxWait: 5_000, timeout: 10_000 } as const;

/**
 * Regra inviolável 5: no máximo UMA ocorrência ativa (OPEN/ACKNOWLEDGED) por dispositivo, tipo e ORIGEM.
 * A origem entra na regra como já entrava na FlowAlertPolicy (leitura simulada nunca sustenta alerta real): uma
 * ocorrência SIMULATED (demonstração, seed, bancada) nunca impede o sensor real de abrir a dele, nem o contrário, e
 * duas ocorrências REAIS ativas do mesmo dispositivo e tipo continuam impossíveis.
 * Roda DENTRO de uma transação já aberta (`tx`): o advisory lock serializa leituras simultâneas do mesmo dispositivo e
 * tipo até o COMMIT; ocorrência, timeline, auditoria e o aviso `occurrence.opened` (entregue só no COMMIT) ficam na
 * mesma transação de quem chamou. Se ela for desfeita, nada disso existiu, nem para o telão.
 */
export async function openDeviceOccurrenceIn(tx: Prisma.TransactionClient, input: OpenDeviceOccurrenceInput): Promise<OpenDeviceOccurrenceResult> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`occurrence:${input.kind}:${input.deviceId}:${input.source}`}))`;
  const existing = await tx.occurrence.findFirst({ where: { deviceId: input.deviceId, kind: input.kind, source: input.source, status: { in: ["OPEN", "ACKNOWLEDGED"] } }, select: { id: true } });
  if (existing) return { created: false, occurrenceId: existing.id };
  const occurrence = await tx.occurrence.create({ data: {
    organizationId: input.organizationId, siteId: input.siteId, deviceId: input.deviceId,
    kind: input.kind, source: input.source, severity: input.severity, status: "OPEN",
    title: input.title, description: input.description, suspectedLiters: input.suspectedLiters ?? null,
    events: { create: { action: "CREATED", note: input.eventNote, actor: input.actor } },
  } });
  await tx.auditEvent.create({ data: auditRecord({
    organizationId: input.organizationId, entity: "Occurrence", entityId: occurrence.id,
    action: "CREATED", actor: input.actor, metadata: { source: input.source, ...input.evidence },
  }) });
  const deviceCode = input.deviceCode ?? (await tx.device.findUnique({ where: { id: input.deviceId }, select: { code: true } }))?.code ?? null;
  const channel = input.evidence.channel;
  await notifyLive(tx, {
    type: "occurrence.opened", orgId: input.organizationId, id: occurrence.id, deviceId: input.deviceId, deviceCode,
    kind: input.kind, severity: input.severity, title: input.title, source: input.source, openedAt: occurrence.openedAt.toISOString(),
    ...(typeof channel === "string" && CHANNELS.has(channel) ? { channel: channel as LiveChannel } : {}),
  });
  return { created: true, occurrenceId: occurrence.id };
}

/** Abre (ou devolve a ativa) numa transação própria. Para abrir junto com outra gravação, use `openDeviceOccurrenceIn`. */
export async function openDeviceOccurrence(input: OpenDeviceOccurrenceInput): Promise<OpenDeviceOccurrenceResult> {
  return getDb().$transaction(tx => openDeviceOccurrenceIn(tx, input), OCCURRENCE_TX);
}
