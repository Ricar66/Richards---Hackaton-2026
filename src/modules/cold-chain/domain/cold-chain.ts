/**
 * Cadeia do frio (domínio puro, sem framework): faixas de temperatura por tipo de equipamento e o resumo de conformidade
 * de uma série gravada. Base legal: Anvisa RDC 216/2004, itens 4.8.15 a 4.8.18 (texto oficial na BVS/MS).
 * - Refrigerado: "temperaturas INFERIORES a 5 ºC" (4.8.16) → 5,0 °C já está fora.
 * - Congelado: "IGUAL OU INFERIOR a -18 ºC" (4.8.16) → -18,0 °C está dentro.
 * - Quente: "temperatura SUPERIOR a 60 ºC" (4.8.15) → 60,0 °C já está fora.
 * - Ambiente (estoque seco, bancada): a RDC não fixa número; vale a faixa definida pelo estabelecimento (ex.: rótulo).
 * O resumo nunca preenche buraco: tempo sem amostra é "sem dado", não "dentro da faixa".
 */
export type ColdKind = "REFRIGERATOR" | "FREEZER" | "COLD_ROOM" | "HOT_HOLDING" | "AMBIENT";
export type TempRange = { minC: number | null; maxC: number | null; minInclusive: boolean; maxInclusive: boolean; reference: string };

export const KIND_LABEL: Record<ColdKind, string> = {
  REFRIGERATOR: "Geladeira", FREEZER: "Freezer", COLD_ROOM: "Câmara fria", HOT_HOLDING: "Balcão quente", AMBIENT: "Ambiente",
};

/** Faixa padrão por tipo, na letra da RDC 216/2004 (o estabelecimento pode ser mais rigoroso, nunca mais frouxo no frio/quente). */
export const DEFAULT_RANGE: Record<ColdKind, TempRange> = {
  REFRIGERATOR: { minC: null, maxC: 5, minInclusive: true, maxInclusive: false, reference: "RDC 216/2004, item 4.8.16: refrigerado abaixo de 5 °C" },
  COLD_ROOM: { minC: null, maxC: 5, minInclusive: true, maxInclusive: false, reference: "RDC 216/2004, item 4.8.16: refrigerado abaixo de 5 °C" },
  FREEZER: { minC: null, maxC: -18, minInclusive: true, maxInclusive: true, reference: "RDC 216/2004, item 4.8.16: congelado a −18 °C ou menos" },
  HOT_HOLDING: { minC: 60, maxC: null, minInclusive: false, maxInclusive: true, reference: "RDC 216/2004, item 4.8.15: quente acima de 60 °C" },
  AMBIENT: { minC: null, maxC: 28, minInclusive: true, maxInclusive: true, reference: "Faixa do estabelecimento (a RDC 216 não fixa número para ambiente)" },
};

/**
 * Faixa efetiva do equipamento. Limites próprios só valem se forem MAIS rigorosos que a norma nos tipos regulados
 * (um "máximo 8 °C" numa geladeira seria mais frouxo que a RDC e é ignorado).
 */
export function equipmentRange(kind: ColdKind, own: { minC?: number | null; maxC?: number | null } = {}): TempRange {
  const base = DEFAULT_RANGE[kind];
  const finite = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);
  if (kind === "AMBIENT") {
    return { ...base, minC: finite(own.minC) ? own.minC : base.minC, maxC: finite(own.maxC) ? own.maxC : base.maxC };
  }
  let { minC, maxC, minInclusive, maxInclusive } = base;
  if (finite(own.maxC) && (maxC === null || own.maxC < maxC)) { maxC = own.maxC; maxInclusive = true; }
  if (finite(own.minC) && (minC === null || own.minC > minC)) { minC = own.minC; minInclusive = true; }
  const stricter = minC !== base.minC || maxC !== base.maxC;
  return { minC, maxC, minInclusive, maxInclusive, reference: stricter ? `${base.reference} (limite próprio mais rigoroso)` : base.reference };
}

export function inRange(c: number, r: TempRange): boolean {
  if (!Number.isFinite(c)) return false;
  if (r.maxC !== null && (r.maxInclusive ? c > r.maxC : c >= r.maxC)) return false;
  if (r.minC !== null && (r.minInclusive ? c < r.minC : c <= r.minC)) return false;
  return true;
}

/** Texto curto da faixa para tela e PDF: "abaixo de 5 °C", "−18 °C ou menos", "acima de 60 °C", "até 28 °C". */
export function rangeText(r: TempRange): string {
  const f = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} °C`.replace("-", "−");
  if (r.minC !== null && r.maxC !== null) return `entre ${f(r.minC)} e ${f(r.maxC)}`;
  if (r.maxC !== null) return r.maxInclusive ? (r.maxC < 0 ? `${f(r.maxC)} ou menos` : `até ${f(r.maxC)}`) : `abaixo de ${f(r.maxC)}`;
  if (r.minC !== null) return r.minInclusive ? `${f(r.minC)} ou mais` : `acima de ${f(r.minC)}`;
  return "sem faixa";
}

export type TempSample = { at: Date; c: number };
export type Excursion = { start: Date; end: Date; seconds: number; peakC: number; ongoing: boolean };
export type ComplianceSummary = {
  windowSeconds: number;
  samples: number;
  /** Tempo coberto por amostras (cada uma vale até a próxima, no máximo `maxGapSeconds`). */
  coveredSeconds: number;
  inRangeSeconds: number;
  outRangeSeconds: number;
  /** % do tempo COBERTO dentro da faixa; null sem cobertura (nunca 100% por falta de dado). */
  inRangePct: number | null;
  /** % da janela com dado. */
  coveragePct: number;
  excursions: Excursion[];
  minC: number | null;
  maxC: number | null;
  last: TempSample | null;
};

/** Uma amostra "vale" até a próxima; depois de `maxGapSeconds` sem amostra, o resto é buraco (sem dado). */
export const DEFAULT_MAX_GAP_SECONDS = 600;

/**
 * Resumo de conformidade de uma série dentro de [from, to]. Amostras fora da janela são ignoradas, exceto a última
 * anterior a `from`, que vale do início da janela (até o limite do buraco) — sem ela, o primeiro minuto viraria buraco.
 */
export function complianceSummary(series: readonly TempSample[], range: TempRange, from: Date, to: Date, maxGapSeconds = DEFAULT_MAX_GAP_SECONDS): ComplianceSummary {
  const t0 = from.getTime(), t1 = to.getTime();
  const windowSeconds = Math.max(0, (t1 - t0) / 1000);
  const sorted = series.filter(s => Number.isFinite(s.c) && Number.isFinite(s.at.getTime())).sort((a, b) => a.at.getTime() - b.at.getTime());
  const before = [...sorted].reverse().find(s => s.at.getTime() < t0) ?? null;
  const inside = sorted.filter(s => s.at.getTime() >= t0 && s.at.getTime() <= t1);
  const points = before ? [before, ...inside] : inside;
  let covered = 0, inSec = 0, outSec = 0, minC: number | null = null, maxC: number | null = null;
  const excursions: Excursion[] = [];
  let open: Excursion | null = null;
  const close = (endMs: number, ongoing: boolean) => {
    if (!open) return;
    open.end = new Date(endMs); open.seconds = Math.max(0, (endMs - open.start.getTime()) / 1000); open.ongoing = ongoing;
    excursions.push(open); open = null;
  };
  for (let i = 0; i < points.length; i++) {
    const s = points[i], next = points[i + 1];
    const start = Math.max(s.at.getTime(), t0);
    const limit = s.at.getTime() + maxGapSeconds * 1000;
    const end = Math.min(next ? next.at.getTime() : t1, limit, t1);
    if (s.at.getTime() >= t0) { minC = minC === null ? s.c : Math.min(minC, s.c); maxC = maxC === null ? s.c : Math.max(maxC, s.c); }
    const span = Math.max(0, (end - start) / 1000);
    const ok = inRange(s.c, range);
    covered += span;
    if (ok) inSec += span; else outSec += span;
    if (!ok && span > 0) {
      if (!open) open = { start: new Date(start), end: new Date(end), seconds: 0, peakC: s.c, ongoing: false };
      else open.peakC = worse(open.peakC, s.c, range);
      // Buraco depois desta amostra (ou fim da série) encerra a excursão: não se afirma que continuou fora.
      const gapAfter = !next || next.at.getTime() > limit;
      if (gapAfter) close(end, !next && end >= t1);
    } else if (ok) close(start, false);
  }
  close(t1, true);
  const last = sorted.length ? sorted[sorted.length - 1] : null;
  return {
    windowSeconds, samples: inside.length, coveredSeconds: covered, inRangeSeconds: inSec, outRangeSeconds: outSec,
    inRangePct: covered > 0 ? Math.round((inSec / covered) * 1000) / 10 : null,
    coveragePct: windowSeconds > 0 ? Math.round((covered / windowSeconds) * 1000) / 10 : 0,
    excursions, minC, maxC, last: last && last.at.getTime() <= t1 ? last : null,
  };
}

/** Pico de uma excursão: no frio o mais quente, no quente o mais frio. */
function worse(a: number, b: number, r: TempRange): number {
  return r.maxC !== null ? Math.max(a, b) : Math.min(a, b);
}

export type EquipmentState = "OK" | "OUT_OF_RANGE" | "NO_DATA";
/** Estado atual: sem leitura nos últimos `staleSeconds` é "sem dado", nunca "ok". */
export function equipmentState(last: TempSample | null, range: TempRange, now: Date, staleSeconds = DEFAULT_MAX_GAP_SECONDS): EquipmentState {
  if (!last || now.getTime() - last.at.getTime() > staleSeconds * 1000) return "NO_DATA";
  return inRange(last.c, range) ? "OK" : "OUT_OF_RANGE";
}

/**
 * Gravar esta leitura? Uma por `persistSeconds` por equipamento, e sempre que a leitura cruza a faixa (entrada ou saída):
 * o registro da RDC 216 não perde o instante em que o equipamento saiu do limite.
 */
export function shouldPersist(prev: { at: Date; inRange: boolean } | undefined, at: Date, ok: boolean, persistSeconds: number): boolean {
  if (!prev) return true;
  if (prev.inRange !== ok) return true;
  return at.getTime() - prev.at.getTime() >= persistSeconds * 1000;
}
