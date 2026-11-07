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
  if (e.type === "sensor.live") {
    const out: AudienceReading[] = [];
    const t = e.temperature;
    if (t && isSensor(t.source) && Number.isFinite(t.c))
      out.push({ kind: "environment", deviceCode: e.deviceCode, at: e.at, source: t.source, temperatureC: t.c,
        humidityPct: t.humidityPct !== undefined && Number.isFinite(t.humidityPct) ? t.humidityPct : null, limitC: t.rule.limitC });
    const s = e.scale;
    if (s && isSensor(s.source) && Number.isFinite(s.kg))
      out.push({ kind: "scale", deviceCode: e.deviceCode, at: e.at, source: s.source, kg: s.kg, minKg: s.progress.minKg,
        phase: s.progress.phase, stableSeconds: s.progress.stableSeconds, requiredSeconds: s.progress.requiredSeconds });
    return out;
  }
  if (e.type === "donation.created" && e.origin === "scale" && e.deviceCode && isSensor(e.source) && Number.isFinite(e.kg))
    return [{ kind: "lot", deviceCode: e.deviceCode, at: e.emittedAt, source: e.source, kg: e.kg }];
  return [];
}
export const audienceKey = (r: AudienceReading): string => r.kind + ":" + r.deviceCode;
