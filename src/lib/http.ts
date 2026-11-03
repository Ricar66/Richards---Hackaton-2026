import { NextResponse } from "next/server";
/** `error` segue legível (a UI mostra no toast); `code` é o identificador estável do contrato. */
export function apiError(status: number, code: string, error: string) {
  return NextResponse.json({ error, code }, { status, headers: { "Cache-Control": "no-store" } });
}
export const databaseUnavailable = () =>
  apiError(503, "DATABASE_UNAVAILABLE", "Banco de dados indisponível. Nenhum número é exibido para não apresentar dado falso.");
export const notSeeded = () => apiError(503, "NOT_SEEDED", "Base não preparada: execute pnpm db:seed.");
