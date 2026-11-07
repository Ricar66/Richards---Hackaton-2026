import { DEVICE_KEY, db, newBootId, reading, resetAndSeed } from "./helpers";
import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { IngestTelemetry } from "../../src/modules/monitoring/application/ingest-telemetry";
import { openFlowOccurrence } from "../../src/modules/monitoring/application/open-flow-occurrence";
import { OccurrenceService } from "../../src/modules/monitoring/application/occurrence-service";
import { DonationService } from "../../src/modules/donations/application/donation-service";
import { BancadaLigadaError, cadastrarInstituicao, inventarioSimulado, limparSimulados } from "../../src/modules/admin/application/dados-reais";
import { DEMO_DEVICE_ID, DEMO_ORG_ID, DEMO_RECIPIENT_ID, DEMO_RECIPIENT_IDS, DEMO_SITE_ID } from "../../src/lib/constants";

/**
 * Passagem para "só dados reais" (06/11): sai tudo o que é SIMULATED e as instituições fictícias; nada real é tocado.
 * Cenário misto: leitura/ocorrência/lote reais convivendo com os simulados, como numa bancada que já usou o simulador.
 */
const ingest = new IngestTelemetry();
const LATER = new Date(Date.now() + 10 * 60_000); // limpeza "10 min depois": a trava da bancada ligada não dispara
beforeEach(async () => {
  await resetAndSeed();
  await db().recipientOrganization.update({ where: { id: DEMO_RECIPIENT_ID }, data: { name: "Instituição Parceira · Demonstração" } });
  await db().recipientOrganization.create({ data: { id: DEMO_RECIPIENT_IDS[1], name: "Cozinha Comunitária · Demonstração", city: "Ribeirão Preto" } });
});
after(() => db().$disconnect());

async function cenarioMisto() {
  const realBoot = newBootId(), simBoot = newBootId();
  for (let s = 0; s < 3; s++) await ingest.execute(reading(realBoot, s, 0.4, 60 - s * 10), DEVICE_KEY, false);
  for (let s = 0; s < 4; s++) await ingest.execute(reading(simBoot, s, 0.6, 30 - s * 5), DEVICE_KEY, true);
  const sim = await openFlowOccurrence({ organizationId: DEMO_ORG_ID, siteId: DEMO_SITE_ID, deviceId: DEMO_DEVICE_ID, source: "SIMULATED", title: "Alerta de demonstração", description: "x", suspectedLiters: 1, eventNote: "teste", actor: "simulador:teste", evidence: { scenario: "flow" } });
  await new OccurrenceService().transition(sim.occurrenceId, "ACKNOWLEDGED", "assumida no ensaio", "operador:ana");
  const real = await db().occurrence.create({ data: { organizationId: DEMO_ORG_ID, siteId: DEMO_SITE_ID, deviceId: DEMO_DEVICE_ID, kind: "UNUSUAL_FLOW", severity: "HIGH", status: "OPEN", source: "DEVICE", title: "Fluxo real", description: "sensor" } });
  const service = new DonationService();
  const realLot = await service.create({ description: "Lote real do operador", weightKg: 3 }, "operador:ana");          // MANUAL
  await service.transition(realLot.id, { status: "AVAILABLE", verifiedBy: "Ana Lima", ...DONATION_TRIAGE }, "operador:ana");
  await service.transition(realLot.id, { status: "RESERVED", recipientId: DEMO_RECIPIENT_ID }, "operador:ana");     // lote real na instituição fictícia A
  const simLot = await db().donationBatch.create({ data: { organizationId: DEMO_ORG_ID, description: "Lote simulado", weightKg: 6, status: "RESERVED", source: "SIMULATED", recipientId: DEMO_RECIPIENT_IDS[1], safetyVerifiedBy: "seed", safetyVerifiedAt: new Date() } });
  await db().auditEvent.create({ data: { organizationId: DEMO_ORG_ID, entity: "DonationBatch", entityId: simLot.id, action: "CREATED", metadata: { actor: "seed" } } });
  return { simOcc: sim.occurrenceId, realOcc: real.id, realLot: realLot.id, simLot: simLot.id };
}

const DONATION_TRIAGE = {
  foodOrigin: "WHOLE_PRODUCE" as const,
  reviewerQualification: "Nutricionista responsável",
  inspectionOk: true, conservationOk: true, validityOk: true, transportOk: true,
};

test("D1 inventário conta o simulado e separa o real, sem apagar nada", async () => {
  const ids = await cenarioMisto();
  const inv = await inventarioSimulado(db());
  assert.equal(inv.leituras, 4); assert.equal(inv.ocorrencias, 1); assert.equal(inv.lotes, 1);
  assert.deepEqual(inv.reais, { leituras: 3, ocorrencias: 1, lotes: 1 });
  assert.ok(inv.eventosDeOcorrencia >= 2 && inv.auditoria >= 2, `eventos ${inv.eventosDeOcorrencia} auditoria ${inv.auditoria}`);
  const a = inv.instituicoes.find(i => i.id === DEMO_RECIPIENT_ID)!, b = inv.instituicoes.find(i => i.id === DEMO_RECIPIENT_IDS[1])!;
  assert.equal(a.removivel, false, "a instituição A tem lote real: fica"); assert.match(a.motivo!, /lote\(s\) real/);
  assert.equal(b.removivel, true, "a B só tem lote simulado: sai");
  assert.equal(await db().occurrence.count({ where: { id: ids.simOcc } }), 1, "inventário não apaga");
});

test("D2 limpeza apaga só o SIMULATED; leitura, ocorrência, lote e instituição reais ficam intactos", async () => {
  const ids = await cenarioMisto();
  const realBefore = await db().telemetryReading.findMany({ where: { source: "DEVICE" }, orderBy: { sequence: "asc" } });
  const realOccBefore = await db().occurrence.findUniqueOrThrow({ where: { id: ids.realOcc } });
  const realLotBefore = await db().donationBatch.findUniqueOrThrow({ where: { id: ids.realLot } });
  const r = await limparSimulados(db(), "admin:teste", LATER);
  assert.equal(r.leituras, 4); assert.equal(r.ocorrencias, 1); assert.equal(r.lotes, 1);
  assert.deepEqual(r.instituicoesRemovidas, ["Cozinha Comunitária · Demonstração"]);
  assert.equal(r.instituicoesMantidas[0].nome, "Instituição Parceira · Demonstração");
  assert.equal(await db().telemetryReading.count({ where: { source: "SIMULATED" } }), 0);
  assert.equal(await db().occurrence.count({ where: { source: "SIMULATED" } }), 0);
  assert.equal(await db().occurrenceEvent.count({ where: { occurrenceId: ids.simOcc } }), 0);
  assert.equal(await db().auditEvent.count({ where: { entityId: { in: [ids.simOcc, ids.simLot] } } }), 0);
  assert.deepEqual(await db().telemetryReading.findMany({ where: { source: "DEVICE" }, orderBy: { sequence: "asc" } }), realBefore, "leituras reais idênticas");
  assert.deepEqual(await db().occurrence.findUniqueOrThrow({ where: { id: ids.realOcc } }), realOccBefore, "ocorrência real idêntica");
  assert.deepEqual(await db().donationBatch.findUniqueOrThrow({ where: { id: ids.realLot } }), realLotBefore, "lote real idêntico");
  assert.ok(await db().auditEvent.count({ where: { entity: "DonationBatch", entityId: ids.realLot } }) >= 3, "auditoria do lote real fica");
  const purge = await db().auditEvent.findFirstOrThrow({ where: { action: "SIMULATED_DATA_PURGED" } });
  assert.equal((purge.metadata as { actor: string }).actor, "admin:teste");
  assert.equal((purge.metadata as { leituras: number }).leituras, 4);
});

test("D3 último contato do sensor volta para a leitura real; sem leitura real, fica vazio", async () => {
  await cenarioMisto();
  const lastReal = await db().telemetryReading.findFirstOrThrow({ where: { source: "DEVICE" }, orderBy: { receivedAt: "desc" } });
  await limparSimulados(db(), "admin:teste", LATER);
  assert.deepEqual((await db().device.findUniqueOrThrow({ where: { id: DEMO_DEVICE_ID } })).lastSeenAt, lastReal.receivedAt);
  // Só simulado: o sensor fica "sem comunicação" até o próximo pacote.
  await resetAndSeed();
  await ingest.execute(reading(newBootId(), 0, 0.6, 5), DEVICE_KEY, true);
  await limparSimulados(db(), "admin:teste", LATER);
  assert.equal((await db().device.findUniqueOrThrow({ where: { id: DEMO_DEVICE_ID } })).lastSeenAt, null);
});

test("D4 bancada ligada (leitura SIMULATED há menos de 2 min): recusa e não apaga nada", async () => {
  await cenarioMisto();
  await assert.rejects(limparSimulados(db(), "admin:teste"), BancadaLigadaError);
  assert.equal(await db().telemetryReading.count({ where: { source: "SIMULATED" } }), 4);
  assert.equal(await db().auditEvent.count({ where: { action: "SIMULATED_DATA_PURGED" } }), 0);
});

test("D5 instituição renomeada para nome real (sem 'Demonstração') não sai, mesmo com id do seed", async () => {
  await db().recipientOrganization.update({ where: { id: DEMO_RECIPIENT_IDS[1] }, data: { name: "Banco de Alimentos de Ribeirão" } });
  const r = await limparSimulados(db(), "admin:teste", LATER);
  assert.ok(r.instituicoesRemovidas.includes("Instituição Parceira · Demonstração"));
  assert.ok(!r.instituicoesRemovidas.includes("Banco de Alimentos de Ribeirão"));
  assert.equal(await db().recipientOrganization.count({ where: { id: DEMO_RECIPIENT_IDS[1] } }), 1);
});

test("D6 segunda limpeza não encontra nada e não apaga a auditoria da primeira", async () => {
  await cenarioMisto();
  await limparSimulados(db(), "admin:teste", LATER);
  const r2 = await limparSimulados(db(), "admin:teste", LATER);
  assert.equal(r2.leituras + r2.ocorrencias + r2.lotes + r2.auditoria, 0);
  assert.equal(await db().auditEvent.count({ where: { action: "SIMULATED_DATA_PURGED" } }), 2);
});

test("D7 cadastro de instituição real: cria com auditoria, não duplica e recusa nome 'Demonstração'", async () => {
  const a = await cadastrarInstituicao(db(), { nome: "  Banco de Alimentos  de Ribeirão ", cidade: "Ribeirão Preto", actor: "admin:teste" });
  assert.equal(a.criada, true); assert.equal(a.nome, "Banco de Alimentos de Ribeirão");
  const b = await cadastrarInstituicao(db(), { nome: "banco de alimentos de ribeirão", cidade: "Ribeirão Preto", actor: "admin:teste" });
  assert.equal(b.criada, false); assert.equal(b.id, a.id);
  assert.equal(await db().auditEvent.count({ where: { entity: "RecipientOrganization", entityId: a.id, action: "CREATED" } }), 1);
  await assert.rejects(cadastrarInstituicao(db(), { nome: "Cozinha · Demonstração", cidade: "Ribeirão Preto", actor: "admin:teste" }), /Demonstração/);
  // A instituição nova serve de destino de reserva como qualquer outra.
  const lot = await new DonationService().create({ description: "Lote real", weightKg: 2 }, "operador:ana");
  await new DonationService().transition(lot.id, { status: "AVAILABLE", verifiedBy: "Ana Lima", ...DONATION_TRIAGE }, "operador:ana");
  const res = await new DonationService().transition(lot.id, { status: "RESERVED", recipientId: a.id }, "operador:ana");
  assert.equal(res.status, "RESERVED");
});
