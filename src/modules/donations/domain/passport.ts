import type { DonationState } from "./donation-workflow";

/**
 * Passaporte do Alimento: a página pública do lote, aberta pelo QR da etiqueta.
 * Regras puras (sem banco): formato do token, janela da temperatura, nome público e o veredito de cada estado.
 */

/** 128 bits em hexadecimal. A rota pública e o proxy aceitam só este formato. */
export const PASSPORT_TOKEN_RE = /^[a-f0-9]{32}$/;
export const isPassportToken = (s: string) => PASSPORT_TOKEN_RE.test(s);
export const passportPath = (token: string) => `/p/${token}`;
/** Código curto impresso na etiqueta ao lado do QR, para a pessoa conferir que o QR é daquele lote. */
export const passportCode = (token: string) => token.slice(0, 6).toUpperCase();

const PARTICLES = new Set(["de", "da", "do", "das", "dos", "e", "di", "du", "del", "van", "von"]);
/**
 * Nome de quem atestou como aparece em público: primeiro nome e a inicial do último sobrenome.
 * "Paula Mendes" → "Paula M."; "Ricardo Coradini de Marco Moretti" → "Ricardo M."; "Ana" → "Ana".
 * O nome completo fica no banco e na auditoria; a página pública nunca o recebe.
 */
export function publicName(full: string | null | undefined): string | null {
  const words = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const cap = (w: string) => w.charAt(0).toLocaleUpperCase("pt-BR") + w.slice(1);
  const first = cap(words[0]);
  const rest = words.slice(1).filter(w => !PARTICLES.has(w.toLocaleLowerCase("pt-BR")));
  if (!rest.length) return first;
  return `${first} ${rest[rest.length - 1].charAt(0).toLocaleUpperCase("pt-BR")}.`;
}

export const LOOKBACK_HOURS = 24;
export const MAX_SPAN_DAYS = 7;
/**
 * Janela da temperatura do EQUIPAMENTO de origem anexada ao lote: das 24 h antes da pesagem até a entrega ou o
 * cancelamento (ou até agora, se o lote segue na loja), limitada a 7 dias depois da pesagem.
 * É o registro do equipamento, não do alimento: o transporte não tem sensor.
 */
export function passportWindow(createdAt: Date, end: Date | null, now: Date) {
  const from = new Date(createdAt.getTime() - LOOKBACK_HOURS * 3600_000);
  const limit = new Date(createdAt.getTime() + MAX_SPAN_DAYS * 86_400_000);
  const target = end ?? now;
  const capped = target > limit;
  const to = capped ? limit : target < from ? from : target;
  return { from, to, capped, open: end === null };
}

/** Lote simulado só usa temperatura simulada; lote real (sensor ou manual) só usa a do sensor. Nunca misturam. */
export const tempSourceFor = (lotSource: string): "DEVICE" | "SIMULATED" => (lotSource === "SIMULATED" ? "SIMULATED" : "DEVICE");

export type VerdictTone = "wait" | "ok" | "done" | "stop";
/** O que a pessoa que escaneou precisa saber primeiro, em uma linha. */
export const PASSPORT_VERDICT: Record<DonationState, { tone: VerdictTone; title: string; text: string }> = {
  PENDING_REVIEW: { tone: "wait", title: "Aguardando triagem sanitária", text: "Este lote ainda não foi liberado para doação." },
  AVAILABLE: { tone: "ok", title: "Liberado para doação", text: "Triagem sanitária registrada. Aguardando a instituição." },
  RESERVED: { tone: "ok", title: "Reservado para doação", text: "Triagem registrada e instituição definida." },
  DELIVERED: { tone: "done", title: "Doação entregue", text: "A instituição confirmou o recebimento." },
  CANCELLED: { tone: "stop", title: "Retirado da doação", text: "Não distribua nem consuma este lote." },
};

export type StampKey = "WEIGHED" | "TRIAGED" | "RESERVED" | "DELIVERED";
export type Stamp = { key: StampKey; label: string; at: string | null };
/** Os carimbos do passaporte, na ordem da jornada. Etapa não alcançada fica sem data (carimbo vazio). */
export function passportStamps(t: { createdAt: Date; verifiedAt: Date | null; reservedAt: Date | null; deliveredAt: Date | null }, weighedByScale: boolean): Stamp[] {
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  return [
    { key: "WEIGHED", label: weighedByScale ? "Pesado na balança" : "Registrado", at: iso(t.createdAt) },
    { key: "TRIAGED", label: "Triagem sanitária", at: iso(t.verifiedAt) },
    { key: "RESERVED", label: "Reservado", at: iso(t.reservedAt) },
    { key: "DELIVERED", label: "Entregue", at: iso(t.deliveredAt) },
  ];
}

/** Abaixo disto a porcentagem "na faixa" fala de pouco tempo medido: o destaque não pode ser verde. */
export const LOW_COVERAGE_PCT = 80;
/**
 * Como destacar o "% na faixa" no passaporte. Verde só com série boa: medida em pelo menos 80% da janela e sem
 * excursão. Pouca cobertura vira aviso com a cobertura escrita, porque 100% de 8% da janela não é 100% da janela.
 */
export function coldHeadline(inRangePct: number | null, coveragePct: number, excursions: number): { tone: "none" | "clean" | "warned" | "partial"; note: string | null } {
  if (inRangePct === null) return { tone: "none", note: null };
  if (coveragePct < LOW_COVERAGE_PCT) {
    const cov = coveragePct > 0 && coveragePct < 0.1 ? "menos de 0,1" : coveragePct.toLocaleString("pt-BR", { maximumFractionDigits: coveragePct < 10 ? 1 : 0 });
    return { tone: "partial", note: `Só ${cov}% da janela tem leitura: o resto não foi medido.` };
  }
  return { tone: excursions === 0 ? "clean" : "warned", note: null };
}
