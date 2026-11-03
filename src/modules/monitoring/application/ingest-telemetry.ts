import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { FlowAlertPolicy } from "../domain/flow-alert-policy";
import { getDb } from "@/lib/db";
export const telemetrySchema = z.object({
  deviceCode: z.string().min(3).max(80), bootId: z.string().min(4).max(80),
  sequence: z.number().int().min(0),
  flowLpm: z.number().finite().min(0).max(1000),
  deltaLiters: z.number().finite().min(0).max(10000),
  capturedAt: z.iso.datetime({ offset: true }),
});
export type TelemetryCommand = z.infer<typeof telemetrySchema>;
const hash = (s: string) => createHash("sha256").update(s).digest();
export class IngestTelemetry {
  async execute(command: TelemetryCommand, deviceKey: string, simulated = false) {
    const db = getDb();
    const device = await db.device.findUnique({ where: { code: command.deviceCode } });
    if (!device || !deviceKey || !timingSafeEqual(hash(deviceKey), Buffer.from(device.apiKeyHash, "hex")))
      throw new Error("NOT_AUTHORIZED");
    const time = new Date(command.capturedAt);
    const skew = Math.abs(Date.now() - time.getTime());
    if (skew > 5 * 60_000) throw new Error("CLOCK_SKEW");
    // Delivery idempotence: boot + sequence; duplicated retries never double-count water.
    const duplicate = await db.telemetryReading.findUnique({ where: { deviceId_bootId_sequence: { deviceId: device.id, bootId: command.bootId, sequence: command.sequence } } });
    if (duplicate) return { accepted: true, duplicate: true, alerted: false };
    await db.telemetryReading.create({ data: {
      deviceId: device.id, bootId: command.bootId, sequence: command.sequence,
      flowLpm: command.flowLpm, deltaLiters: command.deltaLiters, capturedAt: time, source: simulated ? "SIMULATED" : "DEVICE",
    } });
    await db.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date(), state: "ONLINE" } });
    const since = new Date(time.getTime() - Math.max(device.continuousSeconds + 60, 120) * 1000);
    const history = await db.telemetryReading.findMany({ where: { deviceId: device.id, capturedAt: { gte: since, lte: time } }, orderBy: { capturedAt: "asc" }, take: 120 });
    const policy = new FlowAlertPolicy(device.minFlowLpm, device.continuousSeconds);
    const decision = policy.evaluate(history.map(x => ({ capturedAt: x.capturedAt, flowLpm: Number(x.flowLpm), deltaLiters: Number(x.deltaLiters) })));
    if (!decision.suspicious) return { accepted: true, duplicate: false, alerted: false };
    const existing = await db.occurrence.findFirst({ where: { deviceId: device.id, kind: "UNUSUAL_FLOW", status: { in: ["OPEN", "ACKNOWLEDGED"] } } });
    if (existing) return { accepted: true, duplicate: false, alerted: false, occurrenceId: existing.id };
    const alert = await db.occurrence.create({ data: {
      organizationId: device.organizationId, siteId: device.siteId, deviceId: device.id,
      kind: "UNUSUAL_FLOW", source: simulated ? "SIMULATED" : "DEVICE", severity: "HIGH", status: "OPEN",
      title: "Fluxo contínuo fora do padrão", description: `Vazão igual ou superior a ${device.minFlowLpm} L/min por ${Math.round(decision.observedSeconds)} segundos. Requer verificação.`,
      suspectedLiters: decision.suspectVolumeLiters,
      events: { create: { action: "CREATED", note: "Gerada automaticamente a partir de leituras do sensor" } },
    } });
    return { accepted: true, duplicate: false, alerted: true, occurrenceId: alert.id };
  }
}
