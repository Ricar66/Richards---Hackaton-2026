// T25: banco inalcançável NUNCA vira número de demonstração, nem com DEMO_MODE=true.
// Arquivo próprio (processo próprio no node:test): não importa o helper, aponta para uma porta sem banco.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgresql://richards:x@127.0.0.1:1/inexistente_test";
process.env.DEMO_MODE = "true";

test("T25 overview falha com DatabaseUnavailableError em vez de devolver dados de demonstração", async () => {
  const { getOverview } = await import("../../src/modules/analytics/application/get-overview");
  const { DatabaseUnavailableError } = await import("../../src/lib/db");
  await assert.rejects(getOverview(), DatabaseUnavailableError);
});

test("T25 rotas respondem 503 honesto: health e analytics", async () => {
  const health = await (await import("../../src/app/api/health/route")).GET();
  assert.equal(health.status, 503);
  assert.deepEqual({ ...(await health.json()), at: undefined }, { service: "richards", healthy: false, database: "down", at: undefined });
  const overview = await (await import("../../src/app/api/analytics/overview/route")).GET();
  assert.equal(overview.status, 503);
  assert.equal((await overview.json()).code, "DATABASE_UNAVAILABLE");
  const { NextRequest } = await import("next/server");
  const pdf = await (await import("../../src/app/api/reports/summary/route")).GET(new NextRequest("http://localhost/api/reports/summary?range=24h"));
  assert.equal(pdf.status, 503, "PDF não é gerado com números inventados");
  const dash = await (await import("../../src/app/api/analytics/dashboard/route")).GET(new NextRequest("http://localhost/api/analytics/dashboard"));
  assert.equal(dash.status, 503);
  assert.equal((await dash.json()).code, "DATABASE_UNAVAILABLE", "BI nativo também não inventa números");
});
