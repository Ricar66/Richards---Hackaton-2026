import { randomBytes } from "node:crypto";
import { DEMO_ORG_ID } from "@/lib/constants";
import { getDb } from "@/lib/db";
import { DonationService } from "@/modules/donations/application/donation-service";
import { CHANNEL_NOTE, ingestReading, type IngestDevice, type IngestReading, type IngestResult } from "@/modules/monitoring/application/ingest-telemetry";
import { openDeviceOccurrence } from "@/modules/monitoring/application/open-device-occurrence";
import { DEFAULT_MAX_GAP_SECONDS } from "@/modules/monitoring/domain/flow-alert-policy";
import { ScaleSurplusDetector } from "@/modules/monitoring/domain/scale-surplus-detector";
import type { SignalSample } from "@/modules/monitoring/domain/sustained-run";
import { TemperatureAlertPolicy } from "@/modules/monitoring/domain/temperature-alert-policy";
import type { SensorLiveEvent } from "@/modules/realtime/domain/live-event";
import { notifyLiveSafe } from "@/modules/realtime/infrastructure/notify-event";
import { mqttPayloadSchema, type MqttBridgeConfig, type MqttSensor } from "./mqtt-payload";

export type MqttProcessed = {
  status: "processed"; deviceCode: string;
  flow?: IngestResult & { source: "DEVICE" | "SIMULATED"; sequence: number };
  temperature?: { alerted: boolean; occurrenceId?: string };
  donation?: { created: boolean; id: string; weightKg: number };
};
export type MqttOutcome = { status: "rejected"; reason: string } | MqttProcessed;

type DeviceMemory = { sequence: number; lastFlowAt?: Date; temps: SignalSample[]; scale: ScaleSurplusDetector };
/** No máximo um `message.rejected` por motivo neste intervalo: mensagem ruim em rajada não inunda o telão. */
const REJECT_NOTICE_MS = 2_000;
const br = (n: number, digits = 1) => n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/**
 * Adaptador MQTT → casos de uso. Não tem regra própria de gravação: a vazão passa pela mesma `ingestReading`
 * do HTTP, a temperatura abre ocorrência pela mesma regra 5, e a balança cria lote PENDING_REVIEW pelo serviço de doações.
 * A confiança do canal é o broker (usuário e senha do MQTT), não uma chave por mensagem.
 * Ao vivo: temperatura e peso viram `sensor.live` (efêmero, `persisted: false`: ainda não têm série no banco) e
 * mensagem recusada vira `message.rejected` com motivo curto. Os dois são best-effort e nunca derrubam a ingestão.
 */
export class MqttIngestion {
  /** Sessão da ponte: vira o `bootId` das leituras quando o firmware não manda o seu. */
  readonly bootId = `mqtt-${randomBytes(4).toString("hex")}`;
  private readonly memory = new Map<string, DeviceMemory>();
  private readonly temperature: TemperatureAlertPolicy;
  private readonly donations = new DonationService();
  private readonly rejectedAt = new Map<string, number>();

  /** Por onde a mensagem entrou: "mqtt" (ponte com broker) ou "bancada-virtual" (simulador de palco no mesmo processo). */
  readonly channel: "mqtt" | "bancada-virtual";

  constructor(private readonly cfg: MqttBridgeConfig, private readonly now: () => Date = () => new Date(), opts: { channel?: "mqtt" | "bancada-virtual" } = {}) {
    this.temperature = new TemperatureAlertPolicy(cfg.tempLimitC, cfg.tempSeconds);
    this.channel = opts.channel ?? "mqtt";
  }

  private remember(deviceId: string): DeviceMemory {
    let m = this.memory.get(deviceId);
    if (!m) { m = { sequence: 0, temps: [], scale: new ScaleSurplusDetector(this.cfg.scaleMinKg, this.cfg.scaleStableSeconds) }; this.memory.set(deviceId, m); }
    return m;
  }
  private source(sensor: MqttSensor): "DEVICE" | "SIMULATED" { return this.cfg.simulated.has(sensor) ? "SIMULATED" : "DEVICE"; }
  /** Apelido → código; só chave própria do mapa ("__proto__" e afins nunca acham nada). */
  private alias(id: string): string { return Object.hasOwn(this.cfg.aliases, id) ? this.cfg.aliases[id] : id; }
  private actor(sensor: MqttSensor, code: string) { return `${this.source(sensor) === "SIMULATED" ? "simulador" : "dispositivo"}:${code}`; }

  /** Avisa o telão que uma mensagem foi descartada (motivo curto, sem conteúdo da mensagem), limitado por motivo. */
  async reportRejected(reason: string): Promise<void> {
    const t = Date.now();
    const last = this.rejectedAt.get(reason);
    if (last !== undefined && t - last < REJECT_NOTICE_MS) return;
    this.rejectedAt.set(reason, t);
    await notifyLiveSafe({ type: "message.rejected", orgId: DEMO_ORG_ID, channel: this.channel, reason });
  }

  /**
   * Mensagem inteira, de uma vez (bancada virtual e testes). A ponte com broker usa `prepare` uma vez e repete `apply`
   * enquanto o banco estiver fora (ver mqtt-connection.ts).
   * `receivedAt`: quando a mensagem chegou do broker (antes da fila). Sem ele (bancada virtual, testes), vale o relógio
   * injetado.
   */
  async handle(raw: unknown, receivedAt?: Date, topicDeviceId?: string): Promise<MqttOutcome> {
    const prepared = await this.prepare(raw, receivedAt, topicDeviceId);
    if (prepared.status === "rejected") return prepared;
    try { return await this.apply(prepared.message); }
    catch (error) { this.abandon(prepared.message); throw error; }
  }

  /**
   * Etapa 1, UMA vez por mensagem: valida, acha o dispositivo (leitura no banco; se o banco estiver fora, lança e nada
   * mudou na memória), fixa a hora de chegada e a sequência sintética, e alimenta a memória das regras de temperatura e da
   * balança. Repetir só o `apply` grava a MESMA leitura (mesma hora, mesma sequência): retentativa nunca duplica nem
   * "atualiza" a hora para o momento em que o banco voltou.
   * `topicDeviceId`: o `<id>` de `<topic>/<id>` quando a mensagem chegou pelo tópico do próprio dispositivo.
   */
  async prepare(raw: unknown, arrivedAt?: Date, topicDeviceId?: string): Promise<{ status: "rejected"; reason: string } | { status: "ready"; message: MqttMessage }> {
    const parsed = mqttPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      await this.reportRejected("payload inválido");
      return { status: "rejected", reason: `payload inválido (${parsed.error.issues.map(i => `${i.path.join(".") || "payload"}: ${i.message}`).join("; ")})` };
    }
    const p = parsed.data;
    const code = this.alias(p.dispositivo_id);
    // Tópico por dispositivo: o JSON não pode falar em nome de outro (a ACL do broker garante quem publica no tópico).
    if (topicDeviceId !== undefined && this.alias(topicDeviceId) !== code) {
      await this.reportRejected("dispositivo diferente do tópico");
      return { status: "rejected", reason: `dispositivo_id "${p.dispositivo_id}" publicado no tópico de "${topicDeviceId}": recusado` };
    }
    // Sem fallback para "o primeiro dispositivo": leitura sem dono certo é descartada, nunca atribuída a outro sensor.
    // Escopo da demonstração: a ponte só alimenta dispositivos da organização da bancada.
    const device = await getDb().device.findFirst({ where: { code, organizationId: DEMO_ORG_ID } });
    if (!device) {
      await this.reportRejected("dispositivo não cadastrado");
      return { status: "rejected", reason: `dispositivo "${p.dispositivo_id}"${code !== p.dispositivo_id ? ` (apelido de ${code})` : ""} não cadastrado: cadastre o Device ou mapeie em MQTT_DEVICE_ALIASES` };
    }
    // Daqui para baixo nada lê o banco: a memória da ponte muda uma vez só por mensagem.
    // A hora da leitura é a da CHEGADA na ponte (o JSON não traz horário), nunca a do processamento: com o banco fora,
    // a mensagem espera na fila e é gravada depois com a hora em que chegou.
    const at = arrivedAt ?? this.now();
    const receivedAt = arrivedAt ?? new Date(); // bancada virtual: hora do cenário na leitura, relógio real na "viagem"
    const mem = this.remember(device.id);
    const msg: MqttMessage = { device, at, receivedAt, done: {} };

    if (p.VAZAO !== undefined) {
      // Volume do intervalo = vazão × tempo desde a leitura anterior. Na primeira leitura ou depois de um buraco
      // (sem amostra não se afirma continuidade), vale o intervalo declarado do firmware.
      const elapsed = mem.lastFlowAt ? (at.getTime() - mem.lastFlowAt.getTime()) / 1000 : 0;
      const seconds = elapsed > 0 && elapsed <= DEFAULT_MAX_GAP_SECONDS ? elapsed : this.cfg.sampleSeconds;
      mem.lastFlowAt = at;
      const sequence = p.sequence ?? mem.sequence++;
      msg.flow = { source: this.source("VAZAO"), sequence, reading: {
        bootId: p.bootId ?? this.bootId, sequence, flowLpm: p.VAZAO,
        deltaLiters: Math.round(((p.VAZAO * seconds) / 60) * 1000) / 1000, capturedAt: at, receivedAt,
      } };
    }
    if (p.TEMP !== undefined) {
      const horizon = at.getTime() - (this.cfg.tempSeconds + 2 * DEFAULT_MAX_GAP_SECONDS) * 1000;
      mem.temps = [...mem.temps.filter(s => s.at.getTime() >= horizon), { at, value: p.TEMP }].slice(-600);
      const d = this.temperature.evaluate(mem.temps);
      msg.temperature = { decision: d, c: p.TEMP, humidityPct: p.UMIDADE, source: this.source("TEMP") };
    }
    if (p.PESO !== undefined) msg.scale = { decision: mem.scale.push({ at, value: p.PESO }), kg: p.PESO, source: this.source("PESO") };
    return { status: "ready", message: msg };
  }

  /**
   * Etapa 2, repetível: as gravações, cada uma idempotente e lembrada em `message.done` (a retentativa pula o que já
   * gravou): leitura por (dispositivo, bootId, sequence), ocorrência pela regra 5, lote pelo pendente único da balança.
   * O aviso ao vivo `sensor.live` sai uma vez, no fim, só depois de tudo gravado.
   */
  async apply(msg: MqttMessage): Promise<MqttProcessed> {
    const { device, at, receivedAt, done } = msg;
    const mem = this.remember(device.id);
    if (msg.flow && !done.flow) done.flow = await ingestReading(device, msg.flow.reading, msg.flow.source, this.channel);
    if (!msg.flow && !done.contact) {
      // Só o último contato (MAINTENANCE é decisão humana e não é tocado).
      await getDb().device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
      done.contact = true;
    }
    if (msg.temperature && !done.temperature) {
      const { decision: d, source } = msg.temperature;
      if (!d.suspicious) done.temperature = { alerted: false };
      else {
        const humidity = msg.temperature.humidityPct !== undefined ? `, umidade ${br(msg.temperature.humidityPct, 0)}%` : "";
        const opened = await openDeviceOccurrence({
          kind: "TEMPERATURE_EXCURSION", severity: "MEDIUM",
          organizationId: device.organizationId, siteId: device.siteId, deviceId: device.id, deviceCode: device.code, source,
          title: "Temperatura acima do limite",
          description: `Temperatura acima de ${br(this.cfg.tempLimitC)} °C por ${Math.round(d.observedSeconds)} segundos (${d.samples.length} leituras entre ${br(d.minC)} e ${br(d.maxC)} °C${humidity}). Indício a verificar: o DHT11 tem precisão típica de ±2 °C.`,
          eventNote: (source === "SIMULATED" ? "Gerada automaticamente a partir de leituras SIMULADAS de temperatura" : "Gerada automaticamente a partir do sensor de temperatura") + CHANNEL_NOTE[this.channel],
          actor: this.actor("TEMP", device.code),
          evidence: {
            channel: this.channel, sensor: "DHT11",
            windowStart: d.samples[0].at.toISOString(), windowEnd: at.toISOString(), observedSeconds: d.observedSeconds,
            rule: { limitC: this.cfg.tempLimitC, continuousSeconds: this.cfg.tempSeconds },
            samples: d.samples.slice(-60).map(s => ({ at: s.at.toISOString(), temperatureC: s.value })),
            humidityPct: msg.temperature.humidityPct ?? null,
          },
        });
        done.temperature = { alerted: opened.created, occurrenceId: opened.occurrenceId };
      }
    }
    if (msg.scale?.decision.trigger && !done.donation) {
      const d = msg.scale.decision;
      const created = await this.donations.createFromScale({
        organizationId: device.organizationId, deviceId: device.id, deviceCode: device.code, weightKg: d.weightKg, source: msg.scale.source,
        evidence: {
          channel: this.channel, sensor: "HX711", observedSeconds: d.observedSeconds,
          rule: { minKg: this.cfg.scaleMinKg, stableSeconds: this.cfg.scaleStableSeconds },
          samples: d.samples.slice(-60).map(s => ({ at: s.at.toISOString(), weightKg: s.value })),
        },
      }, this.actor("PESO", device.code));
      done.donation = { ...created, weightKg: d.weightKg };
      // Recusado (já há lote desta balança e origem aguardando verificação): a fase ao vivo diz isso, não "triggered",
      // que levaria o telão a afirmar que esta pesagem virou lote.
      if (!created.created) mem.scale.markBlocked(created.id);
    }
    const out: MqttProcessed = { status: "processed", deviceCode: device.code };
    if (msg.flow && done.flow) out.flow = { ...done.flow, source: msg.flow.source, sequence: msg.flow.sequence };
    if (done.temperature) out.temperature = done.temperature;
    if (done.donation) out.donation = done.donation;
    const live: Pick<SensorLiveEvent, "temperature" | "scale"> = {};
    if (msg.temperature) {
      const d = msg.temperature.decision;
      live.temperature = {
        c: msg.temperature.c, ...(msg.temperature.humidityPct !== undefined ? { humidityPct: msg.temperature.humidityPct } : {}), source: msg.temperature.source,
        rule: { limitC: this.cfg.tempLimitC, continuousSeconds: this.cfg.tempSeconds, observedSeconds: d.observedSeconds, suspicious: d.suspicious },
      };
    }
    if (msg.scale) live.scale = { kg: msg.scale.kg, source: msg.scale.source, progress: mem.scale.progress() };
    if ((live.temperature || live.scale) && !done.live) {
      done.live = true;
      const emittedAt = new Date();
      await notifyLiveSafe({
        type: "sensor.live", orgId: device.organizationId, persisted: false, deviceId: device.id, deviceCode: device.code,
        channel: this.channel, at: at.toISOString(), ...live,
        timing: { receivedAt: receivedAt.toISOString(), emittedAt: emittedAt.toISOString() },
      }, emittedAt);
    }
    return out;
  }

  /** Desistiu da mensagem (prazo esgotado): a balança, se ia criar lote e não criou, rearma para a próxima pesagem estável. */
  abandon(msg: MqttMessage) {
    if (msg.scale?.decision.trigger && !msg.done.donation) this.remember(msg.device.id).scale.rearm();
  }
}

/** Mensagem preparada: o que gravar e o que já foi gravado (`done`), para a retentativa não repetir nada. */
export type MqttMessage = {
  device: IngestDevice; at: Date; receivedAt: Date;
  flow?: { source: "DEVICE" | "SIMULATED"; sequence: number; reading: IngestReading };
  temperature?: { decision: ReturnType<TemperatureAlertPolicy["evaluate"]>; c: number; humidityPct?: number; source: "DEVICE" | "SIMULATED" };
  scale?: { decision: ReturnType<ScaleSurplusDetector["push"]>; kg: number; source: "DEVICE" | "SIMULATED" };
  done: {
    flow?: IngestResult; contact?: boolean; live?: boolean;
    temperature?: { alerted: boolean; occurrenceId?: string };
    donation?: { created: boolean; id: string; weightKg: number };
  };
};
