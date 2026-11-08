import { getDb } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
import {
  complianceSummary, DEFAULT_MAX_GAP_SECONDS, equipmentRange, equipmentState, KIND_LABEL, rangeText,
  type ColdKind, type EquipmentState, type TempRange,
} from "../domain/cold-chain";

export type ColdSource = "DEVICE" | "SIMULATED";
export type ColdPoint = { t: number; c: number; min: number; max: number };
export type ColdEquipmentView = {
  id: string; code: string; label: string; kind: ColdKind; kindLabel: string; siteName: string;
  range: TempRange; rangeText: string; state: EquipmentState;
  last: { c: number; humidityPct: number | null; at: string } | null;
  sensorCode: string | null;
  summary: {
    samples: number; inRangePct: number | null; coveragePct: number; outRangeMinutes: number;
    minC: number | null; maxC: number | null;
    excursions: { start: string; end: string; minutes: number; peakC: number; ongoing: boolean }[];
    excursionCount: number;
  };
  series: ColdPoint[];
};
export type ColdChainSnapshot = { generatedAt: string; from: string; to: string; hours: number; source: ColdSource; equipments: ColdEquipmentView[] };

const SERIES_POINTS = 240;
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Cadeia do frio por equipamento ativo da organização, numa janela e numa ORIGEM explícita (sensor × simulado nunca se
 * misturam no mesmo resumo). Números vêm só da série gravada; sem leitura não há porcentagem nem "ok".
 */
export async function getColdChain(opts: { hours: number; source: ColdSource; now?: Date }): Promise<ColdChainSnapshot> {
  const db = getDb();
  const now = opts.now ?? new Date();
  const from = new Date(now.getTime() - opts.hours * 3600_000);
  const equipments = await db.coldEquipment.findMany({
    where: { organizationId: DEMO_ORG_ID, active: true },
    include: { site: { select: { name: true } }, sensorDevice: { select: { code: true } } },
    orderBy: [{ siteId: "asc" }, { label: "asc" }],
  });
  const views: ColdEquipmentView[] = [];
  for (const e of equipments) {
    const range = equipmentRange(e.kind as ColdKind, e);
    // Uma amostra antes da janela (até o limite do buraco) cobre o começo; nada além disso.
    const rows = await db.temperatureReading.findMany({
      where: { equipmentId: e.id, source: opts.source, capturedAt: { gte: new Date(from.getTime() - DEFAULT_MAX_GAP_SECONDS * 1000), lte: now } },
      orderBy: { capturedAt: "asc" }, select: { capturedAt: true, temperatureC: true, humidityPct: true }, take: 100_000,
    });
    const latest = await db.temperatureReading.findFirst({
      where: { equipmentId: e.id, source: opts.source, capturedAt: { lte: now } }, orderBy: { capturedAt: "desc" },
      select: { capturedAt: true, temperatureC: true, humidityPct: true },
    });
    const samples = rows.map(r => ({ at: r.capturedAt, c: Number(r.temperatureC) }));
    const sum = complianceSummary(samples, range, from, now);
    const last = latest ? { at: latest.capturedAt, c: Number(latest.temperatureC) } : null;
    const longest = [...sum.excursions].sort((a, b) => b.seconds - a.seconds).slice(0, 5);
    views.push({
      id: e.id, code: e.code, label: e.label, kind: e.kind as ColdKind, kindLabel: KIND_LABEL[e.kind as ColdKind], siteName: e.site.name,
      range, rangeText: rangeText(range), state: equipmentState(last, range, now),
      last: latest ? { c: Number(latest.temperatureC), humidityPct: latest.humidityPct === null ? null : Number(latest.humidityPct), at: latest.capturedAt.toISOString() } : null,
      sensorCode: e.sensorDevice?.code ?? null,
      summary: {
        samples: sum.samples, inRangePct: sum.inRangePct, coveragePct: sum.coveragePct, outRangeMinutes: round(sum.outRangeSeconds / 60),
        minC: sum.minC, maxC: sum.maxC, excursionCount: sum.excursions.length,
        excursions: longest.map(x => ({ start: x.start.toISOString(), end: x.end.toISOString(), minutes: round(x.seconds / 60), peakC: x.peakC, ongoing: x.ongoing })),
      },
      series: downsample(samples.filter(s => s.at >= from), from, now),
    });
  }
  return { generatedAt: now.toISOString(), from: from.toISOString(), to: now.toISOString(), hours: opts.hours, source: opts.source, equipments: views };
}

/** Até 240 pontos para o gráfico: média, mínimo e máximo por fatia (o máximo mostra o pico que a média esconderia). */
function downsample(samples: { at: Date; c: number }[], from: Date, to: Date): ColdPoint[] {
  if (samples.length <= SERIES_POINTS) return samples.map(s => ({ t: s.at.getTime(), c: s.c, min: s.c, max: s.c }));
  const span = Math.max(1, to.getTime() - from.getTime()) / SERIES_POINTS;
  const buckets = new Map<number, number[]>();
  for (const s of samples) {
    const k = Math.min(SERIES_POINTS - 1, Math.floor((s.at.getTime() - from.getTime()) / span));
    const list = buckets.get(k) ?? []; list.push(s.c); buckets.set(k, list);
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([k, cs]) => ({
    t: Math.round(from.getTime() + (k + 0.5) * span), c: round(cs.reduce((a, b) => a + b, 0) / cs.length, 2), min: Math.min(...cs), max: Math.max(...cs),
  }));
}
