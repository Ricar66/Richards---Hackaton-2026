import { randomUUID } from "node:crypto";
import { auditRecord } from "@/modules/audit/infrastructure/audit-record";
import { getDb } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
import { privateTelegramUpdate, chatMessage, retryDelay, type ChatMessage } from "../domain/contracts";
import { consumeTelegramLink } from "./telegram-links";
import { answerQuestion } from "./answer";
import { reserveAssistantRequest } from "./usage";
import { deterministicSummary } from "./notifications";
import { TelegramApi, TelegramError } from "../infrastructure/telegram-api";
import { AssistantError } from "../infrastructure/config";
const HELP = "RICHARDS Assist\n/status — situação dos dispositivos\n/resumo — últimas 24 h (origens da sua assinatura)\n/ajuda — comandos e limites\n/limpar — esquecer contexto da conversa\n/parar — desativar alertas e conversa\nVocê também pode perguntar sobre o produto e as ocorrências. Consultas são somente leitura; intervenções e entregas ficam no BI.";
export async function persistTelegramUpdates(updates: unknown[]) {
  const db = getDb();
  await db.$transaction(async tx => {
    let offset: bigint | null = null;
    for (const raw of updates) {
      const id = (raw as { update_id?: unknown } | null)?.update_id;
      if (typeof id === "number" && Number.isSafeInteger(id) && id >= 0) { const next=BigInt(id)+1n; if (offset === null || next>offset) offset=next; }
      const u = privateTelegramUpdate(raw); if (!u) continue;
      await tx.telegramInbox.upsert({ where: { updateId: BigInt(u.updateId) }, create: { updateId: BigInt(u.updateId), chatId: u.chatId, text: u.text }, update: {} });
    }
    if (offset !== null) await tx.assistantWorkerState.upsert({ where: { key: "telegram" }, create: { key: "telegram", offset }, update: { offset } });
  }); // offset só é confirmado no Telegram no próximo getUpdates, depois do COMMIT do inbox.
}
export async function stopSubscription(id: string, actor = "telegram:desvinculacao") {
  await getDb().$transaction(async tx => {
    const changed=await tx.telegramSubscription.updateMany({ where: { id, organizationId: DEMO_ORG_ID }, data: { active: false, history: [], historyAt: null } });
    if(!changed.count)throw new Error("NOT_FOUND");
    await tx.notificationDelivery.updateMany({ where: { subscriptionId: id, status: "PENDING" }, data: { status: "SKIPPED" } });
    await tx.auditEvent.create({data:auditRecord({organizationId:DEMO_ORG_ID,entity:"TelegramSubscription",entityId:id,action:"DISCONNECTED",actor,metadata:{}})});
  });
}
async function reply(chatId: string, text: string) {
  const start = /^\/start(?:@[A-Za-z0-9_]+)?\s+([a-f0-9]{48})$/.exec(text);
  if (start) return await consumeTelegramLink(start[1],chatId) ? "Telegram vinculado. Alertas ativos para eventos futuros, sem simulação por padrão.\n"+HELP : "Código inválido, expirado ou já usado. Gere um novo código no painel autenticado.";
  const sub = await getDb().telegramSubscription.findFirst({ where: { chatId, organizationId: DEMO_ORG_ID, active: true } });
  if (!sub) return "Vincule este chat pelo botão Conectar Telegram no painel autenticado do RICHARDS. Somente conversas privadas são aceitas.";
  const command = text.split(/\s/)[0].split("@")[0].toLowerCase();
  if (["/parar","/stop"].includes(command)) { await stopSubscription(sub.id); return "Alertas e conversa desativados. Para voltar, gere um novo vínculo no painel."; }
  if (["/ajuda","/help","/start"].includes(command)) return HELP;
  if (command === "/limpar") { await getDb().telegramSubscription.update({ where: { id: sub.id }, data: { history: [], historyAt: null } }); return "Contexto da conversa limpo. Os registros operacionais permanecem no BI."; }
  // Comandos também são limitados por chat, sem consumir a cota paga da IA.
  const minute = `telegram:command:${sub.id}:${Math.floor(Date.now()/60000)}`;
  const rows = await getDb().$queryRaw<{count:number}[]>`INSERT INTO "AssistantUsage" (key,count) VALUES (${minute},1) ON CONFLICT (key) DO UPDATE SET count="AssistantUsage".count+1 WHERE "AssistantUsage".count < 6 RETURNING count`;
  if (!rows.length) return "Limite de consultas por minuto atingido. Aguarde um minuto.";
  if (command === "/resumo") return deterministicSummary(sub.includeSimulated);
  if (command === "/status") {
    const devices = await getDb().device.findMany({ where: { organizationId: DEMO_ORG_ID }, take: 20, select: { code: true, lastSeenAt: true, state: true } });
    return "Último contato registrado (não é certificado de calibração):\n"+devices.map(d=>`${d.code}: ${d.lastSeenAt ? d.lastSeenAt.toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}) : "nenhum pacote"}${d.state==="MAINTENANCE" ? " · manutenção" : ""}`).join("\n");
  }
  await reserveAssistantRequest(`telegram:${sub.id}`);
  const parsedHistory = chatMessage.array().max(6).safeParse(sub.history);
  const history: ChatMessage[] = sub.historyAt && Date.now()-sub.historyAt.getTime()<3600000 && parsedHistory.success ? parsedHistory.data : [];
  const answer = await answerQuestion(text,history);
  await getDb().telegramSubscription.update({ where: { id: sub.id }, data: { history: [...history,{role:"user",content:text},{role:"assistant",content:answer.answer.slice(0,2000)}].slice(-6), historyAt: new Date() } });
  return answer.answer+"\n\nFontes consultadas: "+answer.sources.map(s=>s.label).join("; ");
}
export async function processInboxOne(api: Pick<TelegramApi,"send">) {
  const db=getDb(), now=new Date(), token=randomUUID(), until=new Date(now.getTime()+120000);
  const rows=await db.$queryRaw<{updateId:bigint;chatId:string;text:string;replyText:string|null;attempts:number}[]>`WITH candidate AS (
    SELECT "updateId" FROM "TelegramInbox" WHERE "processedAt" IS NULL AND attempts<5 AND ("leasedUntil" IS NULL OR "leasedUntil"<${now}) ORDER BY "updateId" FOR UPDATE SKIP LOCKED LIMIT 1)
    UPDATE "TelegramInbox" i SET "leaseToken"=${token},"leasedUntil"=${until},attempts=i.attempts+1 FROM candidate c WHERE i."updateId"=c."updateId" RETURNING i."updateId",i."chatId",i.text,i."replyText",i.attempts`;
  const u=rows[0]; if (!u) return false;
  const where={updateId:u.updateId,leaseToken:token};
  try {
    let result=u.replyText;
    if (!result) {
      try { result=await reply(u.chatId,u.text); }
      catch(error) { result=error instanceof AssistantError && error.code==="ASSISTANT_USAGE_LIMIT" ? "Limite de uso da IA atingido. Os alertas automáticos continuam funcionando." : "Não foi possível consultar o assistente agora. Não vou substituir a consulta por dados inventados. Tente novamente mais tarde; os alertas são independentes da IA."; }
      // Guardar antes de enviar: retentativa de envio não refaz chamadas pagas à IA.
      await db.telegramInbox.updateMany({where,data:{replyText:result}});
    }
    if(!/^\/(start|stop|parar)(?:@|\s|$)/i.test(u.text)){
      const active=await db.telegramSubscription.findFirst({where:{chatId:u.chatId,organizationId:DEMO_ORG_ID,active:true},select:{id:true}});
      if(!active)result="Conversa não vinculada ou desativada. Gere um novo vínculo no painel autenticado.";
    }
    await api.send(u.chatId,result);
    await db.telegramInbox.updateMany({where,data:{processedAt:new Date(),leaseToken:null,leasedUntil:null,text:"[PROCESSADO]",lastError:null}});
  } catch(error) {
    const code=error instanceof TelegramError ? error.code : 0;
    await db.telegramInbox.updateMany({where,data:{lastError:`TELEGRAM_${code}`,leaseToken:null,leasedUntil:new Date(Date.now()+retryDelay(u.attempts,error instanceof TelegramError ? error.retryAfter : undefined)),...([400,401,403].includes(code) ? {processedAt:new Date()} : {})}});
  }
  return true;
}
