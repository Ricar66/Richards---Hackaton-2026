import { DEVICE_CODE, db, resetAndSeed } from "./helpers";
import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { DonationService } from "../../src/modules/donations/application/donation-service";
import { getPublicPassport } from "../../src/modules/donations/application/passport-service";
import { DonationRuleError } from "../../src/modules/donations/domain/donation-workflow";
import { DEMO_DEVICE_ID, DEMO_ORG_ID, DEMO_RECIPIENT_ID, DEMO_SITE_ID } from "../../src/lib/constants";

const service = new DonationService();
beforeEach(resetAndSeed);
after(() => db().$disconnect());

const TRIAGE = {
  verifiedBy: "Paula Mendes", reviewerQualification: "Nutricionista · CRN-3 12345", foodOrigin: "WHOLE_PRODUCE" as const,
  inspectionOk: true, conservationOk: true, validityOk: true, transportOk: true,
};
async function fridge(active = true, code = "GEL-PASS") {
  return db().coldEquipment.create({ data: { organizationId: DEMO_ORG_ID, siteId: DEMO_SITE_ID, code, label: "Geladeira do hortifrúti", kind: "REFRIGERATOR", sensorDeviceId: DEMO_DEVICE_ID, active } });
}
/** Série no último intervalo, 1 por minuto, terminando 1 min atrás. */
async function series(equipmentId: string, temps: number[], source: "DEVICE" | "SIMULATED") {
  const end = Date.now() - 60_000;
  await db().temperatureReading.createMany({ data: temps.map((c, i) => ({ equipmentId, source, temperatureC: c, capturedAt: new Date(end - (temps.length - 1 - i) * 60_000) })) });
}
const scaleLot = (source: "DEVICE" | "SIMULATED", kg = 6.2) =>
  service.createFromScale({ organizationId: DEMO_ORG_ID, deviceId: DEMO_DEVICE_ID, deviceCode: DEVICE_CODE, weightKg: kg, source, evidence: {} }, "ponte-mqtt");
const tokenOf = async (id: string) => (await db().donationBatch.findUniqueOrThrow({ where: { id } })).passportToken!;

test("P1 lote novo nasce com passaporte; antes da triagem a página diz 'aguardando' e não mostra temperatura", async () => {
  const { id } = await service.create({ description: "Pães do turno da manhã", weightKg: 3.5 }, "operador:ana");
  const token = await tokenOf(id);
  assert.match(token, /^[a-f0-9]{32}$/);
  const p = (await getPublicPassport(token))!;
  assert.equal(p.status, "PENDING_REVIEW");
  assert.equal(p.verdict.title, "Aguardando triagem sanitária");
  assert.equal(p.triage, null); assert.equal(p.cold, null); assert.equal(p.recipient, null);
  assert.equal(p.weighedByScale, false);
  assert.deepEqual(p.stamps.map(s => s.at !== null), [true, false, false, false]);
  assert.deepEqual(p.store, { name: "Org de teste", demo: true });
});

test("P2 jornada completa: temperatura do equipamento na origem do lote, carimbos e NADA privado no passaporte", async () => {
  const gel = await fridge();
  await series(gel.id, [3, 3.2, 3.4, 7, 7.1, 3.5, 3.3, 3.1], "DEVICE");
  await series(gel.id, [20, 21], "SIMULATED"); // nunca pode entrar no passaporte de lote real
  const { id } = await scaleLot("DEVICE");
  await service.transition(id, { status: "AVAILABLE", ...TRIAGE, originEquipmentId: gel.id, note: "nota interna sigilosa" }, "operador:ana");
  await service.transition(id, { status: "RESERVED", recipientId: DEMO_RECIPIENT_ID }, "operador:ana");
  await service.transition(id, { status: "DELIVERED", receivedBy: "Seu Jorge Recebedor" }, "operador:ana");
  const token = await tokenOf(id);
  const p = (await getPublicPassport(token))!;
  assert.equal(p.status, "DELIVERED");
  assert.equal(p.weighedByScale, true);
  assert.ok(p.stamps.every(s => s.at !== null), "4 carimbos com data");
  assert.equal(p.triage!.by, "Paula M.");
  assert.equal(p.triage!.qualification, "Nutricionista · CRN-3 12345");
  assert.equal(p.triage!.checklist.length, 4);
  assert.equal(p.triage!.foodOrigin, "Frutas, verduras ou legumes íntegros");
  assert.deepEqual(p.recipient, { name: "Receptor de teste", city: "Ribeirão Preto" });
  const c = p.cold!;
  assert.equal(c.source, "DEVICE");
  assert.equal(c.summary.samples, 8, "só as 8 leituras reais");
  assert.equal(c.summary.maxC, 7.1, "o 20 °C simulado não entra");
  assert.equal(c.summary.excursionCount, 1);
  assert.equal(c.summary.longest!.peakC, 7.1);
  assert.ok(c.summary.inRangePct! < 100 && c.summary.inRangePct! > 50);
  assert.equal(c.open, false, "lote entregue: janela fechada na entrega");
  // Privacidade: nada do que é interno ou pessoal aparece no que a página recebe.
  const json = JSON.stringify(p);
  for (const secret of ["Seu Jorge", "Recebedor", "Mendes", "nota interna", "operador", "ponte-mqtt", id, DEMO_ORG_ID, DEMO_RECIPIENT_ID, gel.id, DEMO_DEVICE_ID, token])
    assert.ok(!json.includes(secret), `vazou: ${secret}`);
  // O que o responsável viu na triagem fica na auditoria, calculado no servidor.
  const audit = await db().auditEvent.findFirstOrThrow({ where: { entityId: id, action: "AVAILABLE" } });
  const m = audit.metadata as Record<string, unknown>;
  assert.equal(m.originDeclared, true); assert.equal(m.originEquipmentId, gel.id);
  assert.equal((m.coldEvidence as Record<string, unknown>).samples, 8);
});

test("P3 lote simulado usa só a série simulada e continua carimbado", async () => {
  const gel = await fridge();
  await series(gel.id, [3, 3], "DEVICE");
  await series(gel.id, [4, 20, 4], "SIMULATED");
  const { id } = await scaleLot("SIMULATED");
  await service.transition(id, { status: "AVAILABLE", ...TRIAGE, originEquipmentId: gel.id }, "bancada");
  const p = (await getPublicPassport(await tokenOf(id)))!;
  assert.equal(p.source, "SIMULATED");
  assert.equal(p.cold!.source, "SIMULATED");
  assert.equal(p.cold!.summary.samples, 3);
  assert.equal(p.cold!.summary.maxC, 20);
  assert.equal(p.cold!.open, true, "ainda na loja: janela até agora");
});

test("P4 equipamento inativo, de outra organização ou inexistente é recusado; 'fora de equipamento' é dito como tal", async () => {
  const off = await fridge(false, "GEL-OFF");
  await db().organization.create({ data: { id: "outra-org", name: "Outra loja", sector: "Teste", city: "X", isDemo: true } });
  await db().site.create({ data: { id: "outra-unidade", organizationId: "outra-org", name: "Outra unidade" } });
  const alien = await db().coldEquipment.create({ data: { organizationId: "outra-org", siteId: "outra-unidade", code: "GEL-ALIEN", label: "Alheia", kind: "REFRIGERATOR" } });
  const { id } = await service.create({ description: "Frutas", weightKg: 2 }, "operador:ana");
  for (const eq of [off.id, alien.id, "nao-existe"])
    await assert.rejects(service.transition(id, { status: "AVAILABLE", ...TRIAGE, originEquipmentId: eq }, "operador:ana"), DonationRuleError, eq);
  await assert.rejects(service.triageEvidence(id, alien.id), DonationRuleError);
  assert.equal((await db().donationBatch.findUniqueOrThrow({ where: { id } })).status, "PENDING_REVIEW");
  await service.transition(id, { status: "AVAILABLE", ...TRIAGE, originEquipmentId: null }, "operador:ana");
  const p = (await getPublicPassport(await tokenOf(id)))!;
  assert.equal(p.cold, null); assert.equal(p.originDeclared, true);
  // Cliente antigo da API (sem o campo): não declarado, e o passaporte diz isso.
  const old = await service.create({ description: "Legumes", weightKg: 1 }, "operador:ana");
  await service.transition(old.id, { status: "AVAILABLE", ...TRIAGE }, "operador:ana");
  assert.equal((await getPublicPassport(await tokenOf(old.id)))!.originDeclared, false);
});

test("P5 lote cancelado manda não consumir e não expõe o motivo; recebedor nunca aparece", async () => {
  const { id } = await service.create({ description: "Marmitas", weightKg: 4 }, "operador:ana");
  await service.transition(id, { status: "CANCELLED", reason: "embalagem violada, avisado por Fulano" }, "operador:ana");
  const p = (await getPublicPassport(await tokenOf(id)))!;
  assert.equal(p.status, "CANCELLED");
  assert.match(p.verdict.text, /Não distribua nem consuma/);
  assert.ok(p.cancelledAt);
  const json = JSON.stringify(p);
  assert.ok(!json.includes("embalagem violada") && !json.includes("Fulano"));
});

test("P6 token inválido ou desconhecido não abre nada; lote antigo ganha passaporte uma vez, auditado", async () => {
  assert.equal(await getPublicPassport("zz"), null);
  assert.equal(await getPublicPassport("0123456789abcdef0123456789abcdef"), null);
  const { id } = await service.create({ description: "Lote antigo", weightKg: 1 }, "operador:ana");
  await db().donationBatch.update({ where: { id }, data: { passportToken: null } }); // como um lote de antes de 08/11
  const first = await service.issuePassport(id, "operador:ana");
  const again = await service.issuePassport(id, "operador:ana");
  assert.equal(first.created, true); assert.equal(again.created, false); assert.equal(again.token, first.token);
  assert.equal(await db().auditEvent.count({ where: { entityId: id, action: "PASSPORT_ISSUED" } }), 1);
  assert.ok(await getPublicPassport(first.token));
  await assert.rejects(service.issuePassport("nao-existe", "operador:ana"), /NOT_FOUND/);
});
