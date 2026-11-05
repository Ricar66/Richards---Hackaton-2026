import * as mqtt from "mqtt";
import { processMessageSensors } from "./reading-salva-service";

export function startMqttConnection() {
  const brokerUrl = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";
  const topic = process.env.MQTT_TOPIC || "salva/comercio/telemetria";

  console.log("Conexão iniciada em:", brokerUrl);

  const client = mqtt.connect(brokerUrl, {
    clientId: `backend_server_${Math.random().toString(16).substring(2, 8)}`,
    clean: true,
  });

  client.on("connect", () => {
    console.log(`[MQTT] Conectado ao broker em: ${brokerUrl}`);

    client.subscribe(topic, { qos: 1 }, (error) => {
      if (!error) {
        console.log(`[MQTT] Ouvindo o tópico: ${topic}`);
      } else {
        console.error("[MQTT] Erro ao se inscrever no tópico:", error);
      }
    });
  });

  client.on("error", (error) => {
    console.error("[MQTT] Erro na conexão:", error);
  });

  client.on("message", async (topic, message) => {
    try {
      const payload = JSON.parse(message.toString());
      console.log(`[MQTT] Dados recebidos em [${topic}]:`, payload);
      await processMessageSensors(payload);
    } catch (error) {
      console.error("[MQTT] Mensagem não é um JSON válido:", message.toString());
    }
  });

  return client;
}