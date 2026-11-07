import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
import { apiError } from "@/lib/http";
import { actorHash } from "@/modules/assistant/application/usage";
import { createTelegramLink } from "@/modules/assistant/application/telegram-links";
import { stopSubscription } from "@/modules/assistant/application/telegram-inbox";
import { assistantActor, boundedJson } from "@/modules/assistant/infrastructure/http";
import { AssistantError, assistantConfig } from "@/modules/assistant/infrastructure/config";
import { auditRecord } from "@/modules/audit/infrastructure/audit-record";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("link")}).strict(),
  z.object({action:z.literal("preferences"),id:z.string().max(100),includeSimulated:z.boolean(),dailySummary:z.boolean()}).strict(),
  z.object({action:z.literal("disconnect"),id:z.string().max(100)}).strict(),
]);
const failure=(e:unknown)=>e instanceof AssistantError ? apiError(e.status,e.code,"Operação não disponível.") : apiError(503,"ASSISTANT_UNAVAILABLE","Confira configuração e migração do assistente.");
export async function GET(req:Request){
  try{
    const actor=assistantActor(req),c=assistantConfig();
    const base={aiEnabled:c.ASSISTANT_ENABLED==="true"&&!!c.OPENAI_API_KEY,telegramEnabled:c.TELEGRAM_ENABLED==="true"&&!!c.TELEGRAM_BOT_TOKEN&&!!c.TELEGRAM_BOT_USERNAME,model:c.OPENAI_MODEL,dailyLimit:c.ASSISTANT_DAILY_REQUEST_LIMIT};
    if(c.ASSISTANT_ENABLED!=="true"&&c.TELEGRAM_ENABLED!=="true")return NextResponse.json({...base,subscriptions:[],workerHeartbeat:null,pending:0,dead:0},{headers:{"Cache-Control":"no-store"}});
    const db=getDb();
    const subscriptions=await db.telegramSubscription.findMany({where:{organizationId:DEMO_ORG_ID,actorHash:actorHash(actor)},select:{id:true,chatId:true,active:true,includeSimulated:true,dailySummary:true,linkedAt:true}});
    const ids=subscriptions.map(s=>s.id);
    const [worker,pending,dead]=await Promise.all([db.assistantWorkerState.findUnique({where:{key:"telegram"}}),db.notificationDelivery.count({where:{subscriptionId:{in:ids},status:"PENDING"}}),db.notificationDelivery.count({where:{subscriptionId:{in:ids},status:"DEAD"}})]);
    return NextResponse.json({...base,subscriptions:subscriptions.map(s=>({...s,chatId:`•••${s.chatId.slice(-4)}`})),workerHeartbeat:worker?.heartbeatAt?.toISOString()??null,pending,dead},{headers:{"Cache-Control":"no-store"}});
  }catch(e){return failure(e);}
}
export async function POST(req:Request){
  try{
    const actor=assistantActor(req),c=assistantConfig(),p=schema.safeParse(await boundedJson(req,4000));
    if(!p.success)return apiError(422,"VALIDATION_ERROR","Dados inválidos.");
    if(p.data.action==="link"){
      if(c.TELEGRAM_ENABLED!=="true"||!c.TELEGRAM_BOT_TOKEN||!c.TELEGRAM_BOT_USERNAME)throw new AssistantError("TELEGRAM_NOT_CONFIGURED");
      const link=await createTelegramLink(actor);
      return NextResponse.json({url:`https://t.me/${c.TELEGRAM_BOT_USERNAME}?start=${link.code}`,expiresAt:link.expiresAt},{headers:{"Cache-Control":"no-store"}});
    }
    const sub=await getDb().telegramSubscription.findFirst({where:{id:p.data.id,organizationId:DEMO_ORG_ID,actorHash:actorHash(actor)}});
    if(!sub)throw new AssistantError("NOT_FOUND",404);
    if(p.data.action==="disconnect")await stopSubscription(sub.id,actor);
    else {
      const data=p.data;
      await getDb().$transaction(async tx=>{
        await tx.telegramSubscription.update({where:{id:sub.id},data:{includeSimulated:data.includeSimulated,dailySummary:data.dailySummary}});
        await tx.auditEvent.create({data:auditRecord({organizationId:DEMO_ORG_ID,entity:"TelegramSubscription",entityId:sub.id,action:"PREFERENCES",actor,metadata:{includeSimulated:data.includeSimulated,dailySummary:data.dailySummary}})});
      });
    }
    return NextResponse.json({ok:true});
  }catch(e){return failure(e);}
}
