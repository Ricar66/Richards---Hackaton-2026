import { DEFAULT_MAX_GAP_SECONDS } from "./flow-alert-policy";
export type SignalSample = { at: Date; value: number };
export type SustainedRun = { seconds: number; samples: SignalSample[] };
/**
 * Trecho final, sem interrupção, em que a condição vale (a última amostra precisa valer).
 * Buraco maior que `maxGapSeconds` quebra o trecho: sem amostra no meio não se afirma continuidade.
 * Domínio puro: sem banco, HTTP ou framework.
 */
export function trailingRun(samples: SignalSample[], holds: (value: number) => boolean, maxGapSeconds = DEFAULT_MAX_GAP_SECONDS): SustainedRun {
  const ordered = [...samples].sort((a, b) => a.at.getTime() - b.at.getTime());
  const run: SignalSample[] = [];
  for (let i = ordered.length - 1; i >= 0; i--) {
    if (!holds(ordered[i].value)) break;
    if (run.length && run[run.length - 1].at.getTime() - ordered[i].at.getTime() > maxGapSeconds * 1000) break;
    run.push(ordered[i]);
  }
  run.reverse();
  return { seconds: run.length ? (run[run.length - 1].at.getTime() - run[0].at.getTime()) / 1000 : 0, samples: run };
}
