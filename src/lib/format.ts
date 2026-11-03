export const numBR = (n: number, digits = 1) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(n);
// Fuso fixo: servidor (container em UTC) e navegador precisam gerar o mesmo texto, senão a hidratação falha.
export const TIME_ZONE = "America/Sao_Paulo";
export const dateBR = (d: string | Date) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE }).format(new Date(d));
export const timeBR = (d: Date = new Date()) => d.toLocaleTimeString("pt-BR", { timeZone: TIME_ZONE });
