import { z } from "zod";

/**
 * JSON publicado pelo firmware MQTT da bancada (PR #3 do Victor). Cada sensor é opcional, mas pelo menos um vem.
 * `bootId` + `sequence` são opcionais: quando o firmware os envia, a retransmissão fica idempotente como no HTTP.
 */
export const mqttPayloadSchema = z.object({
  dispositivo_id: z.string().trim().min(1).max(80),
  VAZAO: z.number().finite().min(0).max(1000).optional(),   // L/min (potenciômetro na bancada ou YF-S201)
  PESO: z.number().finite().min(-50).max(1000).optional(),  // kg, HX711 (oscila um pouco abaixo de zero depois da tara)
  TEMP: z.number().finite().min(-40).max(125).optional(),   // °C, DHT11
  UMIDADE: z.number().finite().min(0).max(100).optional(),  // %, DHT11
  bootId: z.string().min(4).max(80).optional(),
  sequence: z.number().int().min(0).optional(),
})
  .refine(p => p.VAZAO !== undefined || p.PESO !== undefined || p.TEMP !== undefined, { message: "payload sem VAZAO, PESO nem TEMP" })
  .refine(p => (p.bootId === undefined) === (p.sequence === undefined), { message: "bootId e sequence vêm juntos ou não vêm" });
export type MqttPayload = z.infer<typeof mqttPayloadSchema>;

export const MQTT_SENSORS = ["VAZAO", "PESO", "TEMP"] as const;
export type MqttSensor = (typeof MQTT_SENSORS)[number];

export type MqttBridgeConfig = {
  brokerUrl: string; topic: string; username?: string; password?: string;
  /** `dispositivo_id` do firmware → `Device.code` cadastrado. Sem apelido, o id precisa ser o próprio código. */
  aliases: Readonly<Record<string, string>>;
  /** Sensores que, na bancada, NÃO medem o fenômeno real (ex.: potenciômetro no lugar do sensor de vazão): gravados como SIMULATED. */
  simulated: ReadonlySet<MqttSensor>;
  /** Intervalo declarado do firmware; só é usado para o volume da primeira leitura ou depois de um buraco. */
  sampleSeconds: number;
  tempLimitC: number; tempSeconds: number;
  scaleMinKg: number; scaleStableSeconds: number;
};

/** Só as variáveis lidas; aceita `process.env` ou um objeto parcial (testes). */
type Env = Readonly<Record<string, string | undefined>>;
function number(env: Env, name: string, fallback: number, min: number, max: number) {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${name}="${raw}" inválido: use um número entre ${min} e ${max}`);
  return value;
}

/** Lê a configuração da ponte. Valor inválido derruba a ponte na partida: nunca roda com regra adivinhada. */
export function loadMqttConfig(env: Env = process.env): MqttBridgeConfig {
  const aliases: Record<string, string> = {};
  for (const pair of (env.MQTT_DEVICE_ALIASES ?? "").split(",").map(s => s.trim()).filter(Boolean)) {
    const [from, to, extra] = pair.split("=").map(s => s.trim());
    if (!from || !to || extra !== undefined) throw new Error(`MQTT_DEVICE_ALIASES: "${pair}" inválido, use id_do_firmware=CODIGO-DO-DEVICE`);
    aliases[from] = to;
  }
  // Padrão: a vazão da bancada vem de potenciômetro, então é SIMULADA. Defina "" quando o YF-S201 estiver ligado.
  const simulated = new Set<MqttSensor>();
  for (const s of (env.MQTT_SIMULATED_SENSORS ?? "VAZAO").split(",").map(x => x.trim().toUpperCase()).filter(Boolean)) {
    if (!(MQTT_SENSORS as readonly string[]).includes(s)) throw new Error(`MQTT_SIMULATED_SENSORS: "${s}" inválido, use ${MQTT_SENSORS.join(", ")}`);
    simulated.add(s as MqttSensor);
  }
  return {
    brokerUrl: env.MQTT_BROKER_URL?.trim() || "mqtt://localhost:1883",
    topic: env.MQTT_TOPIC?.trim() || "richards/comercio/telemetria",
    username: env.MQTT_USERNAME?.trim() || undefined,
    password: env.MQTT_PASSWORD || undefined,
    aliases, simulated,
    sampleSeconds: number(env, "MQTT_SAMPLE_SECONDS", 2, 0.5, 60),
    tempLimitC: number(env, "MQTT_TEMP_LIMIT_C", 28, -20, 80),
    tempSeconds: number(env, "MQTT_TEMP_SECONDS", 30, 1, 3600),
    scaleMinKg: number(env, "MQTT_SCALE_MIN_KG", 5, 0.1, 500),
    scaleStableSeconds: number(env, "MQTT_SCALE_STABLE_SECONDS", 6, 1, 600),
  };
}
