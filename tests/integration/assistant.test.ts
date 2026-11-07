import test,{beforeEach,after} from "node:test";
import assert from "node:assert/strict";
import {db,resetAndSeed} from "./helpers";
import {DEMO_ORG_ID,DEMO_SITE_ID,DEMO_DEVICE_ID} from "../../src/lib/constants";
import {createTelegramLink,consumeTelegramLink} from "../../src/modules/assistant/application/telegram-links";
import {scanNotifications,claimDelivery,deliverOne} from "../../src/modules/assistant/application/notifications";
import {reserveAssistantRequest} from "../../src/modules/assistant/application/usage";
import {persistTelegramUpdates,stopSubscription} from "../../src/modules/assistant/application/telegram-inbox";
import {executeAssistantTool} from "../../src/modules/assistant/application/tools";
import {TelegramError} from "../../src/modules/assistant/infrastructure/telegram-api";
beforeEach(async()=>{await resetAndSeed();await db().assistantUsage.deleteMany();await db().telegramInbox.deleteMany();await db().assistantWorkerState.deleteMany();});
after(async()=>{await db().$disconnect();});
const actor="operador:teste";
async function subscription(){const code=await createTelegramLink(actor);assert(await consumeTelegramLink(code.code,"123456"));const sub=await db().telegramSubscription.findUniqueOrThrow({where:{chatId:"123456"}});await db().telegramSubscription.update({where:{id:sub.id},data:{linkedAt:new Date(Date.now()-3600000)}});return sub;}
async function occurrence(source:"DEVICE"|"SIMULATED"="DEVICE") {return db().occurrence.create({data:{organizationId:DEMO_ORG_ID,siteId:DEMO_SITE_ID,deviceId:DEMO_DEVICE_ID,title:"Suspeita de fluxo",description:"texto",kind:"UNUSUAL_FLOW",source,status:"OPEN",events:{create:{action:"CREATED",note:"NOTA PRIVADA NÃO ENVIAR",actor:"operador:privado"}}}});}

test("Assist · pareamento: hash armazenado, uso único concorrente, código expirado e chat inválido",async()=>{
 const link=await createTelegramLink(actor);assert.equal(await db().telegramLinkCode.count({where:{hash:link.code}}),0);
 const results=await Promise.all([consumeTelegramLink(link.code,"123456"),consumeTelegramLink(link.code,"654321")]);assert.equal(results.filter(Boolean).length,1);
 assert.equal(await consumeTelegramLink(link.code,"123456"),false);
 const old=await createTelegramLink(actor,new Date(Date.now()-11*60000));assert.equal(await consumeTelegramLink(old.code,"123456"),false);
 assert.equal(await consumeTelegramLink(link.code,"-100"),false);
});
test("Assist · scanner recupera eventos, deduplica concorrência e mantém SIMULATED fora por padrão",async()=>{
 const sub=await subscription();await occurrence();await occurrence("SIMULATED");await Promise.all([scanNotifications(),scanNotifications()]);
 const rows=await db().notificationDelivery.findMany();assert.equal(rows.length,1);assert(!JSON.stringify(rows).includes("NOTA PRIVADA"));assert(!JSON.stringify(rows).includes("operador:privado"));
 await db().telegramSubscription.update({where:{id:sub.id},data:{includeSimulated:true}});await scanNotifications();const all=await db().notificationDelivery.findMany();assert.equal(all.length,2);assert.match(JSON.stringify(all),/SIMULADO/);
});
test("Assist · fila: claims concorrentes não pegam a mesma entrega; lease vencido pode ser retomado",async()=>{
 await subscription();await occurrence();await scanNotifications();const claims=await Promise.all([claimDelivery(),claimDelivery()]);assert.equal(claims.filter(Boolean).length,1);
 await db().notificationDelivery.updateMany({data:{leasedUntil:new Date(Date.now()-1000)}});const recovered=await claimDelivery();assert(recovered);assert.equal(recovered.attempts,2);
});
test("Assist · Telegram indisponível mantém fila, respeita 429 e pode entregar após reinício",async()=>{
 await subscription();await occurrence();await scanNotifications();await deliverOne({send:async()=>{throw new TelegramError(429,60);}});
 const row=await db().notificationDelivery.findFirstOrThrow();assert.equal(row.status,"PENDING");assert(row.availableAt.getTime()>Date.now()+55000);assert.equal(row.lastError,"TELEGRAM_429");
 await db().notificationDelivery.update({where:{id:row.id},data:{availableAt:new Date(0)}});let sent=0;await deliverOne({send:async()=>{sent++;return{message_id:1};}});assert.equal(sent,1);assert.equal((await db().notificationDelivery.findUniqueOrThrow({where:{id:row.id}})).status,"SENT");
});
test("Assist · inbox confirma offset apenas com persistência e ignora grupos; repetição não duplica",async()=>{
 const u={update_id:1,message:{text:"/status",chat:{id:123,type:"private"},from:{id:123,is_bot:false}}};
 await persistTelegramUpdates([u,u,{update_id:2,message:{...u.message,chat:{id:-100,type:"group"}}}]);assert.equal(await db().telegramInbox.count(),1);assert.equal((await db().assistantWorkerState.findUniqueOrThrow({where:{key:"telegram"}})).offset,3n);
});
test("Assist · cota persistente e concorrente não ultrapassa limite; desligar cancela pendências",async()=>{
 process.env.ASSISTANT_MINUTE_REQUEST_LIMIT="2";const results=await Promise.allSettled(Array.from({length:6},()=>reserveAssistantRequest(actor)));assert.equal(results.filter(x=>x.status==="fulfilled").length,2);delete process.env.ASSISTANT_MINUTE_REQUEST_LIMIT;
 const sub=await subscription();await occurrence();await scanNotifications();await stopSubscription(sub.id);assert.equal(await claimDelivery(),null);assert.equal((await db().telegramSubscription.findUniqueOrThrow({where:{id:sub.id}})).active,false);
});
test("Assist · ferramentas usam o banco sem nomes de recebedor/verificador e sem inventar leitura",async()=>{
 const result=await executeAssistantTool("operation_summary",{range:"24h",source:"ALL"});const value=result.data as {kpis:{observedLiters:number|null}};assert.equal(value.kpis.observedLiters,null);assert(!JSON.stringify(result).includes("receivedBy"));await assert.rejects(executeAssistantTool("execute_sql",{}),/UNKNOWN_TOOL/);
});

test("Assist · inbox reutiliza resposta em retry e /stop registra auditoria",async()=>{
 const sub=await subscription();const u={update_id:10,message:{text:"/status",chat:{id:123456,type:"private"},from:{id:123456,is_bot:false}}};
 await persistTelegramUpdates([u]);
 const {processInboxOne}=await import("../../src/modules/assistant/application/telegram-inbox");
 await processInboxOne({send:async()=>{throw new TelegramError(429,1);}});
 const saved=await db().telegramInbox.findUniqueOrThrow({where:{updateId:10n}});assert(saved.replyText);assert.equal(saved.processedAt,null);
 await db().telegramInbox.update({where:{updateId:10n},data:{leasedUntil:new Date(0)}});let text="";await processInboxOne({send:async(_chat,body)=>{text=body;return{message_id:10};}});assert.equal(text,saved.replyText);assert.equal((await db().telegramInbox.findUniqueOrThrow({where:{updateId:10n}})).text,"[PROCESSADO]");
 await stopSubscription(sub.id);assert.equal(await db().auditEvent.count({where:{entity:"TelegramSubscription",entityId:sub.id,action:"DISCONNECTED"}}),1);
});
test("Assist · evidência e listagem não permitem consultar outra organização",async()=>{
 const other=await db().organization.create({data:{name:"Outra",sector:"teste",city:"teste"}});const site=await db().site.create({data:{organizationId:other.id,name:"outra"}});
 const o=await db().occurrence.create({data:{organizationId:other.id,siteId:site.id,title:"SEGREDO OUTRA ORGANIZAÇÃO",description:"",source:"MANUAL",kind:"MANUAL"}});
 await assert.rejects(executeAssistantTool("occurrence_evidence",{id:o.id}),/NOT_FOUND/);
 const result=await executeAssistantTool("active_occurrences",{});assert(!JSON.stringify(result).includes("SEGREDO OUTRA"));
});
