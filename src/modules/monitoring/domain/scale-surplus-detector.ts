import { DEFAULT_MAX_GAP_SECONDS } from "./flow-alert-policy";
import { trailingRun, type SignalSample } from "./sustained-run";
export type ScaleDecision =
  | { trigger: false }
  | { trigger: true; weightKg: number; observedSeconds: number; samples: SignalSample[] };
/**
 * Estado do detector DEPOIS da última leitura (para a tela; nunca interpolado entre leituras).
 * idle: abaixo do mínimo · stabilizing: contando segundos estáveis · triggered: esta leitura pediu o lote ·
 * disarmed: já pediu, esvazie a balança para rearmar · blocked: pediu, mas a gravação recusou porque já havia lote
 * desta balança aguardando verificação (nada novo foi criado); também só rearma depois de esvaziar.
 */
export type ScaleProgressState = {
  phase: "idle" | "stabilizing" | "triggered" | "disarmed" | "blocked";
  minKg: number; stableSeconds: number; requiredSeconds: number;
  /** Só em `blocked`: referência do lote pendente que impediu a criação (opaca para o domínio). */
  pendingLotId?: string;
};
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
  /** A última carga pediu lote e a gravação recusou (lote pendente): até esvaziar, a fase é `blocked`, não `disarmed`. */
  private blockedBy: string | null = null;
  private window: SignalSample[] = [];
  private last: Pick<ScaleProgressState, "phase" | "stableSeconds"> = { phase: "idle", stableSeconds: 0 };
  constructor(
    private readonly minKg: number,
    private readonly stableSeconds: number,
    private readonly maxGapSeconds = DEFAULT_MAX_GAP_SECONDS,
  ) {
    if (minKg <= 0 || stableSeconds <= 0 || maxGapSeconds <= 0) throw new Error("Limites inválidos");
  }
  push(sample: SignalSample): ScaleDecision {
    if (sample.value < this.minKg / 2) { this.armed = true; this.blockedBy = null; this.window = []; this.last = { phase: "idle", stableSeconds: 0 }; return { trigger: false }; }
    const horizon = sample.at.getTime() - (this.stableSeconds + this.maxGapSeconds) * 1000;
    this.window = [...this.window.filter(s => s.at.getTime() >= horizon), sample];
    const run = trailingRun(this.window, v => v >= this.minKg, this.maxGapSeconds);
    if (!this.armed) { this.last = { phase: this.blockedBy !== null ? "blocked" : "disarmed", stableSeconds: run.seconds }; return { trigger: false }; }
    if (!run.samples.length) { this.last = { phase: "idle", stableSeconds: 0 }; return { trigger: false }; }
    if (run.samples.length < 2 || run.seconds < this.stableSeconds) { this.last = { phase: "stabilizing", stableSeconds: run.seconds }; return { trigger: false }; }
    this.armed = false;
    this.last = { phase: "triggered", stableSeconds: run.seconds };
    return { trigger: true, weightKg: floorTenth(Math.min(...run.samples.map(s => s.value))), observedSeconds: run.seconds, samples: run.samples };
  }
  /** Progresso decidido na última `push` (a mesma regra que pede o lote). */
  progress(): ScaleProgressState {
    const base = { ...this.last, minKg: this.minKg, requiredSeconds: this.stableSeconds };
    return this.last.phase === "blocked" && this.blockedBy ? { ...base, pendingLotId: this.blockedBy } : base;
  }
  /** Volta a armar sem esvaziar a balança: usado quando a gravação do lote falhou (ex.: banco fora). */
  rearm() { this.armed = true; this.blockedBy = null; if (this.last.phase === "triggered" || this.last.phase === "blocked") this.last = { ...this.last, phase: "stabilizing" }; }
  /**
   * O pedido desta carga foi RECUSADO porque já existe lote desta balança aguardando verificação: a tela não pode dizer
   * que esta pesagem virou lote. Continua desarmado (um pedido por carga; esvazie para rearmar).
   */
  markBlocked(pendingLotId: string) {
    if (this.last.phase !== "triggered") return;
    this.blockedBy = pendingLotId;
    this.last = { ...this.last, phase: "blocked" };
  }
}
