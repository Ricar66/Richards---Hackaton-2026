import { createHash } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { connect, type MqttClient } from "mqtt";
import { MqttIngestion, type MqttProcessed } from "./mqtt-ingestion";
import { assertBrokerAuth, loadMqttConfig, type MqttBridgeConfig } from "./mqtt-payload";

const kg = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
function describe(o: MqttProcessed) {
  const parts = [o.deviceCode];
  if (o.flow) parts.push(`vazão seq ${o.flow.sequence} ${o.flow.duplicate ? "repetida (ignorada)" : "gravada"}${o.flow.source === "SIMULATED" ? " [SIMULATED]" : ""}`);
  if (o.flow?.alerted) parts.push(`OCORRÊNCIA de fluxo aberta (${o.flow.occurrenceId})`);
  if (o.temperature?.alerted) parts.push(`OCORRÊNCIA de temperatura aberta (${o.temperature.occurrenceId})`);
  if (o.donation) parts.push(o.donation.created
    ? `LOTE de ${kg(o.donation.weightKg)} kg criado (${o.donation.id}), aguarda verificação humana`
    : `balança: o lote ${o.donation.id} ainda aguarda verificação, nada novo criado`);
  return parts.join(" · ");
}

/**
 * `<topic>` = tópico compartilhado (undefined); `<topic>/<id>` = tópico do próprio dispositivo (o id); outro = null.
 * Com `MQTT_REQUIRE_DEVICE_TOPIC=true`, o compartilhado também é recusado (null).
 */
export function deviceFromTopic(cfg: Pick<MqttBridgeConfig, "topic" | "requireDeviceTopic">, topic: string): string | undefined | null {
  if (topic === cfg.topic) return cfg.requireDeviceTopic ? null : undefined;
  const prefix = `${cfg.topic}/`;
  if (!topic.startsWith(prefix)) return null;
  const id = topic.slice(prefix.length);
  return id && !id.includes("/") ? id : null;
}

export type ProcessResult = "persisted" | "rejected" | "dead-letter";
export type ProcessorOptions = {
  /** Espera entre tentativas (injetável nos testes). */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: Pick<Console, "log" | "warn" | "error">;
  /** Para de insistir (processo encerrando): a mensagem não é confirmada nem vai para a carta morta. */
  stopping?: () => boolean;
};
const BACKOFF_MS = [500, 1_000, 2_000, 4_000, 8_000, 15_000];

/**
 * Processa UMA mensagem do broker até o fim antes de devolver (e só então a ponte confirma o PUBACK):
 * - JSON inválido, payload inválido, dispositivo desconhecido ou de outro tópico: recusa definitiva (confirma e segue);
 * - falha ao gravar (banco fora, lock esgotado): tenta de novo com espera crescente, SEM repreparar a mensagem (mesma
 *   hora de chegada, mesma sequência: a leitura gravada depois é a mesma, nunca outra), até o prazo `retryBudgetMs`;
 * - prazo esgotado: grava a mensagem na "carta morta" (NDJSON com hora de chegada, tópico, conteúdo e erro), avisa e
 *   segue. Nada se perde em silêncio; reprocessar é decisão humana (a hora de chegada está no arquivo).
 */
export function createMessageProcessor(ingestion: MqttIngestion, cfg: MqttBridgeConfig, opts: ProcessorOptions = {}) {
  const sleep = opts.sleep ?? (ms => new Promise<void>(r => setTimeout(r, ms)));
  const now = opts.now ?? (() => Date.now());
  const log = opts.log ?? console;
  return async function processMessage(topic: string, payload: Buffer, receivedAt: Date): Promise<ProcessResult> {
    const text = payload.toString();
    const topicDevice = deviceFromTopic(cfg, topic);
    if (topicDevice === null) {
      log.warn(`[MQTT] Descartada: tópico ${topic} não aceito${cfg.requireDeviceTopic ? " (MQTT_REQUIRE_DEVICE_TOPIC=true exige <tópico>/<dispositivo>)" : ""}`);
      await ingestion.reportRejected("tópico não aceito");
      return "rejected";
    }
    let raw: unknown;
    try { raw = JSON.parse(text); } catch {
      log.warn(`[MQTT] Descartada, não é JSON válido: ${text.slice(0, 200)}`);
      await ingestion.reportRejected("JSON inválido"); // só o motivo vai ao telão, nunca o conteúdo
      return "rejected";
    }
    const started = now();
    let attempt = 0, lastError: unknown = null;
    let prepared: Awaited<ReturnType<MqttIngestion["prepare"]>> | null = null;
    while (true) {
      try {
        prepared ??= await ingestion.prepare(raw, receivedAt, topicDevice);
        if (prepared.status === "rejected") { log.warn(`[MQTT] Descartada: ${prepared.reason}`); return "rejected"; }
        const outcome = await ingestion.apply(prepared.message);
        log.log(`[MQTT] ${describe(outcome)}${attempt ? ` (gravada na tentativa ${attempt + 1})` : ""}`);
        return "persisted";
      } catch (error) {
        lastError = error;
        if (opts.stopping?.()) throw error; // encerrando: não confirma; com o processo de pé de novo, o firmware manda as próximas
        const wait = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
        if (now() - started + wait > cfg.retryBudgetMs) break;
        attempt++;
        log.error(`[MQTT] Falha ao gravar (tentativa ${attempt}; banco indisponível?): ${error instanceof Error ? error.message : String(error)}. Nova tentativa em ${wait / 1000} s, sem confirmar ao broker.`);
        await sleep(wait);
      }
    }
    if (prepared?.status === "ready") ingestion.abandon(prepared.message);
    const record = { deadLetterAt: new Date(now()).toISOString(), receivedAt: receivedAt.toISOString(), topic, payload: text.slice(0, 4000), attempts: attempt + 1, error: lastError instanceof Error ? lastError.message : String(lastError) };
    try { await appendFile(cfg.deadLetterPath, `${JSON.stringify(record)}\n`, "utf8"); }
    catch (e) { log.error(`[MQTT] Nem a carta morta foi gravada (${e instanceof Error ? e.message : String(e)}): ${JSON.stringify(record)}`); }
    log.error(`[MQTT] NÃO GRAVADA depois de ${attempt + 1} tentativas em ${Math.round((now() - started) / 1000)} s: guardada em ${cfg.deadLetterPath} (chegou às ${record.receivedAt}).`);
    await ingestion.reportRejected("falha ao gravar: guardada na carta morta");
    return "dead-letter";
  };
}

type HandleMessage = (packet: { topic: string; payload: Buffer | string; messageId?: number; qos?: number }, callback: (error?: Error) => void) => void;
/**
 * Confirma ao broker SÓ DEPOIS de gravar. No MQTT.js (QoS 1) o PUBACK sai quando `handleMessage` chama o callback; o
 * padrão chama na hora, antes do código da ponte rodar. Aqui o callback espera a mensagem ser gravada (ou recusada de vez,
 * ou guardada na carta morta). Enquanto isso o MQTT.js não entrega a próxima: a ordem de chegada é preservada.
 * Reentrega idêntica (mesmo id de pacote e mesmo conteúdo) que chegue durante o processamento não é processada de novo.
 */
export function attachAckAfterPersist(client: { handleMessage: HandleMessage }, process: (topic: string, payload: Buffer, receivedAt: Date) => Promise<ProcessResult>) {
  const inflight = new Map<string, Promise<ProcessResult>>();
  let chain: Promise<unknown> = Promise.resolve();
  client.handleMessage = (packet, callback) => {
    const payload = typeof packet.payload === "string" ? Buffer.from(packet.payload) : packet.payload;
    const key = packet.messageId !== undefined ? `${packet.messageId}:${createHash("sha1").update(payload).digest("hex")}` : null;
    let job = key ? inflight.get(key) : undefined;
    if (!job) {
      const receivedAt = new Date(); // hora de chegada, antes da fila: a "viagem do pacote" inclui a espera
      job = chain.then(() => process(packet.topic, payload, receivedAt));
      chain = job.catch(() => undefined); // uma mensagem por vez, mesmo entre reconexões
      if (key) { inflight.set(key, job); void job.finally(() => setTimeout(() => inflight.delete(key), 60_000)); }
    }
    job.then(() => callback(), () => { /* encerrando: sem PUBACK */ });
  };
}

/** Assina o tópico da bancada (e os tópicos por dispositivo) e entrega cada mensagem, em ordem, aos casos de uso do HTTP. */
export function startMqttBridge(cfg: MqttBridgeConfig = loadMqttConfig()): MqttClient & { stopBridge(): void } {
  assertBrokerAuth(cfg);
  const ingestion = new MqttIngestion(cfg);
  const aliases = Object.entries(cfg.aliases).map(([from, to]) => `${from}→${to}`).join(", ");
  console.log(`[MQTT] Ponte RICHARDS · broker ${cfg.brokerUrl} · tópico ${cfg.topic}${cfg.requireDeviceTopic ? "/<dispositivo> (obrigatório)" : " e /<dispositivo>"} · sessão ${ingestion.bootId}`);
  console.log(`[MQTT] Gravados como SIMULATED: ${[...cfg.simulated].join(", ") || "nenhum"} · apelidos: ${aliases || "nenhum"}`);
  console.log(`[MQTT] Confirma ao broker só depois de gravar · insiste por ${cfg.retryBudgetMs / 1000} s com o banco fora · carta morta: ${cfg.deadLetterPath}`);
  if (!cfg.username) console.warn("[MQTT] Broker sem usuário e senha: qualquer equipamento da rede consegue publicar leituras. Use só em bancada isolada.");

  // Sessão LIMPA de propósito: o JSON do firmware não traz horário, então a hora da leitura é a da chegada na ponte.
  // Com sessão persistente, mensagens represadas no broker enquanto a ponte estava fora chegariam juntas, minutos
  // depois, carimbadas como "agora" (fluxo inventado). Sem ponte = sem amostra = sem linha.
  const client = connect(cfg.brokerUrl, {
    clientId: `richards-ponte-${ingestion.bootId}`, clean: true,
    username: cfg.username, password: cfg.password, reconnectPeriod: 5_000, connectTimeout: 10_000,
  });
  let stopping = false;
  attachAckAfterPersist(client as unknown as { handleMessage: HandleMessage }, createMessageProcessor(ingestion, cfg, { stopping: () => stopping }));
  client.on("connect", () => {
    console.log(`[MQTT] Conectado a ${cfg.brokerUrl}`);
    const topics = cfg.requireDeviceTopic ? [`${cfg.topic}/+`] : [cfg.topic, `${cfg.topic}/+`];
    client.subscribe(topics, { qos: 1 }, error => {
      if (error) console.error(`[MQTT] Falha ao assinar ${topics.join(", ")}: ${error.message}`);
      else console.log(`[MQTT] Ouvindo ${topics.join(" e ")}`);
    });
  });
  client.on("reconnect", () => console.warn("[MQTT] Tentando reconectar ao broker..."));
  client.on("error", error => console.error(`[MQTT] Erro na conexão: ${error.message}`));
  return Object.assign(client, { stopBridge: () => { stopping = true; } });
}
