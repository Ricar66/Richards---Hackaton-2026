import type { LiveEvent } from "@/modules/realtime/domain/live-event";

/** Projeção explícita para visitantes: jamais encaminhar eventos privados brutos. */
export type AudienceSource = "DEVICE" | "SIMULATED";
type Base = { deviceCode: string; at: string; source: AudienceSource };
export type AudienceReading =
  | (Base & { kind: "flow"; flowLpm: number })
  | (Base & { kind: "environment"; temperatureC: number; humidityPct: number | null; limitC: number })
  | (Base & { kind: "scale"; kg: number; minKg: number; phase: string; stableSeconds: number; requiredSeconds: number })
  | (Base & { kind: "lot"; kg: number });

const isSensor = (s: string): s is AudienceSource => s === "DEVICE" || s === "SIMULATED";
export function publicReadings(e: LiveEvent): AudienceReading[] {
  if (e.type === "reading.created") {
    return isSensor(e.source) && Number.isFinite(e.flowLpm)
      ? [{ kind: "flow", deviceCode: e.deviceCode, at: e.capturedAt, source: e.source, flowLpm: e.flowLpm }]
      : [];
  }
  return [];
}
export const audienceKey=(r:AudienceReading):string=>r.kind+":"+r.deviceCode;
