import { TIME_ZONE } from "@/lib/format";

/**
 * Filtro global do BI. Vive na URL (`?range=7d&deviceId=...&source=DEVICE`) para a investigação ser compartilhável,
 * e é o MESMO objeto que o dashboard, o detalhamento de intervalo e o PDF recebem: números iguais por construção.
 */
export const RANGE_SECONDS = { "24h": 86_400, "7d": 7 * 86_400, "30d": 30 * 86_400 } as const;
export type RangeKey = keyof typeof RANGE_SECONDS;
export const SOURCES = ["ALL", "DEVICE", "SIMULATED", "MANUAL"] as const;
export type SourceFilter = (typeof SOURCES)[number];
export const BUCKET_SECONDS = { "15m": 900, "1h": 3_600, "1d": 86_400 } as const;
export type Bucket = keyof typeof BUCKET_SECONDS;
/** Teto de período: protege o banco e mantém o gráfico legível. */
export const MAX_SPAN_DAYS = 92;

export type AnalyticsFilter = {
  range: RangeKey | "custom";
  /** Início alinhado ao começo do intervalo de agregação no fuso de São Paulo. */
  from: Date;
  to: Date;
  bucket: Bucket;
  siteId: string | null;
  deviceId: string | null;
  source: SourceFilter;
};

/** Filtro recusado: a mensagem é segura para mostrar ao usuário. */
export class FilterError extends Error {}

type Params = URLSearchParams | Record<string, string | string[] | undefined>;
const read = (p: Params, key: string) => {
  const v = p instanceof URLSearchParams ? p.get(key) : p[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : null;
};
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Diferença (ms) entre o relógio de São Paulo e o UTC naquele instante. Sem horário de verão desde 2019, mas não presumimos. */
export function tzOffsetMs(d: Date, timeZone = TIME_ZONE) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(d).filter(x => x.type !== "literal").map(x => [x.type, Number(x.value)]));
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
}

/** Começo do intervalo (15 min, hora ou dia) que contém `d`, contado no relógio de São Paulo. */
export function floorToBucket(d: Date, bucket: Bucket) {
  const size = BUCKET_SECONDS[bucket] * 1000;
  const offset = tzOffsetMs(d);
  return new Date(Math.floor((d.getTime() + offset) / size) * size - offset);
}

export function bucketForSpan(spanMs: number): Bucket {
  if (spanMs <= 36 * 3_600_000) return "15m";
  if (spanMs <= 10 * 86_400_000) return "1h";
  return "1d";
}

export function parseAnalyticsFilter(p: Params, now = new Date()): AnalyticsFilter {
  const source = (read(p, "source") ?? "ALL").toUpperCase();
  if (!(SOURCES as readonly string[]).includes(source)) throw new FilterError("Origem inválida: use ALL, DEVICE, SIMULATED ou MANUAL.");
  const siteId = read(p, "siteId"), deviceId = read(p, "deviceId");
  if ((siteId && !ID.test(siteId)) || (deviceId && !ID.test(deviceId))) throw new FilterError("Identificador de unidade ou dispositivo inválido.");

  const fromRaw = read(p, "from"), toRaw = read(p, "to");
  let range: AnalyticsFilter["range"];
  let from: Date, to: Date;
  if (fromRaw || toRaw) {
    if (!fromRaw || !toRaw) throw new FilterError("Período personalizado exige início e fim.");
    from = new Date(fromRaw); to = new Date(toRaw);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new FilterError("Datas do período inválidas.");
    if (from >= to) throw new FilterError("O início do período precisa ser anterior ao fim.");
    if (to.getTime() - from.getTime() > MAX_SPAN_DAYS * 86_400_000) throw new FilterError(`Período máximo de ${MAX_SPAN_DAYS} dias.`);
    // Futuro não tem leitura: o fim é cortado em "agora" em vez de desenhar intervalos vazios como se fossem medição.
    if (to > now) to = now;
    if (from >= to) throw new FilterError("O período escolhido ainda não começou.");
    range = "custom";
  } else {
    const key = read(p, "range") ?? "7d";
    if (!(key in RANGE_SECONDS)) throw new FilterError("Intervalo inválido: use 24h, 7d ou 30d.");
    range = key as RangeKey;
    to = now;
    from = new Date(now.getTime() - RANGE_SECONDS[range] * 1000);
  }
  const bucket = bucketForSpan(to.getTime() - from.getTime());
  return { range, from: floorToBucket(from, bucket), to, bucket, siteId, deviceId, source: source as SourceFilter };
}

/** Parâmetros de URL equivalentes (para links, polling e PDF). */
export function filterToQuery(f: Pick<AnalyticsFilter, "range" | "from" | "to" | "siteId" | "deviceId" | "source">) {
  const q = new URLSearchParams();
  if (f.range === "custom") { q.set("from", f.from.toISOString()); q.set("to", f.to.toISOString()); }
  else if (f.range !== "7d") q.set("range", f.range);
  if (f.siteId) q.set("siteId", f.siteId);
  if (f.deviceId) q.set("deviceId", f.deviceId);
  if (f.source !== "ALL") q.set("source", f.source);
  return q;
}
