import { DEVICE_CODE, db, resetAndSeed } from "./helpers";
import { after, beforeEach, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { cenario, ensaiar, type CenarioNome } from "../../src/iot/bancada-virtual";
import { loadMqttConfig, MQTT_SENSORS, type MqttSensor } from "../../src/iot/mqtt-payload";
import {
  acharDispositivo, avisoVazaoAlheia, bloqueios, checar, conferirVazaoAlheia, MOTIVO_PREPARO, NOTA_PREPARO, pendencias, preparar, recusaDoPalco, SessaoBancada, soltar,
  TRAVA, travar, vazaoDeOutraFonte,
} from "../../src/iot/run-bancada-virtual";
import { DonationService } from "../../src/modules/donations/application/donation-service";
import { openDeviceOccurrence } from "../../src/modules/monitoring/application/open-device-occurrence";
import { OccurrenceService } from "../../src/modules/monitoring/application/occurrence-service";
import { DEMO_DEVICE_ID, DEMO_ORG_ID, DEMO_SITE_ID } from "../../src/lib/constants";

beforeEach(resetAndSeed);
after(() => db().$disconnect());

const cfg = () => loadMqttConfig({}); // regras padrão: o .env local não muda os horários do teste
/** Sessão com relógio controlado: cada leitura anda 2 s, começando ~7 min atrás. */
function sessao(nome: CenarioNome, sensores: readonly MqttSensor[] = MQTT_SENSORS) {
  let clock = Date.now() - 420_000;
  const s = new SessaoBancada(cenario(nome), { dispositivo: DEVICE_CODE, sensores: new Set(sensores), cfg: cfg(), relogio: () => clock });
  const passo = async () => { clock += 2_000; return s.passo(); };
  return { s, passo };
}
const audit = async (entityId: string) => {
  const [a] = await db().auditEvent.findMany({ where: { entityId, action: "CREATED" } });
  return a.metadata as Record<string, unknown>;
};

test("bancada virtual · palco reagindo ao operador: 1 fluxo, 1 temperatura e 1 lote de 6,0 kg, tudo SIMULATED e com canal bancada-virtual", async () => {
  const { s, passo } = sessao("palco");
  const occ = new OccurrenceService();
  while (!s.terminou()) {
    const t = s.t;
    await passo();
    if (t === 36) await occ.transition(s.abertas.fluxo!, "ACKNOWLEDGED", "", "operador:teste");
    if (t === 50) await occ.transition(s.abertas.fluxo!, "RESOLVED", "Simulação: fluxo encerrado na bancada virtual", "operador:teste");
  }
  assert.deepEqual(s.marcos, { fluxoAberta: 30, fluxoAssumida: 38, temperaturaAberta: 48, fluxoEncerrada: 52, lote: 60 },
    "fluxo pela regra real em T+30; a vazão fecha na leitura seguinte ao Assumir; a caixa entra ao Resolver e o lote sai 8 s depois");
  assert.deepEqual(s.contagem, { gravadas: 91, descartadas: 0, perdidas: 0 });

  const readings = await db().telemetryReading.findMany({ where: { deviceId: DEMO_DEVICE_ID }, orderBy: { sequence: "asc" } });
  assert.equal(readings.length, 91);
  assert.ok(readings.every(r => r.source === "SIMULATED" && r.bootId === s.bootId), "toda leitura da bancada virtual é SIMULATED, na sessão própria");
  assert.equal(readings.filter(r => Number(r.flowLpm) >= 1.5).length, 19, "vazão aberta de T+0 a T+36 (19 leituras), fechada depois de Assumir");

  const occs = await db().occurrence.findMany({ where: { deviceId: DEMO_DEVICE_ID }, orderBy: { openedAt: "asc" } });
  assert.deepEqual(occs.map(o => [o.kind, o.source, o.status]), [["UNUSUAL_FLOW", "SIMULATED", "RESOLVED"], ["TEMPERATURE_EXCURSION", "SIMULATED", "OPEN"]], "uma de cada tipo (regra 5)");
  for (const o of occs) {
    const meta = await audit(o.id);
    assert.deepEqual([meta.channel, meta.source, meta.actor], ["bancada-virtual", "SIMULATED", `simulador:${DEVICE_CODE}`]);
    const [created] = await db().occurrenceEvent.findMany({ where: { occurrenceId: o.id, action: "CREATED" } });
    assert.match(created.note ?? "", /SIMULADAS.*\(bancada virtual\)$/, "a timeline diz por onde a leitura entrou");
  }

  const lots = await db().donationBatch.findMany();
  assert.equal(lots.length, 1);
  assert.deepEqual([lots[0].id, Number(lots[0].weightKg), lots[0].status, lots[0].source], [s.abertas.lote, 6, "PENDING_REVIEW", "SIMULATED"], "regra 6: nunca nasce disponível; peso conservador");
  const meta = await audit(lots[0].id);
  assert.deepEqual([meta.channel, meta.deviceCode, meta.actor], ["bancada-virtual", DEVICE_CODE, `simulador:${DEVICE_CODE}`]);
});

test("bancada virtual · palco sem ninguém no BI segue sozinho pelos limites e bate com o ensaio impresso", async () => {
  const { s, passo } = sessao("palco");
  while (!s.terminou()) await passo();
  const previsto = Object.fromEntries(ensaiar(cenario("palco")).map(d => [d.tipo, d.t]));
  assert.deepEqual([s.marcos.fluxoAberta, s.marcos.temperaturaAberta, s.marcos.lote], [previsto.UNUSUAL_FLOW, previsto.TEMPERATURE_EXCURSION, previsto.LOTE]);
  assert.deepEqual([s.marcos.fluxoAssumida, s.marcos.fluxoEncerrada], [undefined, undefined]);
  assert.equal(await db().telemetryReading.count({ where: { flowLpm: { gte: 1.5 } } }), 28, "vazão de T+0 a T+54: fecha sozinha em T+55");
  assert.equal(await db().occurrence.count({ where: { status: "OPEN" } }), 2, "as duas ficam abertas para o operador");
  assert.equal(await db().donationBatch.count({ where: { status: "PENDING_REVIEW", source: "SIMULATED" } }), 1);
});

test("bancada virtual · --sensores filtra o payload; pico não abre ocorrência", async () => {
  const { s, passo } = sessao("pico", ["VAZAO"]);
  while (!s.terminou()) await passo();
  assert.equal(await db().occurrence.count(), 0, "uso curto não é fluxo contínuo");
  assert.equal(await db().donationBatch.count(), 0);
  assert.equal(s.contagem.gravadas, 61);
});

test("bancada virtual · --checar só lê; --preparar encerra só o SIMULADO, com nota e auditoria, sem apagar; registro real fica intacto", async () => {
  // Pendências de ensaio: fluxo SIMULATED aberto, temperatura do sensor real assumida, lote da balança pendente e um alerta de outro tipo.
  const base = { organizationId: DEMO_ORG_ID, siteId: DEMO_SITE_ID, deviceId: DEMO_DEVICE_ID, title: "ensaio", description: "ensaio", eventNote: "ensaio", evidence: {} };
  const fluxo = await openDeviceOccurrence({ ...base, kind: "UNUSUAL_FLOW", severity: "HIGH", source: "SIMULATED", actor: "simulador:teste" });
  const temp = await openDeviceOccurrence({ ...base, kind: "TEMPERATURE_EXCURSION", severity: "MEDIUM", source: "DEVICE", actor: "dispositivo:teste" });
  await new OccurrenceService().transition(temp.occurrenceId, "ACKNOWLEDGED", "", "operador:teste");
  const offline = await db().occurrence.create({ data: { organizationId: DEMO_ORG_ID, siteId: DEMO_SITE_ID, deviceId: DEMO_DEVICE_ID, kind: "DEVICE_OFFLINE", severity: "LOW", status: "OPEN", source: "SIMULATED", title: "ensaio", description: "offline" } });
  const lote = await new DonationService().createFromScale({ organizationId: DEMO_ORG_ID, deviceId: DEMO_DEVICE_ID, deviceCode: DEVICE_CODE, weightKg: 6, source: "SIMULATED", evidence: { channel: "bancada-virtual" } }, "simulador:teste");

  const contar = async () => Promise.all([db().auditEvent.count(), db().occurrence.count(), db().occurrenceEvent.count(), db().donationBatch.count(), db().telemetryReading.count()]);
  const antes = await contar();
  const itens = await checar(DEVICE_CODE, cfg(), { DEMO_MODE: "true" });
  assert.deepEqual(await contar(), antes, "--checar não grava nada");
  const falhas = itens.filter(i => i.nivel === "FALHA").map(i => i.texto).join("\n");
  assert.match(falhas, /UNUSUAL_FLOW.*bloqueia/);
  // A temperatura do sensor REAL (assumida) não bloqueia a bancada simulada (regra 5 por origem): vira aviso.
  assert.doesNotMatch(falhas, /TEMPERATURE_EXCURSION/);
  const tempItem = itens.find(i => i.texto.startsWith("TEMPERATURE_EXCURSION"))!;
  assert.equal(tempItem.nivel, "AVISO");
  assert.match(tempItem.texto, /REAL ativa.*NÃO é tocada pela preparação/);
  assert.match(falhas, /lote SIMULADO da balança aguardando verificação/);
  assert.match(falhas, /nenhum lote RESERVED/);
  assert.match(itens.find(i => i.texto.startsWith("DEVICE_OFFLINE"))!.texto, /não bloqueia/);
  assert.match(itens.find(i => i.texto.startsWith("banco "))!.texto, /^banco \w+_test$/, "mostra o nome do banco, nunca a URL");
  assert.match((await checar(DEVICE_CODE, cfg(), {})).map(i => `${i.nivel} ${i.texto}`).join("\n"), /FALHA DEMO_MODE/);

  const d = await acharDispositivo(DEVICE_CODE, cfg());
  assert.equal(bloqueios(cenario("palco"), new Set(MQTT_SENSORS), await pendencias(d)).length, 2, "fluxo e balança SIMULADOS bloqueiam; a temperatura REAL não");
  assert.equal(bloqueios(cenario("palco"), new Set<MqttSensor>(["PESO"]), await pendencias(d)).length, 1, "só a balança simulada: só o lote bloqueia");

  const linhas = await preparar(d, "preparacao:teste");
  assert.equal(linhas.length, 2, linhas.join("\n"));
  const depois = await contar();
  assert.deepEqual([depois[1], depois[3], depois[4]], [antes[1], antes[3], antes[4]], "nada apagado: mesmas ocorrências, lotes e leituras");
  assert.equal(depois[0], antes[0] + 2, "uma auditoria por mudança");
  const [f, tt, off, l] = await Promise.all([
    db().occurrence.findUniqueOrThrow({ where: { id: fluxo.occurrenceId } }), db().occurrence.findUniqueOrThrow({ where: { id: temp.occurrenceId } }),
    db().occurrence.findUniqueOrThrow({ where: { id: offline.id } }), db().donationBatch.findUniqueOrThrow({ where: { id: lote.id } }),
  ]);
  assert.deepEqual([f.status, f.verificationNote], ["DISMISSED", NOTA_PREPARO]);
  assert.equal(tt.status, "ACKNOWLEDGED", "registro REAL não é mexido para facilitar a demonstração");
  assert.equal(await db().occurrenceEvent.count({ where: { occurrenceId: tt.id, action: "DISMISSED" } }), 0);
  assert.equal(off.status, "OPEN", "o que não bloqueia o palco não é tocado");
  assert.deepEqual([l.status, l.cancelReason], ["CANCELLED", MOTIVO_PREPARO]);
  const [ev] = await db().occurrenceEvent.findMany({ where: { occurrenceId: f.id, action: "DISMISSED" } });
  assert.equal(ev.actor, "preparacao:teste");
  assert.deepEqual(bloqueios(cenario("palco"), new Set(MQTT_SENSORS), await pendencias(d)), []);
});

test("bancada virtual · capturedAt é o instante agendado da leitura, nunca no futuro nem mais de 1 s atrás do envio", async () => {
  const agora = Date.now() - 60_000;
  const s = new SessaoBancada(cenario("ocioso"), { dispositivo: DEVICE_CODE, sensores: new Set<MqttSensor>(["VAZAO"]), cfg: cfg(), relogio: () => agora });
  await s.passo(agora - 7); // alguns ms de atraso do banco: vale o agendado
  await s.passo(agora + 500); // agendado no futuro: vale a hora real
  await s.passo(agora - 1_500); // atraso grande: vale a hora real (não esconde o atraso)
  const rows = await db().telemetryReading.findMany({ orderBy: { sequence: "asc" } });
  assert.deepEqual(rows.map(r => r.capturedAt.getTime() - agora), [-7, 0, 0]);
});

test("bancada virtual · trava de sessão: uma instância por banco", async () => {
  const a = await travar();
  assert.ok(a, "a primeira pega a trava");
  assert.equal(await travar(), null, "a segunda é recusada");
  assert.match((await checar(DEVICE_CODE, cfg(), { DEMO_MODE: "true" })).map(i => i.texto).join("\n"), /outra bancada virtual .* está rodando/);
  await soltar(a!);
  const b = await travar();
  assert.ok(b, "liberada no encerramento");
  await soltar(b!);
});

test("bancada virtual · Resolver direto de OPEN entre a leitura do status e a gravação: a reaberta não troca a do roteiro e a vazão fecha", async () => {
  const { s, passo } = sessao("palco");
  while (s.marcos.fluxoAberta === undefined) await passo();
  const original = s.abertas.fluxo!;
  assert.equal(s.marcos.fluxoAberta, 30);
  // A leitura do status desta leitura já passou (viu OPEN); o operador clica em Resolver antes de a leitura ser gravada.
  const observar = s.observar;
  s.observar = async () => [];
  await new OccurrenceService().transition(original, "RESOLVED", "Simulação: fluxo encerrado na bancada virtual", "operador:teste");
  const linhas = (await passo()).join("\n");
  s.observar = observar;
  const occs = () => db().occurrence.findMany({ where: { deviceId: DEMO_DEVICE_ID }, orderBy: { openedAt: "asc" }, select: { id: true, kind: true, status: true, source: true } });
  const [, nova] = await occs();
  assert.ok(nova && nova.kind === "UNUSUAL_FLOW" && nova.status === "OPEN", "a regra (ainda 2,4 L/min por 32 s) abriu outra: a regra 5 permite, a anterior já não está ativa");
  assert.ok(linhas.includes(`T+32 OCORRÊNCIA de fluxo REABERTA (${nova.id}) [SIMULATED]: a ${original} foi encerrada`), linhas);
  assert.equal(s.abertas.fluxo, original, "a do roteiro não é perdida");
  assert.deepEqual(s.reabertas.map(r => [r.qual, r.id, r.t]), [["fluxo", nova.id, 32]]);
  while (!s.terminou()) await passo();
  assert.deepEqual(s.marcos, { fluxoAberta: 30, fluxoAssumida: 34, fluxoEncerrada: 34, lote: 42, temperaturaAberta: 48 },
    "tratada como fluxo encerrado: a vazão fecha e a caixa entra em T+34 (lote 8 s depois); a temperatura não é marcada como tratada");
  assert.equal(await db().telemetryReading.count({ where: { flowLpm: { gte: 1.5 } } }), 17, "vazão de T+0 a T+32, fechada daí em diante (antes seguia até T+54)");
  assert.deepEqual((await occs()).map(o => [o.id === original ? "roteiro" : o.kind === "UNUSUAL_FLOW" ? "reaberta" : o.kind, o.status, o.source]),
    [["roteiro", "RESOLVED", "SIMULATED"], ["reaberta", "OPEN", "SIMULATED"], ["TEMPERATURE_EXCURSION", "OPEN", "SIMULATED"]], "nada apagado; tudo SIMULATED");
});

test("bancada virtual · vazão de outra fonte no dispositivo (ponte ligada): FALHA com --sensores VAZAO e o palco recusa; TEMP/PESO seguem", async () => {
  const d = await acharDispositivo(DEVICE_CODE, cfg());
  const agora = Date.now();
  const leitura = (bootId: string, sequence: number, source: "DEVICE" | "SIMULATED", flowLpm: number, msAtras: number) =>
    ({ deviceId: d.id, bootId, sequence, source, flowLpm, deltaLiters: (flowLpm * 2) / 60, capturedAt: new Date(agora - msAtras) });
  const item = async (sensores?: readonly MqttSensor[]) =>
    (await checar(DEVICE_CODE, cfg(), { DEMO_MODE: "true" }, sensores && new Set(sensores))).find(i => /vazão de outra fonte/.test(i.texto))!;
  assert.deepEqual(await vazaoDeOutraFonte(d, agora), { leituras: 0, sessoes: [], idadeS: null });
  assert.equal((await item(["VAZAO"])).nivel, "OK", "sem outra fonte gravando, a bancada pode simular a vazão");
  await db().telemetryReading.createMany({ data: [
    leitura("mqtt-1a2b3c4d", 0, "SIMULATED", 0, 3_000), leitura("mqtt-1a2b3c4d", 1, "SIMULATED", 0, 1_000), // potenciômetro pela ponte
    leitura("bancada-1", 0, "SIMULATED", 2.4, 2_000),   // sessão de bancada virtual: não conta
    leitura("esp32-boot", 0, "DEVICE", 0, 60_000),      // fora da janela de 10 s
  ] });
  const outra = await vazaoDeOutraFonte(d, agora);
  assert.deepEqual(outra, { leituras: 2, sessoes: ["mqtt-1a2b3c4d"], idadeS: 1 }, "idade da mais nova, para o operador saber se a ponte acabou de parar");
  const aviso = avisoVazaoAlheia(outra)!;
  assert.match(aviso, /^2 leitura\(s\) de vazão de outra fonte .*a mais nova há 1 s .*mqtt-1a2b3c4d.*Pare a ponte pnpm mqtt ou desligue a vazão no firmware; se você acabou de parar a ponte, espere 10 s e rode de novo$/);
  assert.equal((await item(["VAZAO"])).nivel, "FALHA");
  assert.equal((await item(MQTT_SENSORS)).nivel, "FALHA", "padrão da bancada: os três, inclusive VAZAO");
  assert.equal((await item()).nivel, "AVISO", "sem --sensores: o pré-voo também serve para a bancada física");
  assert.equal((await item(["TEMP", "PESO"])).nivel, "OK", "sem VAZAO a bancada virtual não grava vazão");
  const recusa = recusaDoPalco([], aviso);
  assert.ok(recusa.startsWith("o palco não pode começar:\n  - 2 leitura"), recusa);
  assert.ok(!recusa.includes("--preparar"), "parar a ponte não se resolve com --preparar");
  assert.ok(recusaDoPalco(["x"], null).endsWith("  - x\n  Rode: pnpm bancada --preparar"), "mensagem das pendências mantida");
});

/**
 * Segundo banco de teste PRÓPRIO desta execução, com o nome derivado do banco de teste atual (richards_x_test →
 * richards_x_trava_test): nunca o `postgres` compartilhado, onde outra execução deste arquivo (outra frente, ou o
 * verificador no banco dele) disputaria a mesma trava. Cria se não existir, como o test-db-prepare; vazio, nunca apagado.
 */
async function outroBancoDeTeste(): Promise<string> {
  const atual = new URL(process.env.DATABASE_URL!);
  const nome = `${atual.pathname.slice(1).replace(/_test$/, "")}_trava_test`;
  assert.match(nome, /^[a-z0-9_]{1,58}_test$/, "nome derivado válido e terminado em _test");
  const admin = new URL(atual);
  admin.pathname = "/postgres"; // só para o CREATE DATABASE (o mesmo do test-db-prepare); a trava fica no banco novo
  admin.search = "";
  const c = new pg.Client({ connectionString: admin.toString(), connectionTimeoutMillis: 5_000 });
  await c.connect();
  try {
    const existe = await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [nome]);
    // 42P04: outra execução criou no meio tempo.
    if (!existe.rowCount) await c.query(`CREATE DATABASE "${nome}"`).catch((e: { code?: string }) => { if (e.code !== "42P04") throw e; });
  } finally {
    await c.end();
  }
  const outro = new URL(atual);
  outro.pathname = `/${nome}`;
  outro.search = "";
  return outro.toString();
}
/** Tenta a trava algumas vezes com espera curta: outra execução pode estar com ela por instantes. */
async function tentarTrava(c: pg.Client, tentativas = 10, esperaMs = 300): Promise<boolean> {
  for (let i = 0; i < tentativas; i++) {
    const { rows } = await c.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1::int, $2::int) AS ok", [...TRAVA]);
    if (rows[0]?.ok) return true;
    await new Promise(resolve => setTimeout(resolve, esperaMs));
  }
  return false;
}

test("bancada virtual · trava de OUTRO banco do mesmo servidor não aparece no checar deste", async (t: TestContext) => {
  const c = new pg.Client({ connectionString: await outroBancoDeTeste(), connectionTimeoutMillis: 5_000 });
  await c.connect();
  try {
    if (!(await tentarTrava(c))) {
      t.skip("a trava do outro banco de teste continuou ocupada por 3 s (outra execução deste arquivo no mesmo banco?): pulado, não falhou");
      return;
    }
    const itens = await checar(DEVICE_CODE, cfg(), { DEMO_MODE: "true" });
    assert.ok(itens.some(i => i.nivel === "OK" && i.texto === "nenhuma outra bancada virtual rodando neste banco"), itens.map(i => `${i.nivel} ${i.texto}`).join("\n"));
    const minha = await travar();
    assert.ok(minha, "e a bancada deste banco pega a trava normalmente");
    await soltar(minha!);
  } finally {
    await c.query("SELECT pg_advisory_unlock($1::int, $2::int)", [...TRAVA]).catch(() => undefined);
    await c.end();
  }
});

test("bancada virtual · ponte recém-parada não recusa o palco; ponte ainda gravando recusa (conferência com espera)", async () => {
  const d = await acharDispositivo(DEVICE_CODE, cfg());
  const agora = Date.now();
  const ponte = (sequence: number, msAtras: number) =>
    ({ deviceId: d.id, bootId: "mqtt-deadbeef", sequence, source: "SIMULATED" as const, flowLpm: 0, deltaLiters: 0, capturedAt: new Date(agora - msAtras) });
  // O cenário do verificador: 3 leituras da ponte com 1, 3 e 5 s de idade, e a ponte já parada (Ctrl+C).
  await db().telemetryReading.createMany({ data: [ponte(0, 5_000), ponte(1, 3_000), ponte(2, 1_000)] });
  const rapido = { esperaMs: 2_000, passoMs: 500 };
  const linhas: string[] = [];
  assert.equal(await conferirVazaoAlheia(d, l => linhas.push(l), rapido), null, "nenhuma leitura nova na espera: a bancada começa");
  assert.match(linhas[0], /^3 leitura\(s\) de vazão de outra fonte .*a mais nova há 1 s \(sessão mqtt-deadbeef\): conferindo por até 2 s/);
  assert.match(linhas[1], /nenhuma leitura nova de outra fonte .*ela parou/);
  assert.equal(linhas.length, 2);
  assert.notEqual(avisoVazaoAlheia(await vazaoDeOutraFonte(d)), null, "a fotografia do palco:checar ainda vê as 3 (diz a idade e como conferir)");

  // Ponte AINDA gravando: chega uma leitura durante a espera.
  let seq = 3;
  const gravando = async (ms: number) => {
    await db().telemetryReading.create({ data: ponte(seq++, 0) });
    await new Promise(resolve => setTimeout(resolve, ms));
  };
  const aviso = await conferirVazaoAlheia(d, () => undefined, { ...rapido, esperar: gravando });
  assert.ok(aviso?.startsWith("chegou leitura nova de vazão de outra fonte neste dispositivo durante a espera"), String(aviso));
  assert.equal(seq, 4, "recusa no primeiro passo que vê a leitura nova");
  assert.ok(recusaDoPalco([], aviso).includes("Pare a ponte pnpm mqtt ou desligue a vazão no firmware"));

  // Sessão da bancada virtual gravando durante a espera não conta como outra fonte.
  let k = 0;
  const bancada = async (ms: number) => {
    await db().telemetryReading.create({ data: { ...ponte(k++, 0), bootId: "bancada-1" } });
    await new Promise(resolve => setTimeout(resolve, ms));
  };
  assert.equal(await conferirVazaoAlheia(d, () => undefined, { ...rapido, esperar: bancada }), null);
  assert.equal(k, 4, "esperou a conferência inteira");
});
