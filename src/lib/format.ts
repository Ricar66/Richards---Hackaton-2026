export const numBR = (n: number, digits = 1) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(n);
// Fuso fixo: servidor (container em UTC) e navegador precisam gerar o mesmo texto, senão a hidratação falha.
export const TIME_ZONE = "America/Sao_Paulo";
export const dateBR = (d: string | Date) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE }).format(new Date(d));
export const timeBR = (d: Date = new Date()) => d.toLocaleTimeString("pt-BR", { timeZone: TIME_ZONE });

const hm = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE });
const dm = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TIME_ZONE });
const wd = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: TIME_ZONE });
export const hourBR = (d: number | string | Date) => hm.format(new Date(d));
export const dayBR = (d: number | string | Date) => dm.format(new Date(d));
export const weekdayBR = (d: number | string | Date) => wd.format(new Date(d)).replace(".", "");

/** Rótulo do eixo/tooltip para o início de um intervalo de agregação. */
export function bucketLabel(t: number, bucket: "15m" | "1h" | "1d", long = false) {
  if (bucket === "1d") return long ? `${weekdayBR(t)} ${dayBR(t)}` : dayBR(t);
  return long ? `${weekdayBR(t)} ${dayBR(t)} · ${hourBR(t)}` : hourBR(t);
}

/** "há 12 s", "há 5 min", "há 3 h", "há 2 d" — para sinais e filas (sempre ao lado do horário absoluto em algum lugar). */
export function agoBR(fromMs: number, nowMs: number) {
  const s = Math.max(0, Math.round((nowMs - fromMs) / 1000));
  if (s < 5) return "agora";
  if (s < 60) return `há ${s} s`;
  const m = Math.round(s / 60); if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60); if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} d`;
}

/** Duração em minutos legível: 19 min, 2 h 05, 3 d. */
export function durationBR(min: number | null) {
  if (min === null) return "—";
  if (min < 60) return `${Math.round(min)} min`;
  if (min < 48 * 60) { const h = Math.floor(min / 60), m = Math.round(min % 60); return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`; }
  return `${Math.round(min / 1440)} d`;
}
