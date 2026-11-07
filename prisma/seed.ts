import "dotenv/config";
import { createHash } from "node:crypto";
import { getDb } from "../src/lib/db";
import { DEMO_ORG_ID, DEMO_SITE_ID, DEMO_DEVICE_ID, DEMO_RECIPIENT_IDS } from "../src/lib/constants";
const db = getDb();
/**
 * Roda a cada start do contêiner. Por padrão grava SÓ o cadastro-base (empresa, unidade, sensor com o hash da chave e
 * operador): desde 06/11 a demonstração usa só dados reais, e o histórico nasce do sensor.
 * SEED_DEMO_DATA="true" acrescenta o cenário fictício (instituições de demonstração e histórico SIMULATED): só para
 * bancos de teste e E2E. Na demo, `pnpm dados:limpar-simulados` remove esse cenário (docs/DADOS_REAIS.md).
 */
async function main() {
  const secret = process.env.IOT_DEMO_DEVICE_KEY;
  if (!secret) throw new Error("IOT_DEMO_DEVICE_KEY obrigatória para preparar a demonstração");
  const demo = process.env.SEED_DEMO_DATA === "true";
  await db.organization.upsert({ where: { id: DEMO_ORG_ID }, update: {}, create: { id: DEMO_ORG_ID, name: "Mercado Aurora · Unidade Centro", sector: "Varejo alimentar", city: "Ribeirão Preto", isDemo: true } });
  await db.site.upsert({ where: { id: DEMO_SITE_ID }, update: {}, create: { id: DEMO_SITE_ID, organizationId: DEMO_ORG_ID, name: "Unidade Centro", description: "Bancada demonstrativa" } });
  await db.device.upsert({ where: { id: DEMO_DEVICE_ID }, update: { apiKeyHash: createHash("sha256").update(secret).digest("hex") }, create: {
    id: DEMO_DEVICE_ID, organizationId: DEMO_ORG_ID, siteId: DEMO_SITE_ID, code: "RICHARDS-FLOW-001",
    label: "Sensor de vazão · Linha 01", kind: "FLOW", // sem lastSeenAt: o sensor só "comunica" quando um pacote real ou do simulador chegar

    apiKeyHash: createHash("sha256").update(secret).digest("hex"), minFlowLpm: 1.5, continuousSeconds: 30,
  } });
  await db.user.upsert({ where: { email: "operador@richards.local" }, update: {}, create: { organizationId: DEMO_ORG_ID, name: "Operador Demo", email: "operador@richards.local", role: "OWNER" } });
  if (!demo) {
    console.log("RICHARDS seed pronta: só o cadastro-base (empresa, unidade, sensor e operador). Nenhum dado fictício; o histórico vem do sensor.");
    return;
  }
  const [recipientA, recipientB] = DEMO_RECIPIENT_IDS;
  await db.recipientOrganization.upsert({ where: { id: recipientA }, update: {}, create: { id: recipientA, name: "Instituição Parceira · Demonstração", city: "Ribeirão Preto" } });
  // Segunda instituição fictícia para a demonstração da escolha de destino (nome deixa claro que é demonstração).
  await db.recipientOrganization.upsert({ where: { id: recipientB }, update: {}, create: { id: recipientB, name: "Cozinha Comunitária · Demonstração", city: "Ribeirão Preto" } });
  const existing = await db.telemetryReading.count({ where: { deviceId: DEMO_DEVICE_ID } });
  if (existing === 0) {
    const base = new Date(); base.setMinutes(0, 0, 0); base.setDate(base.getDate() - 7);
    const readings = Array.from({ length: 7 * 24 }, (_, i) => {
      const capturedAt = new Date(base.getTime() + i * 3600_000);
      const hour = capturedAt.getHours();
      const occupied = hour >= 7 && hour <= 21;
      const flow = occupied ? 0.8 + Math.sin(i * 0.65) * 0.25 + ((i * 7) % 9) / 24 : 0.03;
      return { deviceId: DEMO_DEVICE_ID, bootId: "seed-2026", sequence: i, flowLpm: Math.max(0, flow), deltaLiters: Math.max(0, flow) * 60, source: "SIMULATED" as const, capturedAt };
    });
    await db.telemetryReading.createMany({ data: readings, skipDuplicates: true });
  }
  if ((await db.occurrence.count({ where: { organizationId: DEMO_ORG_ID } })) === 0) {
    await db.occurrence.createMany({ data: [
      { id: "richards-oc-01", organizationId: DEMO_ORG_ID, siteId: DEMO_SITE_ID, deviceId: DEMO_DEVICE_ID, kind: "UNUSUAL_FLOW", severity: "HIGH", status: "OPEN", source: "SIMULATED", title: "Fluxo contínuo fora de horário", description: "Cenário simulado: vazão contínua durante fechamento. Verificação necessária.", suspectedLiters: 12.4, openedAt: new Date(Date.now() - 16*60_000) },
      { id: "richards-oc-02", organizationId: DEMO_ORG_ID, siteId: DEMO_SITE_ID, deviceId: DEMO_DEVICE_ID, kind: "UNUSUAL_FLOW", severity: "MEDIUM", status: "RESOLVED", source: "SIMULATED", title: "Consumo acima da faixa configurada", description: "Cenário demonstrativo resolvido.", suspectedLiters: 8.2, openedAt: new Date(Date.now() - 2*86400_000), resolvedAt: new Date(Date.now()-2*86400_000 + 19*60_000), verificationNote: "Fluxo de demonstração encerrado." },
      { id: "richards-oc-03", organizationId: DEMO_ORG_ID, siteId: DEMO_SITE_ID, deviceId: DEMO_DEVICE_ID, kind: "DEVICE_OFFLINE", severity: "LOW", status: "ACKNOWLEDGED", source: "SIMULATED", title: "Conectividade oscilante", description: "Cenário simulado: perda temporária de comunicação.", openedAt: new Date(Date.now() - 53*60_000), acknowledgedAt: new Date(Date.now()-25*60_000) },
    ] });
  }
  if ((await db.donationBatch.count({ where: { organizationId: DEMO_ORG_ID } })) === 0) {
    await db.donationBatch.createMany({ data: [
      { id: "richards-don-01", organizationId: DEMO_ORG_ID, recipientId: recipientA, description: "Frutas selecionadas · caixa mista", weightKg: 8.5, status: "DELIVERED", source: "SIMULATED", safetyVerifiedBy: "Responsável do cenário", safetyVerifiedAt: new Date(Date.now()-3*86400_000), receivedAt: new Date(Date.now()-2*86400_000), receivedBy: "Recebedor do cenário", createdAt: new Date(Date.now()-3*86400_000) },
      { id: "richards-don-02", organizationId: DEMO_ORG_ID, recipientId: recipientA, description: "Hortaliças · lote de demonstração", weightKg: 6, status: "RESERVED", source: "SIMULATED", safetyVerifiedBy: "Responsável do cenário", safetyVerifiedAt: new Date(Date.now()-5*3600_000), createdAt: new Date(Date.now()-6*3600_000) },
      { id: "richards-don-03", organizationId: DEMO_ORG_ID, description: "Bananas · lote em avaliação", weightKg: 4.2, status: "PENDING_REVIEW", source: "SIMULATED", createdAt: new Date(Date.now()-3600_000) },
    ] });
  }
  console.log("RICHARDS seed pronta com o cenário de DEMONSTRAÇÃO: todos os dados criados são SIMULADOS (só para teste e E2E).");
}
main().finally(async () => { await db.$disconnect() });
