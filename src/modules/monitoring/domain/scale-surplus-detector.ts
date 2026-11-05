import { DEFAULT_MAX_GAP_SECONDS } from "./flow-alert-policy";
import { trailingRun, type SignalSample } from "./sustained-run";
export type ScaleDecision =
  | { trigger: false }
  | { trigger: true; weightKg: number; observedSeconds: number; samples: SignalSample[] };
/** Arredonda PARA BAIXO em 0,1 kg (sem erro de ponto flutuante: 2,3 continua 2,3). */
const floorTenth = (kg: number) => Math.floor(Math.round(kg * 1000) / 100) / 10;
/**
 * Balança (HX711): registra UM excedente quando o peso fica estável no mínimo configurado e só
 * volta a armar depois que a balança é esvaziada (peso abaixo da metade do mínimo).
 * O peso do lote é a MENOR leitura do trecho estável, arredondada para baixo: nunca superestima kg.
 * Guarda estado em memória (uma instância por dispositivo); domínio puro.
 */
export class ScaleSurplusDetector {
  private armed = true;
  private window: SignalSample[] = [];
  constructor(
    private readonly minKg: number,
    private readonly stableSeconds: number,
    private readonly maxGapSeconds = DEFAULT_MAX_GAP_SECONDS,
  ) {
    if (minKg <= 0 || stableSeconds <= 0 || maxGapSeconds <= 0) throw new Error("Limites inválidos");
  }
  push(sample: SignalSample): ScaleDecision {
    if (sample.value < this.minKg / 2) { this.armed = true; this.window = []; return { trigger: false }; }
    const horizon = sample.at.getTime() - (this.stableSeconds + this.maxGapSeconds) * 1000;
    this.window = [...this.window.filter(s => s.at.getTime() >= horizon), sample];
    if (!this.armed) return { trigger: false };
    const run = trailingRun(this.window, v => v >= this.minKg, this.maxGapSeconds);
    if (run.samples.length < 2 || run.seconds < this.stableSeconds) return { trigger: false };
    this.armed = false;
    return { trigger: true, weightKg: floorTenth(Math.min(...run.samples.map(s => s.value))), observedSeconds: run.seconds, samples: run.samples };
  }
  /** Volta a armar sem esvaziar a balança: usado quando a gravação do lote falhou (ex.: banco fora). */
  rearm() { this.armed = true; }
}
