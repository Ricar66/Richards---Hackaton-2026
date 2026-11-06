import { NextResponse } from "next/server";
/** `error` segue legível (a UI mostra no toast); `code` é o identificador estável do contrato. */
export function apiError(status: number, code: string, error: string) {
  return NextResponse.json({ error, code }, { status, headers: { "Cache-Control": "no-store" } });
}
export const databaseUnavailable = () =>
  // Texto neutro: aparece em toasts e gavetas que já mostram números. O que cada tela faz com os números ela mesma diz.
  apiError(503, "DATABASE_UNAVAILABLE", "Banco de dados indisponível no momento. Tente de novo em instantes.");
export const notSeeded = () => apiError(503, "NOT_SEEDED", "Base não preparada: execute pnpm db:seed.");
