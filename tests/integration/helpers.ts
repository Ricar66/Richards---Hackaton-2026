// Importar ANTES de qualquer módulo da aplicação: aponta o Prisma para o banco de teste.
import "dotenv/config";
import { createHash } from "node:crypto";
import { getDb } from "../../src/lib/db";
import { DEMO_DEVICE_ID, DEMO_ORG_ID, DEMO_RECIPIENT_ID, DEMO_SITE_ID } from "../../src/lib/constants";
import type { TelemetryCommand } from "../../src/modules/monitoring/application/ingest-telemetry";

const url = process.env.TEST_DATABASE_URL;
if (!url || !/_test$/.test(new URL(url).pathname)) throw new Error("TEST_DATABASE_URL ausente ou sem sufixo _test: testes de integração recusados.");
process.env.DATABASE_URL = url;
process.env.DEMO_MODE = "true";

export const DEVICE_CODE = "TEST-FLOW-001";
export const DEVICE_KEY = "chave-de-teste-integracao";
export const db = () => getDb();

const TABLES = ["AuditEvent", "Mission", "OccurrenceEvent", "Occurrence", "TelemetryReading", "DonationBatch", "RecipientOrganization", "Device", "Site", "User", "Organization"];
/** Limpa o banco de teste e recria org/unidade/sensor/receptor com os IDs de demonstração usados pelos serviços. */
export async function resetAndSeed() {
  const [{ name }] = await db().$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  if (!name.endsWith("_test")) throw new Error(`Recusado: conectado em "${name}", não em banco de teste.`);
  await db().$executeRawUnsafe(`TRUNCATE ${TABLES.map(t => `"${t}"`).join(", ")} CASCADE`);
  await db().organization.create({ data: { id: DEMO_ORG_ID, name: "Org de teste", sector: "Teste", city: "Ribeirão Preto", isDemo: true } });
  await db().site.create({ data: { id: DEMO_SITE_ID, organizationId: DEMO_ORG_ID, name: "Unidade de teste" } });
  await db().device.create({ data: {
    id: DEMO_DEVICE_ID, organizationId: DEMO_ORG_ID, siteId: DEMO_SITE_ID, code: DEVICE_CODE, label: "Sensor de teste", kind: "FLOW",
    apiKeyHash: createHash("sha256").update(DEVICE_KEY).digest("hex"), minFlowLpm: 1.5, continuousSeconds: 30,
  } });
  await db().recipientOrganization.create({ data: { id: DEMO_RECIPIENT_ID, name: "Receptor de teste", city: "Ribeirão Preto" } });
}

let boot = 0;
export const newBootId = () => `boot-${Date.now()}-${++boot}`;
/** Leitura válida com horário relativo a agora (a API rejeita desvio maior que 5 min). */
export function reading(bootId: string, sequence: number, flowLpm: number, secondsAgo = 0): TelemetryCommand {
  return { deviceCode: DEVICE_CODE, bootId, sequence, flowLpm, deltaLiters: Math.round(flowLpm * 0.25 * 1000) / 1000, capturedAt: new Date(Date.now() - secondsAgo * 1000).toISOString() };
}
