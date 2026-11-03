import { db, resetAndSeed } from "./helpers";
import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { DonationService } from "../../src/modules/donations/application/donation-service";
import { DonationRuleError } from "../../src/modules/donations/domain/donation-workflow";
import { getOverview } from "../../src/modules/analytics/application/get-overview";

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
  await assert.rejects(service.transition(id, "AVAILABLE", undefined, "operador:ana"), DonationRuleError);
  await assert.rejects(service.transition(id, "AVAILABLE", " x ", "operador:ana"), DonationRuleError);
  await assert.rejects(service.transition(id, "DELIVERED", "Fulano", "operador:ana"), DonationRuleError);
  assert.equal((await db().donationBatch.findUniqueOrThrow({ where: { id } })).status, "PENDING_REVIEW");
});

test("T18/T19 só entrega confirmada entra em kg entregues; trilha completa na auditoria", async () => {
  const delivered = await service.create({ description: "Hortaliças de teste", weightKg: 4.25 }, "operador:ana");
  const onlyAvailable = await service.create({ description: "Bananas de teste", weightKg: 9 }, "operador:ana");
  await service.transition(delivered.id, "AVAILABLE", "Responsável Sanitário", "operador:ana");
  await service.transition(delivered.id, "RESERVED", undefined, "operador:ana");
  await service.transition(delivered.id, "DELIVERED", undefined, "operador:bia");
  await service.transition(onlyAvailable.id, "AVAILABLE", "Responsável Sanitário", "operador:ana");
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
    service.transition(id, "AVAILABLE", "Responsável A", "operador:ana"),
    service.transition(id, "CANCELLED", undefined, "operador:bia"),
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(await db().auditEvent.count({ where: { entityId: id, action: { not: "CREATED" } } }), 1);
});
