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

async function processMessage(ingestion: MqttIngestion, message: Buffer) {
  const text = message.toString();
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { console.warn(`[MQTT] Descartada, não é JSON válido: ${text.slice(0, 200)}`); return; }
  try {
    const outcome = await ingestion.handle(raw);
    if (outcome.status === "rejected") console.warn(`[MQTT] Descartada: ${outcome.reason}`);
    else console.log(`[MQTT] ${describe(outcome)}`);
  } catch (error) {
    // A entrega já foi confirmada ao broker: a leitura não volta. Fica registrada no log e nunca é reconstruída.
    console.error(`[MQTT] Falha ao gravar (banco indisponível?), leitura perdida: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Assina o tópico da bancada e entrega cada mensagem, em ordem, aos mesmos casos de uso do HTTP. */
export function startMqttBridge(cfg: MqttBridgeConfig = loadMqttConfig()): MqttClient {
  assertBrokerAuth(cfg);
  const ingestion = new MqttIngestion(cfg);
  const aliases = Object.entries(cfg.aliases).map(([from, to]) => `${from}→${to}`).join(", ");
  console.log(`[MQTT] Ponte RICHARDS · broker ${cfg.brokerUrl} · tópico ${cfg.topic} · sessão ${ingestion.bootId}`);
  console.log(`[MQTT] Gravados como SIMULATED: ${[...cfg.simulated].join(", ") || "nenhum"} · apelidos: ${aliases || "nenhum"}`);
  if (!cfg.username) console.warn("[MQTT] Broker sem usuário e senha: qualquer equipamento da rede consegue publicar leituras. Use só em bancada isolada.");

  const client = connect(cfg.brokerUrl, {
    clientId: `richards-ponte-${ingestion.bootId}`, clean: true,
    username: cfg.username, password: cfg.password, reconnectPeriod: 5_000, connectTimeout: 10_000,
  });
  client.on("connect", () => {
    console.log(`[MQTT] Conectado a ${cfg.brokerUrl}`);
    client.subscribe(cfg.topic, { qos: 1 }, error => {
      if (error) console.error(`[MQTT] Falha ao assinar ${cfg.topic}: ${error.message}`);
      else console.log(`[MQTT] Ouvindo ${cfg.topic}`);
    });
  });
  client.on("reconnect", () => console.warn("[MQTT] Tentando reconectar ao broker..."));
  client.on("error", error => console.error(`[MQTT] Erro na conexão: ${error.message}`));
  // Uma mensagem por vez, na ordem de chegada: a regra de fluxo e a balança avaliam a sequência certa.
  let queue = Promise.resolve();
  client.on("message", (_topic, message) => { queue = queue.then(() => processMessage(ingestion, message)); });
  return client;
}
