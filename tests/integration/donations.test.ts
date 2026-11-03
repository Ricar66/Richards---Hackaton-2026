import { db, resetAndSeed } from "./helpers";
import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { DonationService } from "../../src/modules/donations/application/donation-service";
import { DonationRuleError } from "../../src/modules/donations/domain/donation-workflow";
import { getOverview } from "../../src/modules/analytics/application/get-overview";
import { DEMO_RECIPIENT_ID } from "../../src/lib/constants";

const service = new DonationService();
beforeEach(resetAndSeed);
after(() => db().$disconnect());

test("T15 lote novo nasce PENDING_REVIEW, origem MANUAL e auditado", async () => {
  const { id, status } = await service.create({ description: "Frutas de teste", weightKg: 3.5 }, "operador:ana");
  assert.equal(status, "PENDING_REVIEW");
  assert.equal((await db().donationBatch.findUniqueOrThrow({ where: { id } })).source, "MANUAL");
  assert.equal(await db().auditEvent.count({ where: { entityId: id, action: "CREATED" } }), 1);
});

test("T16 disponibilizar sem verificação humana é recusado", async () => {
  const { id } = await service.create({ description: "Pães de teste", weightKg: 2 }, "operador:ana");
  await assert.rejects(service.transition(id, { status: "AVAILABLE" }, "operador:ana"), DonationRuleError);
  await assert.rejects(service.transition(id, { status: "AVAILABLE", verifiedBy: " x " }, "operador:ana"), DonationRuleError);
  await assert.rejects(service.transition(id, { status: "DELIVERED", receivedBy: "Fulano" }, "operador:ana"), DonationRuleError);
  assert.equal((await db().donationBatch.findUniqueOrThrow({ where: { id } })).status, "PENDING_REVIEW");
});

test("T18/T19 só entrega confirmada entra em kg entregues; trilha completa na auditoria", async () => {
  const delivered = await service.create({ description: "Hortaliças de teste", weightKg: 4.25 }, "operador:ana");
  const onlyAvailable = await service.create({ description: "Bananas de teste", weightKg: 9 }, "operador:ana");
  await service.transition(delivered.id, { status: "AVAILABLE", verifiedBy: "Responsável Sanitário" }, "operador:ana");
  await service.transition(delivered.id, { status: "RESERVED", recipientId: DEMO_RECIPIENT_ID }, "operador:ana");
  await service.transition(delivered.id, { status: "DELIVERED", receivedBy: "Carla (instituição)" }, "operador:bia");
  await service.transition(onlyAvailable.id, { status: "AVAILABLE", verifiedBy: "Responsável Sanitário" }, "operador:ana");
  const batch = await db().donationBatch.findUniqueOrThrow({ where: { id: delivered.id } });
  assert.equal(batch.safetyVerifiedBy, "Responsável Sanitário");
  assert.ok(batch.recipientId && batch.receivedAt);
  assert.equal((await getOverview()).metrics.deliveredKg, 4.3, "4,25 kg exibido com 1 casa; o lote só AVAILABLE não conta");
  const audit = await db().auditEvent.findMany({ where: { entityId: delivered.id }, orderBy: { at: "asc" } });
  assert.deepEqual(audit.map(a => a.action), ["CREATED", "AVAILABLE", "RESERVED", "DELIVERED"]);
});

test("transições simultâneas do mesmo lote: só uma vence", async () => {
  const { id } = await service.create({ description: "Leite de teste", weightKg: 1 }, "operador:ana");
  const results = await Promise.allSettled([
    service.transition(id, { status: "AVAILABLE", verifiedBy: "Responsável A" }, "operador:ana"),
    service.transition(id, { status: "CANCELLED", reason: "Lote vencido na triagem" }, "operador:bia"),
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(await db().auditEvent.count({ where: { entityId: id, action: { not: "CREATED" } } }), 1);
});

test("T45 reservar exige instituição ativa escolhida; entregar exige quem recebeu; cancelar exige motivo", async () => {
  const { id } = await service.create({ description: "Arroz de teste", weightKg: 5 }, "operador:ana");
  await service.transition(id, { status: "AVAILABLE", verifiedBy: "Responsável Sanitário" }, "operador:ana");
  await assert.rejects(service.transition(id, { status: "RESERVED" }, "operador:ana"), /instituição receptora/);
  await assert.rejects(service.transition(id, { status: "RESERVED", recipientId: "nao-existe" }, "operador:ana"), /inexistente ou inativa/);
  await db().recipientOrganization.create({ data: { id: "inativa", name: "Inativa", city: "RP", active: false } });
  await assert.rejects(service.transition(id, { status: "RESERVED", recipientId: "inativa" }, "operador:ana"), /inexistente ou inativa/);
  await service.transition(id, { status: "RESERVED", recipientId: DEMO_RECIPIENT_ID }, "operador:ana");
  await assert.rejects(service.transition(id, { status: "DELIVERED", receivedBy: " " }, "operador:ana"), /quem recebeu/);
  await service.transition(id, { status: "DELIVERED", receivedBy: "Carla Souza", note: "conferido 5 kg" }, "operador:bia");
  const b = await db().donationBatch.findUniqueOrThrow({ where: { id } });
  assert.equal(b.receivedBy, "Carla Souza"); assert.equal(b.recipientId, DEMO_RECIPIENT_ID);
  const other = await service.create({ description: "Pão de teste", weightKg: 1 }, "operador:ana");
  await assert.rejects(service.transition(other.id, { status: "CANCELLED", reason: "x" }, "operador:ana"), /motivo/);
  await service.transition(other.id, { status: "CANCELLED", reason: "Embalagem violada" }, "operador:ana");
  assert.equal((await db().donationBatch.findUniqueOrThrow({ where: { id: other.id } })).cancelReason, "Embalagem violada");
});

test("T46 detalhe do lote reconstrói a trilha com quem fez cada etapa", async () => {
  const { id } = await service.create({ description: "Legumes de teste", weightKg: 2.5 }, "operador:ana");
  await service.transition(id, { status: "AVAILABLE", verifiedBy: "Dra. Paula" }, "operador:ana");
  await service.transition(id, { status: "RESERVED", recipientId: DEMO_RECIPIENT_ID }, "operador:bia");
  await service.transition(id, { status: "DELIVERED", receivedBy: "Seu Jorge" }, "operador:bia");
  const d = await service.detail(id);
  assert.deepEqual(d.timeline.map(t => [t.action, t.actor]), [["CREATED", "operador:ana"], ["AVAILABLE", "operador:ana"], ["RESERVED", "operador:bia"], ["DELIVERED", "operador:bia"]]);
  assert.match(d.timeline[1].detail ?? "", /Dra\. Paula/);
  assert.match(d.timeline[2].detail ?? "", /Receptor de teste/);
  assert.match(d.timeline[3].detail ?? "", /Seu Jorge/);
  assert.equal(d.recipient?.id, DEMO_RECIPIENT_ID);
  await assert.rejects(service.detail("nao-existe"), /NOT_FOUND/);
});
