import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
import { deviceConnectivity } from "@/modules/monitoring/domain/device-connectivity";
import type { Prisma } from "@/generated/prisma/client";
import { assistantConfig } from "../infrastructure/config";
import { TelegramApi, TelegramError } from "../infrastructure/telegram-api";
import { operationalUrl, retryDelay } from "../domain/contracts";
import { executeAssistantTool } from "./tools";

type Payload = { text: string; path: string; occurrenceId?: string; deviceId?: string; lastSeen?: string };
const actionLabel: Record<string, string> = { CREATED: "Ocorrência aberta", ACKNOWLEDGED: "Investigação assumida", RESOLVED: "Ocorrência resolvida", DISMISSED: "Ocorrência descartada" };
const clock = (date: Date) => date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
export async function enqueueDelivery(subscriptionId: string, dedupeKey: string, kind: string, payload: Payload, now = new Date()) {
  return getDb().notificationDelivery.createMany({ data: [{ subscriptionId, dedupeKey, kind, payload: payload as Prisma.InputJsonValue, availableAt: now }], skipDuplicates: true });
}

/** Varredura durável sobre fatos persistidos. Não depende de LISTEN/NOTIFY nem toca na ingestão crítica.
 * Anti-join + chave única recuperam fatos após reinício sem varrer somente uma janela que poderia perder eventos. */
export async function scanNotifications(now = new Date()) {
  const db = getDb(), c = assistantConfig();
  const subscriptions = await db.telegramSubscription.findMany({ where: { organizationId: DEMO_ORG_ID, active: true }, take: 100 });
  for (const sub of subscriptions) {
    const rows = await db.$queryRaw<{ id: string; occurrenceId: string; action: string; at: Date; title: string; source: string; status: string }[]>`
      SELECT e.id,e."occurrenceId",e.action,e.at,o.title,o.source::text,o.status::text
      FROM "OccurrenceEvent" e JOIN "Occurrence" o ON o.id=e."occurrenceId"
      WHERE o."organizationId"=${DEMO_ORG_ID} AND e.at >= ${sub.linkedAt}
        AND e.action IN ('CREATED','ACKNOWLEDGED','RESOLVED','DISMISSED')
        AND (${sub.includeSimulated} OR o.source::text <> 'SIMULATED')
        AND NOT EXISTS (SELECT 1 FROM "NotificationDelivery" n WHERE n."dedupeKey"=${sub.id} || ':event:' || e.id)
      ORDER BY e.at,e.id LIMIT 100`;
    for (const e of rows) {
      // Textos são template determinístico; origem e instante nunca vêm da IA. Não incluir nota/autor/recebedor.
      await enqueueDelivery(sub.id, `${sub.id}:event:${e.id}`, "OCCURRENCE", { text: `${actionLabel[e.action]} · ${e.source === "SIMULATED" ? "SIMULADO" : e.source}\n${e.title.slice(0,180)}\nRegistrado em ${clock(e.at)}.\nSuspeita exige verificação humana. Consulte a evidência e o estado atual no BI.`, path: `/ocorrencias?oc=${encodeURIComponent(e.occurrenceId)}` }, now);
    }
    const pending = await db.occurrence.findMany({ where: { organizationId: DEMO_ORG_ID, status: "OPEN", openedAt: { gte: sub.linkedAt, lte: new Date(now.getTime()-c.ASSISTANT_ESCALATION_MINUTES*60000) }, ...(sub.includeSimulated ? {} : { source: { not: "SIMULATED" as const } }) }, take: 100 });
    for (const o of pending) await enqueueDelivery(sub.id, `${sub.id}:escalation:${o.id}`, "ESCALATION", { occurrenceId: o.id, text: `Lembrete de investigação · ${o.source === "SIMULATED" ? "SIMULADO" : o.source}\n${o.title.slice(0,180)}\nAberta há pelo menos ${c.ASSISTANT_ESCALATION_MINUTES} minutos e ainda sem investigação assumida no momento da checagem.`, path: `/ocorrencias?oc=${encodeURIComponent(o.id)}` }, now);
    const devices = await db.device.findMany({ where: { organizationId: DEMO_ORG_ID }, take: 100 });
    for (const d of devices) if (deviceConnectivity(d.state, d.lastSeenAt, now) === "OFFLINE" && d.lastSeenAt) {
      const lastReading = await db.telemetryReading.findFirst({ where: { deviceId: d.id }, orderBy: { receivedAt: "desc" }, select: { source: true } });
      if (lastReading?.source === "SIMULATED" && !sub.includeSimulated) continue;
      const origin = lastReading?.source === "SIMULATED" ? "SIMULADO" : "conectividade do cadastro; origem do último contato não inferida";
      await enqueueDelivery(sub.id, `${sub.id}:offline:${d.id}:${d.lastSeenAt.toISOString()}`, "OFFLINE", { deviceId: d.id, lastSeen: d.lastSeenAt.toISOString(), text: `Dispositivo sem comunicação · ${origin}\n${d.code}\nÚltimo contato: ${clock(d.lastSeenAt)}. Mais de 120 segundos sem pacote.\nIsso não prova que o equipamento está desligado; confira rede e alimentação. A origem da última amostra não foi inferida.`, path: "/dispositivos" }, now);
    }
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const part = (type: string) => parts.find(p=>p.type===type)?.value;
    const day = `${part("year")}-${part("month")}-${part("day")}`;
    if (sub.dailySummary && Number(part("hour")) >= c.ASSISTANT_SUMMARY_HOUR) {
      const key = `${sub.id}:summary:${day}`;
      if (!await db.notificationDelivery.findUnique({ where: { dedupeKey: key }, select: { id: true } })) {
        const text = await deterministicSummary(sub.includeSimulated);
        await enqueueDelivery(sub.id, key, "SUMMARY", { text, path: "/relatorios?range=24h" }, now);
      }
    }
  }
}
export async function deterministicSummary(includeSimulated = false) {
  const sources=includeSimulated ? ["DEVICE","MANUAL","SIMULATED"] : ["DEVICE","MANUAL"];
  const lines=["Resumo · últimas 24 h · origens separadas"];
  for(const source of sources){
    const result=await executeAssistantTool("operation_summary",{range:"24h",source});
    const d=result.data as {generatedAt:string;kpis:{observedLiters:number|null;activeOccurrences:number;deliveredKg:number}};
    lines.push(`\n${source==="SIMULATED"?"SIMULADO":source} · consulta ${clock(new Date(d.generatedAt))}\nVolume observado: ${d.kpis.observedLiters===null?"sem dados":`${d.kpis.observedLiters.toLocaleString("pt-BR")} L`}\nOcorrências ativas: ${d.kpis.activeOccurrences}\nKg entregues: ${d.kpis.deliveredKg.toLocaleString("pt-BR")}`);
  }
  lines.push("\nObservado não significa economizado. Apenas entregas confirmadas entram nos kg. Sem estimativa de economia.");
  return lines.join("\n");
}

type Claimed = { id: string; subscriptionId: string; kind: string; payload: unknown; attempts: number };
export async function claimDelivery(now = new Date()) {
  const token = randomUUID(), until = new Date(now.getTime()+60_000);
  const rows = await getDb().$queryRaw<Claimed[]>`WITH candidate AS (
    SELECT n.id FROM "NotificationDelivery" n JOIN "TelegramSubscription" s ON s.id=n."subscriptionId"
    WHERE n.status='PENDING' AND n."availableAt" <= ${now} AND (n."leasedUntil" IS NULL OR n."leasedUntil" < ${now}) AND n.attempts < 8 AND s.active=true AND s."organizationId"=${DEMO_ORG_ID}
    ORDER BY n."availableAt",n.id FOR UPDATE OF n SKIP LOCKED LIMIT 1)
    UPDATE "NotificationDelivery" n SET "leaseToken"=${token},"leasedUntil"=${until},attempts=n.attempts+1 FROM candidate c WHERE n.id=c.id RETURNING n.id,n."subscriptionId",n.kind,n.payload,n.attempts`;
  return rows[0] ? { ...rows[0], token } : null;
}
export async function deliverOne(api: Pick<TelegramApi,"send">, now = new Date()) {
  const row = await claimDelivery(now); if (!row) return false;
  const db = getDb(), sub = await db.telegramSubscription.findFirst({ where: { id: row.subscriptionId, organizationId: DEMO_ORG_ID, active: true } });
  const p = row.payload as Payload;
  let valid = !!sub;
  if (valid && row.kind === "ESCALATION") valid = !!await db.occurrence.findFirst({ where: { id: p.occurrenceId, organizationId: DEMO_ORG_ID, status: "OPEN" } });
  if (valid && row.kind === "OFFLINE") {
    const d = await db.device.findFirst({ where: { id: p.deviceId, organizationId: DEMO_ORG_ID } });
    valid = !!d && d.lastSeenAt?.toISOString() === p.lastSeen && deviceConnectivity(d.state,d.lastSeenAt,new Date()) === "OFFLINE";
  }
  const where = { id: row.id, leaseToken: row.token };
  if (!valid) { await db.notificationDelivery.updateMany({ where, data: { status: "SKIPPED", leaseToken: null, leasedUntil: null } }); return true; }
  try {
    await api.send(sub!.chatId, p.text, operationalUrl(assistantConfig().ASSISTANT_BASE_URL,p.path));
    await db.notificationDelivery.updateMany({ where, data: { status: "SENT", sentAt: new Date(), lastError: null, leaseToken: null, leasedUntil: null } });
  } catch (error) {
    const code = error instanceof TelegramError ? error.code : 0;
    const permanent = [400,401,403].includes(code) || row.attempts >= 8;
    await db.notificationDelivery.updateMany({ where, data: { status: permanent ? "DEAD" : "PENDING", lastError: `TELEGRAM_${code}`, leaseToken: null, leasedUntil: null, availableAt: new Date(Date.now()+retryDelay(row.attempts,error instanceof TelegramError ? error.retryAfter : undefined)) } });
    if (code === 403) await db.telegramSubscription.updateMany({ where: { id: row.subscriptionId }, data: { active: false } });
  }
  return true;
}
