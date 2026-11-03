import { durationBR, numBR } from "@/lib/format";
import type { DashboardDTO } from "./dashboard";
/** Os números-resumo do relatório, como TEXTO: a prévia do BI e o PDF imprimem exatamente estas strings. */
export function reportFigures(data: Pick<DashboardDTO, "kpis">) {
  const k = data.kpis;
  return [
    ["Volume observado", k.observedLiters === null ? "sem dados" : `${numBR(k.observedLiters)} L`],
    ["Ocorrências abertas no período", String(k.openedInPeriod)],
    ["Ocorrências ativas agora", String(k.activeOccurrences)],
    ["Resolvidas no período", String(k.resolvedInPeriod)],
    ["Tempo médio até resolução", durationBR(k.avgResolutionMin)],
    ["Alimentos entregues", `${numBR(k.deliveredKg)} kg`],
  ] as const;
}
