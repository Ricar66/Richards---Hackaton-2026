import { DEVICE_KEY, db, newBootId, reading, resetAndSeed } from "./helpers";
import { after, afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { IngestTelemetry } from "../../src/modules/monitoring/application/ingest-telemetry";
import { DEMO_DEVICE_ID } from "../../src/lib/constants";
import { LIVE_CHANNEL } from "../../src/modules/realtime/domain/live-event";

/**
 * Fase 2 da auditoria final: uma leitura válida nunca pode deixar estado silenciosamente inconsistente.
 * A falha é injetada NO BANCO (gatilho temporário que derruba o INSERT/UPDATE), sem gancho de teste no código de produção.
 * O canal ao vivo é escutado de verdade (LISTEN): transação desfeita não pode ter avisado nada.
 */
const ingest = new IngestTelemetry();
const flowActive = () => db().occurrence.findMany({ where: { deviceId: DEMO_DEVICE_ID, kind: "UNUSUAL_FLOW", status: { in: ["OPEN", "ACKNOWLEDGED"] } } });
const readingsOf = (bootId: string) => db().telemetryReading.findMany({ where: { bootId }, orderBy: { sequence: "asc" } });

async function injectFailure(table: "Occurrence" | "Device" | "TelemetryReading", op: "INSERT" | "UPDATE") {
  await db().$executeRawUnsafe(`CREATE OR REPLACE FUNCTION richards_test_falha() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'falha injetada pelo teste'; END $$ LANGUAGE plpgsql`);
  await db().$executeRawUnsafe(`CREATE TRIGGER richards_test_falha BEFORE ${op} ON "${table}" FOR EACH ROW EXECUTE FUNCTION richards_test_falha()`);
}
async function clearFailures() {
  for (const t of ["Occurrence", "Device", "TelemetryReading"]) await db().$executeRawUnsafe(`DROP TRIGGER IF EXISTS richards_test_falha ON "${t}"`);
  await db().$executeRawUnsafe(`DROP FUNCTION IF EXISTS richards_test_falha()`);
}

/** Escuta o canal ao vivo pelo mesmo Postgres de teste; devolve os eventos (tipo + sequence/id) recebidos até agora. */
async function listen() {
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  const got: { type: string; sequence?: number; id?: string }[] = [];
  client.on("notification", n => { try { const e = JSON.parse(n.payload ?? "{}"); got.push({ type: e.type, sequence: e.sequence, id: e.id }); } catch { /* ignora */ } });
  await client.query(`LISTEN ${LIVE_CHANNEL}`);
  return { got, settle: () => new Promise(r => setTimeout(r, 300)), close: () => client.end() };
}

beforeEach(async () => { await clearFailures(); await resetAndSeed(); });
afterEach(clearFailures);
after(() => db().$disconnect());

test("F2.1 a ocorrência falha ao abrir: a leitura é desfeita junto, nada é avisado, e a retentativa grava e abre", async () => {
  const boot = newBootId();
  for (const [seq, ago] of [[0, 45], [1, 30]]) await ingest.execute(reading(boot, seq, 2.0, ago), DEVICE_KEY);
  const live = await listen();
  try {
    await injectFailure("Occurrence", "INSERT");
    const trigger = reading(boot, 2, 2.0, 15); // fecha 30 s acima do limiar: a regra decide abrir
    await assert.rejects(ingest.execute(trigger, DEVICE_KEY), /falha injetada/);
    await live.settle();
    assert.deepEqual((await readingsOf(boot)).map(r => r.sequence), [0, 1], "a leitura do gatilho NÃO pode ficar gravada sem a ocorrência");
    assert.equal((await flowActive()).length, 0);
    assert.equal(live.got.filter(e => e.sequence === 2 || e.type === "occurrence.opened").length, 0, "transação desfeita não avisa o telão");

    await clearFailures();
    const retry = await ingest.execute(trigger, DEVICE_KEY); // retentativa do firmware: MESMO bootId e sequence
    assert.equal(retry.duplicate, false, "a retentativa não é duplicata: nada tinha sido confirmado");
    assert.equal(retry.alerted, true);
    const [occ] = await flowActive();
    assert.equal(retry.occurrenceId, occ.id);
    await live.settle();
    assert.ok(live.got.some(e => e.type === "reading.created" && e.sequence === 2), "leitura confirmada é avisada");
    assert.ok(live.got.some(e => e.type === "occurrence.opened" && e.id === occ.id), "ocorrência confirmada é avisada");
    // E uma segunda retentativa (resposta perdida) é duplicata de verdade: não reabre nem soma.
    const again = await ingest.execute(trigger, DEVICE_KEY);
    assert.equal(again.duplicate, true);
    assert.equal((await flowActive()).length, 1);
    assert.equal((await readingsOf(boot)).length, 3);
  } finally { await live.close(); }
});

test("F2.2 falha logo depois de a leitura entrar (último contato): tudo é desfeito e a retentativa grava uma vez", async () => {
  const boot = newBootId();
  await injectFailure("Device", "UPDATE");
  await assert.rejects(ingest.execute(reading(boot, 0, 0.5), DEVICE_KEY), /falha injetada/);
  assert.equal((await readingsOf(boot)).length, 0, "leitura sem o resto da transação não fica");
  await clearFailures();
  const ok = await ingest.execute(reading(boot, 0, 0.5), DEVICE_KEY);
  assert.equal(ok.duplicate, false);
  assert.equal((await readingsOf(boot)).length, 1);
  assert.ok((await db().device.findUniqueOrThrow({ where: { id: DEMO_DEVICE_ID } })).lastSeenAt);
});

test("F2.3 banco recusando a gravação da leitura: nada gravado, nada avisado; depois grava normalmente", async () => {
  const boot = newBootId();
  const live = await listen();
  try {
    await injectFailure("TelemetryReading", "INSERT");
    await assert.rejects(ingest.execute(reading(boot, 0, 0.5), DEVICE_KEY));
    await live.settle();
    assert.equal(live.got.length, 0);
    await clearFailures();
    assert.equal((await ingest.execute(reading(boot, 0, 0.5), DEVICE_KEY)).duplicate, false);
    await live.settle();
    assert.deepEqual(live.got.map(e => e.type), ["reading.created"]);
  } finally { await live.close(); }
});

test("F2.4 concorrência: cópias idênticas do gatilho + leituras novas ao mesmo tempo = cada leitura uma vez e UMA ocorrência", async () => {
  const boot = newBootId();
  for (const [seq, ago] of [[0, 45], [1, 30]]) await ingest.execute(reading(boot, seq, 2.0, ago), DEVICE_KEY);
  const trigger = reading(boot, 2, 2.0, 15);
  const burst = await Promise.allSettled([
    ...Array.from({ length: 8 }, () => ingest.execute(trigger, DEVICE_KEY)),
    ...Array.from({ length: 6 }, (_, i) => ingest.execute(reading(boot, 10 + i, 2.0, 0), DEVICE_KEY)),
  ]);
  assert.equal(burst.filter(r => r.status === "rejected").length, 0, "nenhuma requisição falha por corrida");
  const ok = burst.map(r => (r as PromiseFulfilledResult<{ duplicate: boolean; alerted: boolean }>).value);
  assert.equal(ok.slice(0, 8).filter(r => !r.duplicate).length, 1, "o gatilho entra uma vez só");
  assert.equal(ok.filter(r => r.alerted).length, 1, "exatamente uma requisição abriu a ocorrência");
  assert.equal((await flowActive()).length, 1, "regra 5: uma ativa");
  assert.equal((await readingsOf(boot)).length, 2 + 1 + 6);
});

test("F2.5 sem o gatilho de falha, a ocorrência e a leitura que a disparou nascem juntas (mesmo COMMIT)", async () => {
  const boot = newBootId();
  for (const [seq, ago] of [[0, 45], [1, 30], [2, 15]]) await ingest.execute(reading(boot, seq, 2.0, ago), DEVICE_KEY);
  const [occ] = await flowActive();
  const audit = await db().auditEvent.findFirstOrThrow({ where: { entityId: occ.id } });
  const trig = (audit.metadata as { trigger?: { bootId: string; sequence: number } }).trigger;
  assert.deepEqual(trig, { bootId: boot, sequence: 2 });
  assert.ok(await db().telemetryReading.findFirst({ where: { bootId: boot, sequence: 2 } }), "a leitura gatilho citada na auditoria existe");
});
