export type FlowSample = { capturedAt: Date; flowLpm: number; deltaLiters: number };
export type FlowDecision = { suspicious: boolean; suspectVolumeLiters: number; observedSeconds: number };
/** Buraco máximo entre amostras para ainda considerar o fluxo contínuo: 3× o intervalo de 15 s do firmware. */
export const DEFAULT_MAX_GAP_SECONDS = 45;
/** Pure domain service: no HTTP, DB or framework dependencies. */
export class FlowAlertPolicy {
  constructor(
    private readonly minFlowLpm: number,
    private readonly durationSeconds: number,
    private readonly maxGapSeconds = DEFAULT_MAX_GAP_SECONDS,
  ) {
    if (minFlowLpm <= 0 || durationSeconds <= 0 || maxGapSeconds <= 0) throw new Error("Limites inválidos");
  }
  evaluate(samples: FlowSample[]): FlowDecision {
    const ordered = [...samples].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
    const last = ordered[ordered.length - 1];
    if (!last || last.flowLpm < this.minFlowLpm) return { suspicious: false, suspectVolumeLiters: 0, observedSeconds: 0 };
    const run: FlowSample[] = [];
    for (let i = ordered.length - 1; i >= 0; i--) {
      if (ordered[i].flowLpm < this.minFlowLpm) break;
      // Sem amostra no meio não há como afirmar continuidade: o buraco interrompe a janela (não se infere consumo não medido).
      if (run.length && run[run.length - 1].capturedAt.getTime() - ordered[i].capturedAt.getTime() > this.maxGapSeconds * 1000) break;
      run.push(ordered[i]);
    }
    const oldest = run[run.length - 1];
    const seconds = (last.capturedAt.getTime() - oldest.capturedAt.getTime()) / 1000;
    return { suspicious: seconds >= this.durationSeconds, observedSeconds: seconds, suspectVolumeLiters: Math.round(run.reduce((n, p) => n + p.deltaLiters, 0) * 1000) / 1000 };
  }
}
