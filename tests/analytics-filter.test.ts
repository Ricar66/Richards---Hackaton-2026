import { test } from "node:test";
import assert from "node:assert/strict";
import { FilterError, bucketForSpan, filterToQuery, floorToBucket, parseAnalyticsFilter, tzOffsetMs } from "../src/modules/analytics/domain/analytics-filter";

const now = new Date("2026-11-07T15:37:12Z"); // 12:37 em São Paulo

test("padrão é 7 dias, intervalos de 1 h, todas as origens", () => {
  const f = parseAnalyticsFilter({}, now);
  assert.equal(f.range, "7d"); assert.equal(f.bucket, "1h"); assert.equal(f.source, "ALL");
  assert.equal(f.to.toISOString(), now.toISOString());
  assert.equal(f.from.toISOString(), "2026-10-31T15:00:00.000Z", "início alinhado na hora cheia");
});

test("24h usa 15 min e 30d usa dias de São Paulo (meia-noite local = 03:00 UTC)", () => {
  const d = parseAnalyticsFilter({ range: "24h" }, now);
  assert.equal(d.bucket, "15m"); assert.equal(d.from.toISOString(), "2026-11-06T15:30:00.000Z");
  const m = parseAnalyticsFilter(new URLSearchParams("range=30d"), now);
  assert.equal(m.bucket, "1d"); assert.equal(m.from.toISOString(), "2026-10-08T03:00:00.000Z");
});

test("dia é contado no fuso de São Paulo, não em UTC", () => {
  assert.equal(tzOffsetMs(now), -3 * 3_600_000);
  // 01:30 UTC do dia 7 ainda é dia 6 em São Paulo (22:30).
  assert.equal(floorToBucket(new Date("2026-11-07T01:30:00Z"), "1d").toISOString(), "2026-11-06T03:00:00.000Z");
  assert.equal(floorToBucket(new Date("2026-11-07T01:44:59Z"), "15m").toISOString(), "2026-11-07T01:30:00.000Z");
});

test("período personalizado: corta o futuro, recusa invertido, longo ou incompleto", () => {
  const f = parseAnalyticsFilter({ from: "2026-11-05T00:00:00-03:00", to: "2026-11-09T00:00:00-03:00" }, now);
  assert.equal(f.range, "custom"); assert.equal(f.to.toISOString(), now.toISOString(), "fim no futuro vira agora");
  assert.equal(f.bucket, "1h");
  assert.throws(() => parseAnalyticsFilter({ from: "2026-11-05T00:00:00Z" }, now), FilterError);
  assert.throws(() => parseAnalyticsFilter({ from: "2026-11-06T00:00:00Z", to: "2026-11-05T00:00:00Z" }, now), FilterError);
  assert.throws(() => parseAnalyticsFilter({ from: "2026-01-01T00:00:00Z", to: "2026-11-05T00:00:00Z" }, now), /92 dias/);
  assert.throws(() => parseAnalyticsFilter({ from: "2026-12-01T00:00:00Z", to: "2026-12-02T00:00:00Z" }, now), /ainda não começou/);
  assert.throws(() => parseAnalyticsFilter({ from: "ontem", to: "hoje" }, now), FilterError);
});

test("origem, intervalo e ids malformados são recusados (sem consulta ao banco)", () => {
  assert.throws(() => parseAnalyticsFilter({ source: "FAKE" }, now), FilterError);
  assert.throws(() => parseAnalyticsFilter({ range: "1y" }, now), FilterError);
  assert.throws(() => parseAnalyticsFilter({ deviceId: "x' OR 1=1 --" }, now), FilterError);
  assert.equal(parseAnalyticsFilter({ source: "device" }, now).source, "DEVICE");
});

test("filtro vira query de URL estável (ida e volta)", () => {
  const f = parseAnalyticsFilter({ range: "24h", deviceId: "richards-flow-01", source: "SIMULATED" }, now);
  assert.equal(filterToQuery(f).toString(), "range=24h&deviceId=richards-flow-01&source=SIMULATED");
  assert.equal(filterToQuery(parseAnalyticsFilter({}, now)).toString(), "", "padrão não polui a URL");
  const custom = parseAnalyticsFilter({ from: "2026-11-01T03:00:00Z", to: "2026-11-02T03:00:00Z" }, now);
  const again = parseAnalyticsFilter(filterToQuery(custom), now);
  assert.equal(again.from.toISOString(), custom.from.toISOString()); assert.equal(again.to.toISOString(), custom.to.toISOString());
  assert.equal(bucketForSpan(40 * 86_400_000), "1d");
});
