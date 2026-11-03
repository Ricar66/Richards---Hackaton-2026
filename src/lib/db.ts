import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const globalForPrisma = globalThis as unknown as { richardsDb?: PrismaClient };
export function getDb() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ausente");
  if (!globalForPrisma.richardsDb) {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    globalForPrisma.richardsDb = new PrismaClient({ adapter, log: ["error"] });
  }
  return globalForPrisma.richardsDb;
}
