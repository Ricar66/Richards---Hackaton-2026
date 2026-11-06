/**
 * Contas de animação sem framework (testáveis). O tempo de um quadro do `requestAnimationFrame` é o INÍCIO do quadro e
 * pode vir ANTES do `performance.now()` lido no efeito que agendou a animação: o tempo decorrido sai negativo no
 * primeiro quadro. Sem a trava, `1 - (1 - k)³` com k < 0 empurra o número para o lado oposto ao destino: o KPI mostrava
 * 6.450,3 L numa troca de 6.231 para 904 (A2b, 06/11). Toda conta aqui trava o progresso em [0, 1].
 */
export const progress = (elapsedMs: number, durationMs: number) => Math.max(0, Math.min(1, elapsedMs / durationMs));

/** Valor do número animado (ease-out cúbico): sempre entre `from` e `to`, nunca fora. */
export function easedValue(from: number, to: number, elapsedMs: number, durationMs = 320): number {
  const k = progress(elapsedMs, durationMs);
  return k >= 1 ? to : from + (to - from) * (1 - (1 - k) ** 3);
}

/** Delta entre quadros em segundos, nunca negativo (a água não anda para trás) e com teto (aba que volta do fundo). */
export const frameDelta = (nowMs: number, lastMs: number, maxSeconds = 0.1) => Math.max(0, Math.min(maxSeconds, (nowMs - lastMs) / 1000));
