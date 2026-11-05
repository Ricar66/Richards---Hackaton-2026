import { DEFAULT_MAX_GAP_SECONDS } from "./flow-alert-policy";
import { trailingRun, type SignalSample } from "./sustained-run";
export type TemperatureDecision = { suspicious: boolean; observedSeconds: number; samples: SignalSample[]; minC: number; maxC: number };
/**
 * Temperatura ACIMA do limite de forma sustentada (não basta um pico). Indício a verificar:
 * o DHT11 da bancada tem precisão típica de ±2 °C, então nada aqui afirma perda de produto.
 */
export class TemperatureAlertPolicy {
  constructor(
    private readonly limitC: number,
    private readonly durationSeconds: number,
    private readonly maxGapSeconds = DEFAULT_MAX_GAP_SECONDS,
  ) {
    if (!Number.isFinite(limitC) || durationSeconds <= 0 || maxGapSeconds <= 0) throw new Error("Limites inválidos");
  }
  evaluate(samples: SignalSample[]): TemperatureDecision {
    const run = trailingRun(samples, v => v > this.limitC, this.maxGapSeconds);
    const values = run.samples.map(s => s.value);
    return {
      suspicious: run.samples.length >= 2 && run.seconds >= this.durationSeconds,
      observedSeconds: run.seconds, samples: run.samples,
      minC: values.length ? Math.min(...values) : 0, maxC: values.length ? Math.max(...values) : 0,
    };
  }
}
