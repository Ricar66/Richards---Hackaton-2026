import { createHash, randomBytes } from "node:crypto";
import { getDb } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
import { actorHash } from "./usage";
import { auditRecord } from "@/modules/audit/infrastructure/audit-record";
export const hashLinkCode = (code: string) => createHash("sha256").update(code).digest("hex");
export async function createTelegramLink(actor: string, now = new Date()) {
  const code = randomBytes(24).toString("hex"), hash = hashLinkCode(code), expiresAt = new Date(now.getTime()+10*60000);
  await getDb().$transaction(async tx => {
    await tx.telegramLinkCode.create({ data: { hash, organizationId: DEMO_ORG_ID, actorHash: actorHash(actor), expiresAt } });
    await tx.auditEvent.create({ data: auditRecord({ organizationId: DEMO_ORG_ID, entity: "TelegramLink", entityId: hash.slice(0,12), action: "CREATED", actor, metadata: { expiresAt: expiresAt.toISOString() } }) });
  });
  return { code, expiresAt: expiresAt.toISOString() };
}
/** Código aleatório, de uso único, somente entregue ao operador autenticado. Nunca aceitar chatId vindo do navegador. */
export async function consumeTelegramLink(code: string, chatId: string, now = new Date()) {
  if (!/^[a-f0-9]{48}$/.test(code) || !/^[1-9][0-9]{0,19}$/.test(chatId)) return false;
  return getDb().$transaction(async tx => {
    const hash = hashLinkCode(code);
    const link = await tx.telegramLinkCode.findUnique({ where: { hash } });
    if (!link || link.organizationId !== DEMO_ORG_ID || link.consumedAt || link.expiresAt <= now) return false;
    // Chat existente só pode ser revinculado ao mesmo workspace/operador. Desvincule antes de trocar operador.
    const existing = await tx.telegramSubscription.findUnique({ where: { chatId } });
    if (existing && (existing.organizationId !== link.organizationId || existing.actorHash !== link.actorHash)) return false;
    const claimed = await tx.telegramLinkCode.updateMany({ where: { hash, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
    if (!claimed.count) return false;
    const sub = await tx.telegramSubscription.upsert({ where: { chatId }, create: { chatId, organizationId: link.organizationId, actorHash: link.actorHash, linkedAt: now }, update: { active: true, linkedAt: now, history: [], historyAt: null } });
    await tx.auditEvent.create({ data: auditRecord({ organizationId: link.organizationId, entity: "TelegramSubscription", entityId: sub.id, action: "LINKED", actor: "telegram:pareamento", metadata: {} }) });
    return true;
  });
}
