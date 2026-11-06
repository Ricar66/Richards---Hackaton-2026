import { appendFile } from "node:fs/promises";
import { connect, type MqttClient } from "mqtt";
import { Prisma } from "@/generated/prisma/client";
import { MqttIngestion, type MqttMessage, type MqttProcessed } from "./mqtt-ingestion";
import { assertBrokerAuth, hasWildcard, loadMqttConfig, topicMatches, type MqttBridgeConfig } from "./mqtt-payload";

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
 * Com `MQTT_REQUIRE_DEVICE_TOPIC=true`, o compartilhado também é recusado (null). Com curinga no `MQTT_TOPIC` (`+`/`#`),
 * vale o filtro do MQTT e todo tópico casado é tratado como compartilhado (sem id no tópico).
 */
export function deviceFromTopic(cfg: Pick<MqttBridgeConfig, "topic" | "requireDeviceTopic">, topic: string): string | undefined | null {
  if (hasWildcard(cfg.topic)) return topicMatches(cfg.topic, topic) && !cfg.requireDeviceTopic ? undefined : null;
  if (topic === cfg.topic) return cfg.requireDeviceTopic ? null : undefined;
  const prefix = `${cfg.topic}/`;
  if (!topic.startsWith(prefix)) return null;
  const id = topic.slice(prefix.length);
  return id && !id.includes("/") ? id : null;
}
export const subscriptionsFor = (cfg: Pick<MqttBridgeConfig, "topic" | "requireDeviceTopic">) =>
  hasWildcard(cfg.topic) ? [cfg.topic] : cfg.requireDeviceTopic ? [`${cfg.topic}/+`] : [cfg.topic, `${cfg.topic}/+`];

/**
 * Erro que não melhora esperando (valor fora de faixa, violação de chave, consulta malformada): vai direto para a carta
 * morta, sem prender a fila 2 min. Na dúvida (conexão, tempo esgotado, falha de trigger, erro sem código), é transitório.
 */
const PERMANENT_CODES = new Set(["P2000", "P2003", "P2005", "P2006", "P2007", "P2011", "P2012", "P2019", "P2020", "P2023", "P2025"]);
export function isPermanentError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientValidationError) return true;
  if (error instanceof Prisma.PrismaClientKnownRequestError) return PERMANENT_CODES.has(error.code);
  return false;
}

export class AttemptTimeoutError extends Error {}
/** Tentativa com teto: uma consulta que nunca volta não prende a fila para sempre (o prazo é de relógio). */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new AttemptTimeoutError(`tentativa sem resposta em ${Math.round(ms / 1000)} s`)), ms); });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

export type ProcessResult = "persisted" | "rejected" | "dead-letter";
export type ProcessorOptions = {
  /** Espera entre tentativas (injetável nos testes). */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: Pick<Console, "log" | "warn" | "error">;
  /** Ponte encerrando: para de insistir e guarda a mensagem na carta morta (nunca some em silêncio). */
  stopping?: () => boolean;
  /** Teto de cada tentativa (padrão 30 s, nunca além do que resta do prazo). */
  attemptTimeoutMs?: number;
};
const BACKOFF_MS = [500, 1_000, 2_000, 4_000, 8_000, 15_000];
const ATTEMPT_TIMEOUT_MS = 30_000;

/** O que já foi gravado de uma mensagem (a carta morta diz "PARCIAL" quando houver algo). */
function doneSummary(msg: MqttMessage | null) {
  if (!msg) return null;
  const d = msg.done;
  return {
    capturedAt: msg.at.toISOString(),
    flow: d.flow ? { bootId: msg.flow?.reading.bootId, sequence: msg.flow?.sequence, duplicate: d.flow.duplicate } : null,
    contact: !!d.contact, temperature: d.temperature ?? null, donation: d.donation ? { id: d.donation.id, created: d.donation.created } : null,
  };
}
const anyDone = (s: ReturnType<typeof doneSummary>) => !!s && (!!s.flow || s.contact || !!s.temperature || !!s.donation);

export type DeadLetterRecord = {
  deadLetterAt: string; receivedAt: string; topic: string; payload: string; attempts: number; reason: string; error: string;
  /** Partes já gravadas (vazão com bootId/sequence, contato, temperatura, lote): reprocessar só o resto. */
  partial: ReturnType<typeof doneSummary>;
};
export async function writeDeadLetter(path: string, record: DeadLetterRecord, log: Pick<Console, "error"> = console) {
  try { await appendFile(path, `${JSON.stringify(record)}\n`, "utf8"); }
  catch (e) { log.error(`[MQTT] Nem a carta morta foi gravada (${e instanceof Error ? e.message : String(e)}): ${JSON.stringify(record)}`); }
}

/**
 * Processa UMA mensagem da fila até o fim:
 * - JSON inválido, payload inválido, dispositivo desconhecido ou de outro tópico: recusa definitiva;
 * - falha transitória ao gravar (banco fora, lock esgotado): tenta de novo com espera crescente, SEM repreparar a
 *   mensagem depois que ela foi preparada (mesma hora de chegada, mesma sequência), até o prazo de relógio `retryBudgetMs`;
 * - prazo esgotado, erro permanente ou ponte encerrando: grava na "carta morta" (NDJSON com a hora de chegada, o
 *   conteúdo, o erro e o que já foi gravado) e segue.
 */
export function createMessageProcessor(ingestion: MqttIngestion, cfg: MqttBridgeConfig, opts: ProcessorOptions = {}) {
  const sleep = opts.sleep ?? (ms => new Promise<void>(r => setTimeout(r, ms)));
  const now = opts.now ?? (() => Date.now());
  const log = opts.log ?? console;
  const attemptMax = opts.attemptTimeoutMs ?? ATTEMPT_TIMEOUT_MS;
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
    let attempt = 0, lastError: unknown = null, reason = "prazo esgotado";
    let prepared: Awaited<ReturnType<MqttIngestion["prepare"]>> | null = null;
    while (true) {
      if (opts.stopping?.()) { reason = "ponte encerrada antes de gravar"; break; }
      const left = cfg.retryBudgetMs - (now() - started);
      try {
        prepared ??= await withTimeout(ingestion.prepare(raw, receivedAt, topicDevice), Math.max(1, Math.min(attemptMax, left)));
        if (prepared.status === "rejected") { log.warn(`[MQTT] Descartada: ${prepared.reason}`); return "rejected"; }
        const outcome = await withTimeout(ingestion.apply(prepared.message), Math.max(1, Math.min(attemptMax, left)));
        log.log(`[MQTT] ${describe(outcome)}${attempt ? ` (gravada na tentativa ${attempt + 1}, chegou às ${receivedAt.toISOString()})` : ""}`);
        return "persisted";
      } catch (error) {
        lastError = error;
        if (isPermanentError(error)) { reason = "erro permanente ao gravar"; break; }
        const wait = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
        if (now() - started + wait >= cfg.retryBudgetMs) break;
        attempt++;
        log.error(`[MQTT] Falha ao gravar (tentativa ${attempt}; banco indisponível?): ${error instanceof Error ? error.message : String(error)}. Nova tentativa em ${wait / 1000} s; a mensagem espera na fila com a hora de chegada.`);
        await sleep(wait);
      }
    }
    const message = prepared?.status === "ready" ? prepared.message : null;
    if (message) ingestion.abandon(message);
    const partial = doneSummary(message);
    const record: DeadLetterRecord = { deadLetterAt: new Date(now()).toISOString(), receivedAt: receivedAt.toISOString(), topic, payload: text.slice(0, 4000),
      attempts: attempt + 1, reason, error: lastError instanceof Error ? lastError.message : String(lastError ?? reason), partial };
    await writeDeadLetter(cfg.deadLetterPath, record, log);
    log.error(`[MQTT] ${anyDone(partial) ? "PARCIALMENTE gravada (veja 'partial')" : "NÃO GRAVADA"} (${reason}) depois de ${attempt + 1} tentativa(s) em ${Math.round((now() - started) / 1000)} s: guardada em ${cfg.deadLetterPath} (chegou às ${record.receivedAt}).`);
    await ingestion.reportRejected(anyDone(partial) ? "gravada em parte: o resto ficou na carta morta" : "falha ao gravar: guardada na carta morta");
    return "dead-letter";
  };
}

export type QueuedMessage = { topic: string; payload: Buffer; receivedAt: Date };
/**
 * Fila da ponte: o MQTT.js confirma (PUBACK) na chegada e entrega aqui; a fila grava uma mensagem por vez, na ordem de
 * chegada. Como nada segura o laço de pacotes do MQTT.js, o ping do keepalive continua com o banco fora e a conexão não
 * cai (o desenho anterior, PUBACK só depois de gravar, derrubava a conexão e perdia o que estava represado).
 * Fila cheia ou ponte encerrando: a mensagem vai para a carta morta, nunca some em silêncio.
 * Limite assumido: a fila vive na memória; se o PROCESSO morrer (kill -9, queda de energia), o que estava esperando o
 * banco se perde. Ver docs/CONTRATO_IOT.md, "Garantias e riscos residuais da ponte".
 */
export function createBridgeQueue(process: (topic: string, payload: Buffer, receivedAt: Date) => Promise<ProcessResult>, cfg: Pick<MqttBridgeConfig, "queueMax" | "deadLetterPath">, log: Pick<Console, "log" | "warn" | "error"> = console) {
  const queue: QueuedMessage[] = [];
  let running: Promise<void> | null = null;
  let stopped = false;
  const deadLetter = (m: QueuedMessage, reason: string) => writeDeadLetter(cfg.deadLetterPath, {
    deadLetterAt: new Date().toISOString(), receivedAt: m.receivedAt.toISOString(), topic: m.topic, payload: m.payload.toString().slice(0, 4000),
    attempts: 0, reason, error: reason, partial: null,
  }, log);
  const pending = new Set<Promise<void>>();
  const track = (p: Promise<void>) => { pending.add(p); void p.finally(() => pending.delete(p)); };
  async function drain() {
    while (queue.length && !stopped) {
      const m = queue.shift()!;
      try { await process(m.topic, m.payload, m.receivedAt); }
      catch (e) {
        log.error(`[MQTT] Erro inesperado na fila: ${e instanceof Error ? e.message : String(e)}`);
        await deadLetter(m, `erro inesperado: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    running = null;
  }
  return {
    push(m: QueuedMessage) {
      if (stopped) { track(deadLetter(m, "ponte encerrada antes de gravar")); return; }
      if (queue.length >= cfg.queueMax) {
        log.error(`[MQTT] Fila cheia (${cfg.queueMax} mensagens esperando o banco): mensagem de ${m.receivedAt.toISOString()} guardada na carta morta.`);
        track(deadLetter(m, "fila cheia"));
        return;
      }
      queue.push(m);
      if (!running) running = drain();
    },
    size: () => queue.length,
    /** Termina a mensagem em curso (que para de insistir e vai para a carta morta) e guarda o resto da fila. */
    async stop() {
      stopped = true;
      const left = queue.splice(0);
      await running;
      for (const m of left) await deadLetter(m, "ponte encerrada antes de gravar");
      await Promise.all([...pending]);
      if (left.length) log.warn(`[MQTT] ${left.length} mensagem(ns) da fila guardada(s) na carta morta ao encerrar.`);
    },
    isStopped: () => stopped,
  };
}

/** Assina o tópico da bancada (e os tópicos por dispositivo) e entrega cada mensagem, em ordem, aos casos de uso do HTTP. */
export function startMqttBridge(cfg: MqttBridgeConfig = loadMqttConfig()): MqttClient & { stopBridge(): Promise<void>; queueSize(): number } {
  assertBrokerAuth(cfg);
  const ingestion = new MqttIngestion(cfg);
  const aliases = Object.entries(cfg.aliases).map(([from, to]) => `${from}→${to}`).join(", ");
  const topics = subscriptionsFor(cfg);
  console.log(`[MQTT] Ponte RICHARDS · broker ${cfg.brokerUrl} · tópicos ${topics.join(" e ")} · sessão ${ingestion.bootId}`);
  console.log(`[MQTT] Gravados como SIMULATED: ${[...cfg.simulated].join(", ") || "nenhum"} · apelidos: ${aliases || "nenhum"}`);
  console.log(`[MQTT] Fila em memória (até ${cfg.queueMax}) · insiste por ${cfg.retryBudgetMs / 1000} s com o banco fora · carta morta: ${cfg.deadLetterPath}`);
  if (!cfg.username) console.warn("[MQTT] Broker sem usuário e senha: qualquer equipamento da rede consegue publicar leituras. Use só em bancada isolada.");

  // Sessão LIMPA de propósito: o JSON do firmware não traz horário, então a hora da leitura é a da chegada na ponte.
  // Com sessão persistente, mensagens represadas no broker enquanto a ponte estava fora chegariam juntas, minutos
  // depois, carimbadas como "agora" (fluxo inventado). Sem ponte = sem amostra = sem linha.
  const client = connect(cfg.brokerUrl, {
    clientId: `richards-ponte-${ingestion.bootId}`, clean: true, keepalive: cfg.keepaliveSeconds,
    username: cfg.username, password: cfg.password, reconnectPeriod: 5_000, connectTimeout: 10_000,
  });
  let queue: ReturnType<typeof createBridgeQueue> | null = null;
  queue = createBridgeQueue(createMessageProcessor(ingestion, cfg, { stopping: () => queue?.isStopped() ?? false }), cfg);
  client.on("message", (topic, payload, packet) => {
    // Retida = guardada no broker e reentregue a cada (re)conexão: é uma leitura velha, não uma nova.
    if (packet.retain) { console.warn(`[MQTT] Ignorada: mensagem RETIDA no broker em ${topic} (leitura antiga, não uma nova). Publique sem retain.`); return; }
    queue!.push({ topic, payload: Buffer.from(payload), receivedAt: new Date() });
  });
  client.on("connect", () => {
    console.log(`[MQTT] Conectado a ${cfg.brokerUrl}`);
    client.subscribe(topics, { qos: 1 }, error => {
      if (error) console.error(`[MQTT] Falha ao assinar ${topics.join(", ")}: ${error.message}`);
      else console.log(`[MQTT] Ouvindo ${topics.join(" e ")}`);
    });
  });
  client.on("reconnect", () => console.warn("[MQTT] Tentando reconectar ao broker..."));
  client.on("close", () => { if (queue && queue.size()) console.warn(`[MQTT] Conexão fechada com ${queue.size()} mensagem(ns) na fila: elas continuam sendo gravadas.`); });
  client.on("error", error => console.error(`[MQTT] Erro na conexão: ${error.message}`));
  return Object.assign(client, { stopBridge: () => queue!.stop(), queueSize: () => queue!.size() });
}
