export type WaterScenario = {
  flowLpm: number; hoursPerDay: number; days: number; effectiveRateBRLPerM3: number;
};
export type WaterExposure = { liters: number; cubicMeters: number; estimatedCostBRL: number };
/** Cenário de fluxo ininterrupto; não é economia medida nem vazamento confirmado.
 * A tarifa vem do usuário; faturamento real pode ter faixas, mínimos e taxas de esgoto.
 */
export function estimateContinuousFlow(s: WaterScenario): WaterExposure | null {
  const { flowLpm, hoursPerDay, days, effectiveRateBRLPerM3 } = s;
  if (![flowLpm, hoursPerDay, days, effectiveRateBRLPerM3].every(Number.isFinite)) return null;
  if (flowLpm <= 0 || flowLpm > 50 || hoursPerDay <= 0 || hoursPerDay > 24 ||
      days <= 0 || days > 31 || effectiveRateBRLPerM3 < 0 || effectiveRateBRLPerM3 > 1000) return null;
  const cubicMeters = flowLpm * 60 * hoursPerDay * days / 1000;
  return {
    liters: Math.round(cubicMeters * 1000 * 1000) / 1000,
    cubicMeters: Math.round(cubicMeters * 1000) / 1000,
    estimatedCostBRL: Math.round(cubicMeters * effectiveRateBRLPerM3 * 100) / 100,
  };
}
