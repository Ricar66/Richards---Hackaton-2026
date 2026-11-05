// Ponte MQTT da bancada: `pnpm mqtt`. Processo separado do Next; grava no mesmo banco do `.env` (DATABASE_URL).
import "dotenv/config";
import { getDb } from "@/lib/db";
import { startMqttBridge } from "./mqtt-connection";

getDb(); // sem DATABASE_URL a ponte nem conecta ao broker
const client = startMqttBridge();
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  console.log("[MQTT] Encerrando a ponte...");
  client.end(false, {}, () => { void getDb().$disconnect().finally(() => process.exit(0)); });
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
