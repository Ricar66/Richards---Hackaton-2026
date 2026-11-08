import { DEFAULT_MAX_GAP_SECONDS, inRange, type TempRange } from "@/modules/cold-chain/domain/cold-chain";

export type SparkPoint = { t: number; c: number; max: number };
export type Spark = {
  line: string;
  /** Faixa permitida no eixo da imagem (y de cima e de baixo; sem limite → borda). */
  band: { top: number; bottom: number };
  /** Pontos fora da faixa pela MESMA regra da cadeia do frio (5 °C exclusivo, −18 °C inclusivo…), usando o pico da fatia. */
  out: { x: number; y: number }[];
  lo: number; hi: number;
};

/**
 * Linha da temperatura para o passaporte, desenhada no servidor (sem biblioteca de gráfico na página pública).
 * O eixo sempre inclui os limites da faixa, para a pessoa ver a distância até eles. Menos de 2 pontos: sem gráfico.
 */
export function sparkline(series: readonly SparkPoint[], range: TempRange, w: number, h: number, pad = 6, window?: [number, number]): Spark | null {
  if (series.length < 2) return null;
  const limits = [range.minC, range.maxC].filter((v): v is number => v !== null);
  const values = series.flatMap(p => [p.c, p.max]);
  let lo = Math.min(...values, ...limits), hi = Math.max(...values, ...limits);
  const margin = Math.max(0.5, (hi - lo) * 0.14);
  lo -= margin; hi += margin;
  // Eixo do tempo = a JANELA inteira (o que a legenda diz), não só o trecho com dado: 2 h de leitura numa janela de
  // 24 h ocupam 1/12 da largura, e o vazio à esquerda é o tempo sem medição.
  const t0 = window ? window[0] : series[0].t;
  const span = Math.max(1, (window ? window[1] : series[series.length - 1].t) - t0);
  const x = (t: number) => pad + ((t - t0) / span) * (w - 2 * pad);
  const y = (c: number) => pad + ((hi - c) / (hi - lo)) * (h - 2 * pad);
  const r = (n: number) => Math.round(n * 10) / 10;
  // Buraco sem leitura quebra a linha: desenhar por cima dele seria inventar que houve medição ali.
  // Quebra quando o intervalo passa do que uma leitura vale (10 min) ou de 1,5× o passo normal da série (fatias).
  const diffs = series.slice(1).map((p, i) => p.t - series[i].t).sort((a, b) => a - b);
  const step = diffs[Math.floor(diffs.length / 2)];
  const gap = Math.max(DEFAULT_MAX_GAP_SECONDS * 1000, step * 1.5);
  const line = series.map((p, i) => `${i === 0 || p.t - series[i - 1].t > gap ? "M" : "L"}${r(x(p.t))},${r(y(p.c))}`).join("");
  const out = series
    .map(p => { const v = !inRange(p.max, range) ? p.max : p.c; return inRange(v, range) ? null : { x: r(x(p.t)), y: r(y(v)) }; })
    .filter((p): p is { x: number; y: number } => p !== null);
  return {
    line,
    band: { top: r(range.maxC !== null ? y(range.maxC) : 0), bottom: r(range.minC !== null ? y(range.minC) : h) },
    out, lo, hi,
  };
}
