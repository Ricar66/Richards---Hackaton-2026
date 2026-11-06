// pnpm test:mqtt-broker — fumaça com broker REAL (Mosquitto em Docker, porta isolada, sobe e desce sozinho) + MQTT.js de
// verdade + banco de TESTE (TEST_DATABASE_URL, nome terminado em _test). Precisa do Docker e da imagem eclipse-mosquitto:2.
// Confere que o gancho handleMessage funciona na biblioteca real: grava, insiste com o banco fora, carimba a hora da
// chegada, recusa dispositivo de outro tópico e grava a carta morta. Uso (no diretório do projeto):
import { resetAndSeed, db, DEVICE_CODE } from "../tests/integration/helpers";
import { connect } from "mqtt";
import { startMqttBridge } from "../src/iot/mqtt-connection";
import { loadMqttConfig } from "../src/iot/mqtt-payload";
import { DEMO_DEVICE_ID } from "../src/lib/constants";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { execFileSync } from "node:child_process";
const port = Number(process.argv[2] ?? 18831);
const container = `richards-mqtt-fumaca-${port}`;
// Broker isolado só no loopback, sem usuário (bancada de teste): nunca o broker da demonstração.
execFileSync("docker", ["run", "-d", "--rm", "--name", container, "-p", `127.0.0.1:${port}:1883`, "eclipse-mosquitto:2", "mosquitto", "-c", "/mosquitto-no-auth.conf"], { stdio: "ignore", env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
await new Promise(r => setTimeout(r, 1500));
const TOPIC = "richards/comercio/telemetria";
const dead = join(tmpdir(), `richards-carta-morta-${port}.ndjson`);
rmSync(dead, { force: true });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const results: string[] = [];
const check = (name: string, ok: boolean, detail = "") => { results.push(`${ok ? "PASSOU" : "FALHOU"}  ${name}${detail ? `  — ${detail}` : ""}`); };
const rows = () => db().telemetryReading.findMany({ where: { deviceId: DEMO_DEVICE_ID }, orderBy: { capturedAt: "asc" } });

await resetAndSeed();
const cfg = loadMqttConfig({ MQTT_BROKER_URL: `mqtt://localhost:${port}`, MQTT_DEVICE_ALIASES: `hortifruti_01=${DEVICE_CODE}`, MQTT_DEAD_LETTER: dead, MQTT_RETRY_BUDGET_SECONDS: "4", MQTT_SIMULATED_SENSORS: "VAZAO" });
const bridge = startMqttBridge(cfg);
let bridge2: ReturnType<typeof startMqttBridge> | null = null;
await new Promise<void>((resolve, reject) => { bridge.once("connect", () => resolve()); setTimeout(() => reject(new Error("ponte não conectou")), 8000); });
await sleep(800); // assinatura
const pub = connect(`mqtt://localhost:${port}`, { clientId: `richards-fumaca-${port}` });
await new Promise<void>(r => pub.once("connect", () => r()));
const publish = (body: unknown, topic = TOPIC) => new Promise<void>((r, j) => pub.publish(topic, JSON.stringify(body), { qos: 1 }, e => (e ? j(e) : r())));

try {
  // 1. caminho feliz pela biblioteca real
  await publish({ dispositivo_id: "hortifruti_01", VAZAO: 1.2 });
  await sleep(1200);
  let r = await rows();
  check("B1 mensagem real gravada pela ponte (MQTT.js de verdade + fila)", r.length === 1 && Number(r[0].flowLpm) === 1.2 && r[0].source === "SIMULATED", `${r.length} leitura(s)`);

  // 2. banco recusando: não grava; ao voltar grava UMA vez com a hora da chegada
  await db().$executeRawUnsafe(`CREATE OR REPLACE FUNCTION richards_test_falha() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'banco indisponível (falha injetada)'; END $$ LANGUAGE plpgsql`);
  await db().$executeRawUnsafe(`CREATE TRIGGER richards_test_falha BEFORE INSERT ON "TelemetryReading" FOR EACH ROW EXECUTE FUNCTION richards_test_falha()`);
  const sentAt = Date.now();
  await publish({ dispositivo_id: "hortifruti_01", VAZAO: 2.5 });
  await sleep(1500);
  const during = (await rows()).length;
  await db().$executeRawUnsafe(`DROP TRIGGER IF EXISTS richards_test_falha ON "TelemetryReading"`);
  const recoveredAt = Date.now();
  await sleep(2500);
  r = await rows();
  const got = r.filter(x => Number(x.flowLpm) === 2.5);
  check("B2 banco fora: nada gravado durante; ao voltar, UMA leitura com a hora da CHEGADA", during === 1 && got.length === 1 && got[0].capturedAt.getTime() < recoveredAt && got[0].capturedAt.getTime() >= sentAt - 1000,
    `durante: ${during}; depois: ${got.length}; chegou ${got[0] ? got[0].capturedAt.getTime() - sentAt : "?"} ms após o envio (o banco voltou ${recoveredAt - sentAt} ms após)`);

  // 3. tópico do próprio dispositivo, e JSON falando em nome de outro
  await publish({ dispositivo_id: "hortifruti_01", VAZAO: 0.7 }, `${TOPIC}/hortifruti_01`);
  await publish({ dispositivo_id: "hortifruti_01", VAZAO: 0.9 }, `${TOPIC}/outro_sensor`);
  await sleep(1500);
  r = await rows();
  check("B3 tópico por dispositivo aceito; JSON em nome de outro dispositivo recusado", r.some(x => Number(x.flowLpm) === 0.7) && !r.some(x => Number(x.flowLpm) === 0.9));

  // 4. prazo esgotado (4 s): carta morta e a fila segue
  await db().$executeRawUnsafe(`CREATE TRIGGER richards_test_falha BEFORE INSERT ON "TelemetryReading" FOR EACH ROW EXECUTE FUNCTION richards_test_falha()`);
  await publish({ dispositivo_id: "hortifruti_01", VAZAO: 4.4 });
  await sleep(9000);
  await db().$executeRawUnsafe(`DROP TRIGGER IF EXISTS richards_test_falha ON "TelemetryReading"`);
  await publish({ dispositivo_id: "hortifruti_01", VAZAO: 0.3 });
  await sleep(1500);
  r = await rows();
  // Cada linha da carta morta é um JSON; o conteúdo da mensagem vai dentro dele como texto (aspas escapadas).
  const deadLines = existsSync(dead) ? readFileSync(dead, "utf8").trim().split(/\r?\n/).map(l => JSON.parse(l) as { payload: string; receivedAt: string }) : [];
  const deadOk = deadLines.some(l => JSON.parse(l.payload).VAZAO === 4.4 && Date.parse(l.receivedAt) > 0);
  check("B4 prazo esgotado: guardada na carta morta e a próxima mensagem entra", deadOk && r.some(x => Number(x.flowLpm) === 0.3) && !r.some(x => Number(x.flowLpm) === 4.4));
  bridge.end(true); await bridge.stopBridge();

  // 6. mensagem RETIDA no broker (publicada antes da ponte assinar): leitura velha, ignorada
  await new Promise<void>((res, rej) => pub.publish(TOPIC, JSON.stringify({ dispositivo_id: "hortifruti_01", VAZAO: 5.5 }), { qos: 1, retain: true }, e => (e ? rej(e) : res())));
  // 5. keepalive curto (2 s) e banco fora por 9 s com 4 mensagens chegando: a conexão NÃO cai e as 4 entram, cada uma com a sua hora
  const cfg2 = loadMqttConfig({ MQTT_BROKER_URL: `mqtt://localhost:${port}`, MQTT_DEVICE_ALIASES: `hortifruti_01=${DEVICE_CODE}`, MQTT_DEAD_LETTER: dead, MQTT_RETRY_BUDGET_SECONDS: "30", MQTT_KEEPALIVE_SECONDS: "2", MQTT_SIMULATED_SENSORS: "VAZAO" });
  bridge2 = startMqttBridge(cfg2);
  let closes = 0;
  bridge2.on("close", () => closes++);
  await new Promise<void>((resolve, reject) => { bridge2!.once("connect", () => resolve()); setTimeout(() => reject(new Error("ponte 2 não conectou")), 8000); });
  await sleep(1500);
  r = await rows();
  check("B6 mensagem RETIDA no broker é ignorada (leitura velha reentregue na assinatura)", !r.some(x => Number(x.flowLpm) === 5.5));
  await new Promise<void>(res => pub.publish(TOPIC, "", { qos: 1, retain: true }, () => res())); // limpa a retida
  await db().$executeRawUnsafe(`CREATE TRIGGER richards_test_falha BEFORE INSERT ON "TelemetryReading" FOR EACH ROW EXECUTE FUNCTION richards_test_falha()`);
  const values = [3.1, 3.2, 3.3, 3.4], sent: number[] = [];
  for (const v of values) { sent.push(Date.now()); await publish({ dispositivo_id: "hortifruti_01", VAZAO: v }); await sleep(1000); }
  await sleep(5000); // banco fora ~9 s no total: 4,5× o keepalive
  const closedDuring = closes;
  await db().$executeRawUnsafe(`DROP TRIGGER IF EXISTS richards_test_falha ON "TelemetryReading"`);
  await sleep(12000); // a 1ª está no backoff (0,5+1+2+4+8 s): a próxima tentativa sai ~15,5 s depois de chegar
  r = await rows();
  const got5 = values.map(v => r.find(x => Number(x.flowLpm) === v));
  const gaps = got5.slice(1).map((x, i) => x && got5[i] ? x.capturedAt.getTime() - got5[i]!.capturedAt.getTime() : NaN);
  check("B5 banco fora por 9 s com keepalive de 2 s: conexão de pé e as 4 mensagens gravadas, cada uma com a hora em que chegou",
    closedDuring === 0 && got5.every(Boolean) && gaps.every(g => g > 700 && g < 1600),
    `quedas da conexão: ${closedDuring}; gravadas: ${got5.filter(Boolean).length}/4; intervalos entre as horas gravadas: ${gaps.join(", ")} ms`);
} finally {
  await db().$executeRawUnsafe(`DROP TRIGGER IF EXISTS richards_test_falha ON "TelemetryReading"`).catch(() => {});
  await db().$executeRawUnsafe(`DROP FUNCTION IF EXISTS richards_test_falha()`).catch(() => {});
  pub.end(true); bridge.end(true); await bridge.stopBridge().catch(() => {});
  if (bridge2) { bridge2.end(true); await bridge2.stopBridge().catch(() => {}); }
  await db().$disconnect();
  try { execFileSync("docker", ["stop", container], { stdio: "ignore" }); } catch { /* já parou */ }
}
console.log(results.join("\n"));
console.log(`${results.filter(x => x.startsWith("PASSOU")).length}/${results.length} verificações passaram`);
process.exit(results.every(x => x.startsWith("PASSOU")) ? 0 : 1);
