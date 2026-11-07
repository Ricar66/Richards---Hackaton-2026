import type { ScaleLive, ScaleView, TemperatureLive, TemperatureView } from "./stage-logic";

/** DTO visual sem relógio nem dados inventados. Frações vêm das mesmas views do painel. */
export type InstrumentState = {
  fresh: boolean;
  simulated: boolean;
  fraction: number;
  tone: "ok" | "warn" | "danger";
  confirmed: number;
  total: number;
};
const finiteFraction = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
export function scaleInstrument(s: ScaleLive | null, view: ScaleView | null): InstrumentState {
  const fresh = !!s && !!view && !view.stale && Number.isFinite(s.kg);
  return {
    fresh, simulated: s?.source === "SIMULATED", fraction: fresh ? finiteFraction(view!.fill) : 0,
    tone: view?.phase === "bloqueada" ? "warn" : "ok",
    confirmed: fresh ? Math.max(0, Math.min(view!.total, view!.lit)) : 0, total: view?.total ?? 6,
  };
}
export function temperatureInstrument(t: TemperatureLive | null, view: TemperatureView | null): InstrumentState {
  const fresh = !!t && !!view && !view.stale && Number.isFinite(t.c);
  return {
    fresh, simulated: t?.source === "SIMULATED", fraction: fresh ? finiteFraction(view!.fraction) : 0,
    tone: view?.state === "sustentado" ? "danger" : view?.state === "contando" ? "warn" : "ok",
    confirmed: 0, total: 0,
  };
}
