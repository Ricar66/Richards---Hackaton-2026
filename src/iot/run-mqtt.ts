// Ponte MQTT da bancada: `pnpm mqtt`. Processo separado do Next; grava no mesmo banco do `.env` (DATABASE_URL).
import "dotenv/config";
import { getDb } from "@/lib/db";
import { startMqttBridge } from "./mqtt-connection";

getDb(); // sem DATABASE_URL a ponte nem conecta ao broker
const client = startMqttBridge();
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  console.log("[MQTT] Encerrando a ponte: a mensagem em curso termina ou vai para a carta morta, e o resto da fila também.");
  client.end(false, {}, () => undefined); // para de receber
  await client.stopBridge().catch(e => console.error(`[MQTT] Erro ao esvaziar a fila: ${e instanceof Error ? e.message : String(e)}`));
  await getDb().$disconnect().catch(() => undefined);
  process.exit(0);
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
