import type { LiveEvent, ReadingCreatedEvent } from "@/modules/realtime/domain/live-event";
import type { DashboardDTO, LiveDTO } from "@/modules/analytics/domain/dashboard";

/** Mesma janela e mesmo teto do get-live.ts: o sinal curto da tela é o do servidor mais as leituras gravadas que chegaram depois. */
export const RECENT_WINDOW_MS = 30 * 60_000;
export const RECENT_MAX = 120;
type Point = LiveDTO["recent"][number];

/** `now` vem do relógio do servidor (emittedAt/generatedAt), não do navegador. */
export function trimRecent(xs: Point[], now: number) {
  const min = now - RECENT_WINDOW_MS;
  return xs.filter(p => p.t >= min).slice(-RECENT_MAX);
}
function insertPoint(xs: Point[], p: Point) {
  if (!xs.length || xs[xs.length - 1].t <= p.t) return [...xs, p];
  const i = xs.findIndex(x => x.t > p.t);
  return [...xs.slice(0, i), p, ...xs.slice(i)];
}

/** Leitura gravada que chegou pelo stream: vira o último valor (se for a mais nova) e entra na série curta. Nada é somado. */
export function withReading(live: LiveDTO, e: ReadingCreatedEvent): LiveDTO {
  const t = Date.parse(e.capturedAt);
  const cur = live.lastReading;
  const lastReading = !cur || t >= Date.parse(cur.at)
    ? { at: e.capturedAt, flowLpm: e.flowLpm, deltaLiters: e.deltaLiters, source: e.source, deviceCode: e.deviceCode }
    : cur;
  return { ...live, lastReading, recent: trimRecent(insertPoint(live.recent, { t, flowLpm: e.flowLpm }), Date.parse(e.emittedAt)) };
}

/**
 * Retrato novo do servidor (contagens e ativas são dele) + leituras do stream que a consulta ainda não tinha:
 * a resposta pode ter saído antes do commit da leitura que acabou de chegar, e a tela não volta para um valor mais velho.
 */
export function mergeSnapshot(body: LiveDTO, known: { last: LiveDTO["lastReading"]; points: Point[] }): LiveDTO {
  const lastT = body.recent.length ? body.recent[body.recent.length - 1].t : -Infinity;
  const recent = trimRecent([...body.recent, ...known.points.filter(p => p.t > lastT)].sort((a, b) => a.t - b.t), Date.parse(body.generatedAt));
  const b = body.lastReading, x = known.last;
  const lastReading = x && (!b || Date.parse(x.at) > Date.parse(b.at)) ? x : b;
  return { ...body, lastReading, recent };
}

/**
 * "Este evento muda o que a tela mostra?" Função pura, espelho de `readingScope`/`occurrenceScope` do get-dashboard.
 * Só decide QUANDO refazer a busca: o número continua vindo do servidor (nada é somado a partir do evento).
 * Na dúvida (campo que o evento não traz), responde sim: buscar de novo nunca mostra número errado.
 */
export type LiveScope = {
  range: DashboardDTO["filter"]["range"]; from: string; to: string;
  siteId: string | null; deviceId: string | null; source: DashboardDTO["filter"]["source"];
  /** Unidade de cada dispositivo (o evento de ocorrência não traz a unidade). */
  deviceSite: Record<string, string>;
};

export function scopeOf(d: Pick<DashboardDTO, "filter" | "options" | "devices">): LiveScope {
  const deviceSite: Record<string, string> = {};
  for (const x of [...d.options.devices, ...d.devices]) deviceSite[x.id] = x.siteId;
  const { range, from, to, siteId, deviceId, source } = d.filter;
  return { range, from, to, siteId, deviceId, source, deviceSite };
}

const sourceOk = (source: string | undefined, s: LiveScope) => s.source === "ALL" || source === undefined || source === s.source;
function deviceOk(deviceId: string | null, s: LiveScope) {
  if (s.deviceId && deviceId !== s.deviceId) return false;
  const site = deviceId ? s.deviceSite[deviceId] : undefined;
  return !s.siteId || site === undefined || site === s.siteId;
}
/** Períodos fixos deslizam (a nova busca recalcula `to = agora`); o personalizado tem fim fixo, já cortado em "agora". */
function inPeriod(at: string, s: LiveScope) {
  const t = Date.parse(at);
  if (Number.isNaN(t)) return true;
  return t >= Date.parse(s.from) && (s.range !== "custom" || t <= Date.parse(s.to));
}

export function eventInScope(e: LiveEvent, s: LiveScope): boolean {
  switch (e.type) {
    case "reading.created":
      return sourceOk(e.source, s) && (!s.deviceId || e.deviceId === s.deviceId) && (!s.siteId || e.siteId === s.siteId) && inPeriod(e.capturedAt, s);
    // Ocorrência ativa conta "agora", em qualquer período (como no get-dashboard).
    case "occurrence.opened": return sourceOk(e.source, s) && deviceOk(e.deviceId, s);
    case "occurrence.status": return deviceOk(e.deviceId, s);
    // Lote é da organização inteira; o filtro de origem vale para ele.
    case "donation.created": return sourceOk(e.source, s);
    case "donation.status": return true;
    case "resync": return true;
    // sensor.live não é gravado e message.rejected não muda dado: nenhum dos dois entra em KPI.
    default: return false;
  }
}

/** Leitura que cai na gaveta de intervalo: mesmo recorte da URL (unidade só é conferida pelo servidor) e dentro do intervalo. */
export function readingInInterval(e: ReadingCreatedEvent, query: string, start: number, end: number) {
  const q = new URLSearchParams(query);
  const deviceId = q.get("deviceId"), source = (q.get("source") ?? "ALL").toUpperCase();
  const t = Date.parse(e.capturedAt);
  return (!deviceId || e.deviceId === deviceId) && (source === "ALL" || e.source === source) && t >= start && t < end;
}

/**
 * Como cada tela reage às leituras (as demais mudanças sempre refazem a busca):
 * - Relatórios não muda sozinho, para a prévia continuar igual ao PDF: só avisa que há dado novo;
 * - Ocorrências e Doações não mostram leituras: não refazem a tabela a cada leitura;
 * - Dispositivos refaz com folga maior (contadores por sensor).
 */
export type ViewPolicy = { manual: boolean; readings: boolean; gapMs: number };
export function viewPolicy(pathname: string): ViewPolicy {
  if (pathname.startsWith("/relatorios")) return { manual: true, readings: true, gapMs: 1500 };
  if (pathname.startsWith("/ocorrencias") || pathname.startsWith("/doacoes")) return { manual: false, readings: false, gapMs: 1500 };
  if (pathname.startsWith("/dispositivos")) return { manual: false, readings: true, gapMs: 5000 };
  return { manual: false, readings: true, gapMs: 1500 };
}
