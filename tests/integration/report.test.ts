import { DEVICE_KEY, db, newBootId, reading, resetAndSeed } from "./helpers";
import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { getDashboard } from "../../src/modules/analytics/application/get-dashboard";
import { parseAnalyticsFilter } from "../../src/modules/analytics/domain/analytics-filter";
import { reportFigures } from "../../src/modules/analytics/domain/report-figures";
import { buildReportPdf, reportFileName } from "../../src/modules/reports/application/build-report-pdf";
import { IngestTelemetry } from "../../src/modules/monitoring/application/ingest-telemetry";
import { DonationService } from "../../src/modules/donations/application/donation-service";
import { GET } from "../../src/app/api/reports/summary/route";
import { DEMO_DEVICE_ID, DEMO_RECIPIENT_ID } from "../../src/lib/constants";
import { pageSizes, pdfText } from "./pdf-text";

beforeEach(resetAndSeed);
after(() => db().$disconnect());

async function scenario() {
  const boot = newBootId();
  await db().telemetryReading.createMany({ data: [3, 2, 1].map((h, i) => ({ deviceId: DEMO_DEVICE_ID, bootId: boot, sequence: i, source: "DEVICE" as const, flowLpm: 1.2, deltaLiters: 12.345 * (i + 1), capturedAt: new Date(Date.now() - h * 3_600_000) })) });
  const ingest = new IngestTelemetry(); const live = newBootId();
  for (const [seq, ago] of [[0, 45], [1, 30], [2, 15]]) await ingest.execute(reading(live, seq, 2.0, ago), DEVICE_KEY);
  const service = new DonationService();
  const { id } = await service.create({ description: "Pães do dia", weightKg: 7.25 }, "operador:ana");
  await service.transition(id, { status: "AVAILABLE", verifiedBy: "Paula Mendes", ...DONATION_TRIAGE }, "operador:ana");
  await service.transition(id, { status: "RESERVED", recipientId: DEMO_RECIPIENT_ID }, "operador:ana");
  await service.transition(id, { status: "DELIVERED", receivedBy: "Seu Jorge" }, "operador:ana");
}

const DONATION_TRIAGE = {
  foodOrigin: "WHOLE_PRODUCE" as const,
  reviewerQualification: "Nutricionista responsável",
  inspectionOk: true, conservationOk: true, validityOk: true, transportOk: true,
};

test("T47 PDF imprime exatamente os mesmos números do BI para o mesmo filtro", async () => {
  await scenario();
  const data = await getDashboard(parseAnalyticsFilter({ range: "24h" }));
  const text = pdfText(await buildReportPdf(data));
  for (const [label, value] of reportFigures(data)) {
    assert.ok(text.includes(label), `rótulo ausente no PDF: ${label}`);
    assert.ok(text.includes(value), `valor do BI ausente no PDF: ${label} = ${value}`);
  }
  assert.equal(data.kpis.deliveredKg, 7.3);
  assert.ok(text.includes("LEITURAS DE DISPOSITIVO"), "só leituras DEVICE: carimbo de dispositivo");
  assert.ok(text.includes("Seu Jorge") && text.includes("Pães do dia"), "entrega confirmada com quem recebeu");
  assert.ok(text.includes("Página 1 de 2") && text.includes("Página 2 de 2"));
});

test("T48 recorte simulado é carimbado e período sem leitura diz 'sem dados', não 0 L", async () => {
  await db().telemetryReading.create({ data: { deviceId: DEMO_DEVICE_ID, bootId: newBootId(), sequence: 0, source: "SIMULATED", flowLpm: 1, deltaLiters: 5, capturedAt: new Date(Date.now() - 3_600_000) } });
  const sim = pdfText(await buildReportPdf(await getDashboard(parseAnalyticsFilter({ range: "24h" }))));
  assert.ok(sim.includes("DADOS DE DEMONSTRAÇÃO (SIMULADOS)"));
  const none = await getDashboard(parseAnalyticsFilter({ range: "24h", source: "DEVICE" }));
  const text = pdfText(await buildReportPdf(none));
  assert.ok(text.includes("SEM LEITURAS NO PERÍODO"));
  assert.ok(text.includes("sem dados") && !text.includes("Volume observado\n0 L"));
});

test("T49 rota do PDF: filtro inválido → 422; válido → A4 de 2 páginas com nome datado", async () => {
  await scenario();
  const bad = await GET(new NextRequest("http://localhost/api/reports/summary?range=1y"));
  assert.equal(bad.status, 422); assert.equal((await bad.json()).code, "INVALID_FILTER");
  const ok = await GET(new NextRequest("http://localhost/api/reports/summary?range=24h&source=DEVICE"));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("Content-Type"), "application/pdf");
  assert.match(ok.headers.get("Content-Disposition") ?? "", /richards-relatorio-\d{4}-\d{2}-\d{2}\.pdf/);
  assert.equal(ok.headers.get("X-Report-Provenance"), "DEVICE");
  const bytes = new Uint8Array(await ok.arrayBuffer());
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
  assert.deepEqual(await pageSizes(bytes), [[595, 842], [595, 842]], "2 páginas A4 retrato");
  assert.equal(reportFileName(new Date("2026-11-07T01:30:00Z")), "richards-relatorio-2026-11-06.pdf", "data do arquivo no fuso de São Paulo");
});
