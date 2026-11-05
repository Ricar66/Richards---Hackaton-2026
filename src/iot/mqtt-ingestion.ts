import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/db";
import { DonationService } from "@/modules/donations/application/donation-service";
import { ingestReading, type IngestResult } from "@/modules/monitoring/application/ingest-telemetry";
import { openDeviceOccurrence } from "@/modules/monitoring/application/open-device-occurrence";
import { DEFAULT_MAX_GAP_SECONDS } from "@/modules/monitoring/domain/flow-alert-policy";
import { ScaleSurplusDetector } from "@/modules/monitoring/domain/scale-surplus-detector";
import type { SignalSample } from "@/modules/monitoring/domain/sustained-run";
import { TemperatureAlertPolicy } from "@/modules/monitoring/domain/temperature-alert-policy";
import { mqttPayloadSchema, type MqttBridgeConfig, type MqttSensor } from "./mqtt-payload";

export type MqttProcessed = {
  status: "processed"; deviceCode: string;
  flow?: IngestResult & { source: "DEVICE" | "SIMULATED"; sequence: number };
  temperature?: { alerted: boolean; occurrenceId?: string };
  donation?: { created: boolean; id: string; weightKg: number };
};
export type MqttOutcome = { status: "rejected"; reason: string } | MqttProcessed;

type DeviceMemory = { sequence: number; lastFlowAt?: Date; temps: SignalSample[]; scale: ScaleSurplusDetector };
const br = (n: number, digits = 1) => n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/**
 * Adaptador MQTT → casos de uso. Não tem regra própria de gravação: a vazão passa pela mesma `ingestReading`
 * do HTTP, a temperatura abre ocorrência pela mesma regra 5, e a balança cria lote PENDING_REVIEW pelo serviço de doações.
 * A confiança do canal é o broker (usuário e senha do MQTT), não uma chave por mensagem.
 */
export class MqttIngestion {
  /** Sessão da ponte: vira o `bootId` das leituras quando o firmware não manda o seu. */
  readonly bootId = `mqtt-${randomBytes(4).toString("hex")}`;
  private readonly memory = new Map<string, DeviceMemory>();
  private readonly temperature: TemperatureAlertPolicy;
  private readonly donations = new DonationService();

  constructor(private readonly cfg: MqttBridgeConfig, private readonly now: () => Date = () => new Date()) {
    this.temperature = new TemperatureAlertPolicy(cfg.tempLimitC, cfg.tempSeconds);
  }

  private remember(deviceId: string): DeviceMemory {
    let m = this.memory.get(deviceId);
    if (!m) { m = { sequence: 0, temps: [], scale: new ScaleSurplusDetector(this.cfg.scaleMinKg, this.cfg.scaleStableSeconds) }; this.memory.set(deviceId, m); }
    return m;
  }
  private source(sensor: MqttSensor): "DEVICE" | "SIMULATED" { return this.cfg.simulated.has(sensor) ? "SIMULATED" : "DEVICE"; }
  private actor(sensor: MqttSensor, code: string) { return `${this.source(sensor) === "SIMULATED" ? "simulador" : "dispositivo"}:${code}`; }

  async handle(raw: unknown): Promise<MqttOutcome> {
    const parsed = mqttPayloadSchema.safeParse(raw);
    if (!parsed.success) return { status: "rejected", reason: `payload inválido (${parsed.error.issues.map(i => `${i.path.join(".") || "payload"}: ${i.message}`).join("; ")})` };
    const p = parsed.data;
    const code = this.cfg.aliases[p.dispositivo_id] ?? p.dispositivo_id;
    // Sem fallback para "o primeiro dispositivo": leitura sem dono certo é descartada, nunca atribuída a outro sensor.
    const device = await getDb().device.findUnique({ where: { code } });
    if (!device) return { status: "rejected", reason: `dispositivo "${p.dispositivo_id}"${code !== p.dispositivo_id ? ` (apelido de ${code})` : ""} não cadastrado: cadastre o Device ou mapeie em MQTT_DEVICE_ALIASES` };
    const at = this.now();
    const mem = this.remember(device.id);
    const out: MqttProcessed = { status: "processed", deviceCode: device.code };

    if (p.VAZAO !== undefined) {
      // Volume do intervalo = vazão × tempo desde a leitura anterior. Na primeira leitura ou depois de um buraco
      // (sem amostra não se afirma continuidade), vale o intervalo declarado do firmware.
      const elapsed = mem.lastFlowAt ? (at.getTime() - mem.lastFlowAt.getTime()) / 1000 : 0;
      const seconds = elapsed > 0 && elapsed <= DEFAULT_MAX_GAP_SECONDS ? elapsed : this.cfg.sampleSeconds;
      mem.lastFlowAt = at;
      const sequence = p.sequence ?? mem.sequence++;
      const source = this.source("VAZAO");
      const result = await ingestReading(device, {
        bootId: p.bootId ?? this.bootId, sequence, flowLpm: p.VAZAO,
        deltaLiters: Math.round(((p.VAZAO * seconds) / 60) * 1000) / 1000, capturedAt: at,
      }, source, "mqtt");
      out.flow = { ...result, source, sequence };
    } else {
      // Só o último contato (MAINTENANCE é decisão humana e não é tocado).
      await getDb().device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
    }

    if (p.TEMP !== undefined) {
      const horizon = at.getTime() - (this.cfg.tempSeconds + 2 * DEFAULT_MAX_GAP_SECONDS) * 1000;
      mem.temps = [...mem.temps.filter(s => s.at.getTime() >= horizon), { at, value: p.TEMP }].slice(-600);
      const d = this.temperature.evaluate(mem.temps);
      if (!d.suspicious) out.temperature = { alerted: false };
      else {
        const source = this.source("TEMP");
        const humidity = p.UMIDADE !== undefined ? `, umidade ${br(p.UMIDADE, 0)}%` : "";
        const opened = await openDeviceOccurrence({
          kind: "TEMPERATURE_EXCURSION", severity: "MEDIUM",
          organizationId: device.organizationId, siteId: device.siteId, deviceId: device.id, source,
          title: "Temperatura acima do limite",
          description: `Temperatura acima de ${br(this.cfg.tempLimitC)} °C por ${Math.round(d.observedSeconds)} segundos (${d.samples.length} leituras entre ${br(d.minC)} e ${br(d.maxC)} °C${humidity}). Indício a verificar: o DHT11 tem precisão típica de ±2 °C.`,
          eventNote: source === "SIMULATED" ? "Gerada automaticamente a partir de leituras SIMULADAS de temperatura (via MQTT)" : "Gerada automaticamente a partir do sensor de temperatura (via MQTT)",
          actor: this.actor("TEMP", device.code),
          evidence: {
            channel: "mqtt", sensor: "DHT11",
            windowStart: d.samples[0].at.toISOString(), windowEnd: at.toISOString(), observedSeconds: d.observedSeconds,
            rule: { limitC: this.cfg.tempLimitC, continuousSeconds: this.cfg.tempSeconds },
            samples: d.samples.slice(-60).map(s => ({ at: s.at.toISOString(), temperatureC: s.value })),
            humidityPct: p.UMIDADE ?? null,
          },
        });
        out.temperature = { alerted: opened.created, occurrenceId: opened.occurrenceId };
      }
    }

    if (p.PESO !== undefined) {
      const d = mem.scale.push({ at, value: p.PESO });
      if (d.trigger) {
        try {
          const created = await this.donations.createFromScale({
            organizationId: device.organizationId, deviceId: device.id, deviceCode: device.code, weightKg: d.weightKg, source: this.source("PESO"),
            evidence: {
              channel: "mqtt", sensor: "HX711", observedSeconds: d.observedSeconds,
              rule: { minKg: this.cfg.scaleMinKg, stableSeconds: this.cfg.scaleStableSeconds },
              samples: d.samples.slice(-60).map(s => ({ at: s.at.toISOString(), weightKg: s.value })),
            },
          }, this.actor("PESO", device.code));
          out.donation = { ...created, weightKg: d.weightKg };
        } catch (error) {
          mem.scale.rearm(); // não gravou: a próxima leitura estável tenta de novo
          throw error;
        }
      }
    }
    return out;
  }
}
