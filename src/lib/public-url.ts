/**
 * Endereço público usado nos QR (Passaporte do Alimento). `RICHARDS_PUBLIC_URL` vale primeiro (domínio, túnel ou IP
 * da rede do evento); sem ele, o host da própria requisição do operador. Host com caractere estranho cai no localhost.
 */
export function publicBaseUrl(h: Headers): string {
  const env = process.env.RICHARDS_PUBLIC_URL?.trim();
  if (env) {
    try { const u = new URL(env); if (u.protocol === "http:" || u.protocol === "https:") return u.origin; } catch { /* inválida: segue para o host */ }
  }
  const raw = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  const host = /^[A-Za-z0-9.\-]+(:\d{1,5})?$|^\[[0-9a-fA-F:]+\](:\d{1,5})?$/.test(raw) ? raw : "localhost:3000";
  const fwd = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim();
  return `${fwd === "https" ? "https" : "http"}://${host}`;
}

/** Celular não abre localhost: o QR feito assim só funciona no próprio computador. */
export const isLoopbackUrl = (url: string) => {
  try { const h = new URL(url).hostname; return h === "localhost" || h === "::1" || h === "[::1]" || h.startsWith("127."); } catch { return true; }
};
