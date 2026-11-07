import { DatabaseUnavailableError, getDb } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
import type { LiveDTO, SourceKey } from "../domain/dashboard";

const RECENT_WINDOW_MS = 30 * 60_000;

/** Sinal mais recente da organização: alimenta o indicador "ao vivo" e o aviso de nova ocorrência (polling curto, não streaming). */
export async function getLive(now = new Date()): Promise<LiveDTO> {
  try {
    const db = getDb();
    const devices = { device: { organizationId: DEMO_ORG_ID, kind:"FLOW" as const } };
    const [last, recent, active, activeCount] = await Promise.all([
      db.telemetryReading.findFirst({ where: { ...devices, capturedAt: { lte: now } }, orderBy: { capturedAt: "desc" }, include: { device: true } }),
      db.telemetryReading.findMany({ where: { ...devices, capturedAt: { gte: new Date(now.getTime() - RECENT_WINDOW_MS), lte: now } }, orderBy: { capturedAt: "desc" }, take: 120, select: { capturedAt: true, flowLpm: true } }),
      db.occurrence.findMany({ where: { organizationId: DEMO_ORG_ID, kind: {not:"TEMPERATURE_EXCURSION"}, status: { in: ["OPEN", "ACKNOWLEDGED"] } }, orderBy: { openedAt: "desc" }, take: 5 }),
      db.occurrence.count({ where: { organizationId: DEMO_ORG_ID, kind: {not:"TEMPERATURE_EXCURSION"}, status: { in: ["OPEN", "ACKNOWLEDGED"] } } }),
    ]);
    return {
      generatedAt: now.toISOString(),
      lastReading: last ? { at: last.capturedAt.toISOString(), flowLpm: Number(last.flowLpm), deltaLiters: Number(last.deltaLiters), source: last.source as SourceKey, deviceCode: last.device.code } : null,
      recent: recent.reverse().map(r => ({ t: r.capturedAt.getTime(), flowLpm: Number(r.flowLpm) })),
      active: active.map(o => ({ id: o.id, title: o.title, severity: o.severity, status: o.status, source: o.source as SourceKey, openedAt: o.openedAt.toISOString() })),
      activeCount,
    };
  } catch (err) {
    throw new DatabaseUnavailableError(err);
  }
}
