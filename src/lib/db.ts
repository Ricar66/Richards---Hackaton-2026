import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const globalForPrisma = globalThis as unknown as { richardsDb?: PrismaClient };
export function getDb() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ausente");
  if (!globalForPrisma.richardsDb) {
    // Sem timeout, um banco inalcançável trava a requisição em vez de virar 503.
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5_000 });
    globalForPrisma.richardsDb = new PrismaClient({ adapter, log: ["error"] });
  }
  return globalForPrisma.richardsDb;
}
/** Erro de infraestrutura (banco fora, timeout). Rotas traduzem para 503 — nunca para dados de demonstração. */
export class DatabaseUnavailableError extends Error {
  constructor(cause?: unknown) { super("DATABASE_UNAVAILABLE", { cause }); }
}
