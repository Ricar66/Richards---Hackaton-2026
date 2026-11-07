import type { DeviceConnectivity } from "./device-connectivity";

/** Uma análise de atividade NUNCA diagnostica entupimento ou vazamento por si só. */
export const FIXTURE_WINDOW_HOURS = 72;
export const FIXTURE_BUCKET_MINUTES = 10;
export const FLOW_EVENT_THRESHOLD_LPM = 0.2; // Requer calibração física antes de interpretar como acionamento.
export type FixtureActivityState = "FLOW_OBSERVED" | "NO_FLOW_OBSERVED" | "INSUFFICIENT_DATA" | "NO_SIGNAL";

export type FixtureActivityEvidence = {
  connectivity: DeviceConnectivity;
  samples: number;
  coveredBuckets: number;
  flowSamples: number;
  hours?: number;
};
export type FixtureActivityDecision = {
  state: FixtureActivityState;
  coveragePercent: number;
  expectedBuckets: number;
};

/**
 * O sensor envia leituras periódicas inclusive quando a vazão é zero.
 * Ausência de amostras NÃO é ausência de uso.
 *
 * Pelo menos 85% dos blocos de 10 min e média de >=2 amostras/bloco
 * evita concluir "sem fluxo" a partir de equipamento esporádico.
 * Só se aplica à origem DEVICE; simulação deve ficar fora da consulta.
 */
export function assessFixtureActivity(e: FixtureActivityEvidence): FixtureActivityDecision {
  const hours = e.hours ?? FIXTURE_WINDOW_HOURS;
  if (!Number.isFinite(hours) || hours <= 0 || hours > 168) throw new Error("Janela de atividade inválida");
  const expectedBuckets = hours * 60 / FIXTURE_BUCKET_MINUTES;
  const coveragePercent = Math.min(100, Math.round(1000 * Math.max(0, e.coveredBuckets) / expectedBuckets) / 10);
  if (e.connectivity !== "ONLINE") return { state: "NO_SIGNAL", coveragePercent, expectedBuckets };
  if (e.flowSamples > 0) return { state: "FLOW_OBSERVED", coveragePercent, expectedBuckets };
  if (coveragePercent < 85 || e.samples < expectedBuckets * 2)
    return { state: "INSUFFICIENT_DATA", coveragePercent, expectedBuckets };
  return { state: "NO_FLOW_OBSERVED", coveragePercent, expectedBuckets };
}
