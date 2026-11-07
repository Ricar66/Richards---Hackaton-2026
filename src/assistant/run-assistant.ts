import "dotenv/config";
import pg from "pg";
import { setTimeout as pause } from "node:timers/promises";
import { getDb } from "@/lib/db";
import { assistantConfig } from "@/modules/assistant/infrastructure/config";
import { TelegramApi, TelegramError } from "@/modules/assistant/infrastructure/telegram-api";
import { scanNotifications, deliverOne } from "@/modules/assistant/application/notifications";
import { persistTelegramUpdates, processInboxOne } from "@/modules/assistant/application/telegram-inbox";
import { retryDelay } from "@/modules/assistant/domain/contracts";

async function main() {
  const c=assistantConfig();
  if(c.TELEGRAM_ENABLED!=="true") { console.log("RICHARDS Assist: Telegram desativado. Configure TELEGRAM_ENABLED para iniciar."); return; }
  if(!c.TELEGRAM_BOT_TOKEN || !process.env.DATABASE_URL) throw new Error("ASSISTANT_CONFIGURATION_REQUIRED");
  const api=new TelegramApi(c.TELEGRAM_BOT_TOKEN);
  const lock=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
  await lock.connect();
  let stop=false;
  const shutdown=()=>{stop=true;};
  process.on("SIGINT",shutdown); process.on("SIGTERM",shutdown);
  lock.on("error",()=>{console.error("Assist: conexão de liderança perdida; encerrando.");stop=true;});
  try {
    const r=await lock.query<{locked:boolean}>("SELECT pg_try_advisory_lock(hashtext('richards:assistant:telegram')) AS locked");
    if(!r.rows[0]?.locked) throw new Error("ASSISTANT_WORKER_ALREADY_RUNNING");
    const me=await api.call<{username?:string}>("getMe");
    if(c.TELEGRAM_BOT_USERNAME && me.username!==c.TELEGRAM_BOT_USERNAME) throw new Error("TELEGRAM_USERNAME_MISMATCH");
    console.log("RICHARDS Assist: monitor e Telegram iniciados. Sem alterações automáticas nas operações.");
    const loops = await Promise.allSettled([
      (async()=>{while(!stop){
        try { const state=await getDb().assistantWorkerState.findUnique({where:{key:"telegram"}}); const updates=await api.call<unknown[]>("getUpdates",{offset:Number(state?.offset??0),timeout:20,limit:20,allowed_updates:["message"]}); if(!Array.isArray(updates))throw new Error("INVALID_UPDATES");await persistTelegramUpdates(updates); }
        catch(error){console.error("Assist: recebimento indisponível; nova tentativa programada."); if(error instanceof TelegramError && [401,409].includes(error.code)){stop=true;throw new Error(error.code===409 ? "TELEGRAM_WEBHOOK_OR_POLLER_CONFLICT" : "TELEGRAM_UNAUTHORIZED");} await pause(retryDelay(3,error instanceof TelegramError ? error.retryAfter : undefined));}
      }})(),
      (async()=>{while(!stop){try{await scanNotifications();await getDb().assistantWorkerState.upsert({where:{key:"telegram"},create:{key:"telegram",heartbeatAt:new Date()},update:{heartbeatAt:new Date()}});}catch{console.error("Assist: monitor não conseguiu consultar/gravar o banco; nada foi inventado.");}await pause(5000);}})(),
      (async()=>{while(!stop){try{await deliverOne(api);}catch{console.error("Assist: fila de alertas indisponível.");}await pause(1000);}})(),
      (async()=>{while(!stop){try{await processInboxOne(api);}catch{console.error("Assist: conversa pendente será retomada.");}await pause(750);}})(),
    ]);
    if(loops.some(r=>r.status==="rejected"))throw new Error("ASSISTANT_WORKER_FAILED");
  } finally {stop=true; await lock.end();await getDb().$disconnect();}
}
main().catch(()=>{console.error("RICHARDS Assist não iniciou ou encerrou por falha. Confira configuração, migração e conflito de worker/webhook. Nenhuma credencial foi registrada.");process.exitCode=1;});
