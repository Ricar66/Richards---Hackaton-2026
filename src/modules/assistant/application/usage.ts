import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
import { AssistantError, assistantConfig } from "../infrastructure/config";
export const actorHash = (actor: string) => createHash("sha256").update(actor).digest("hex");
/** Limites persistidos e atômicos entre processos. Cobram tentativa mesmo se o provedor falhar. */
export async function reserveAssistantRequest(actor: string, now = new Date()) {
  const c = assistantConfig();
  await getDb().$transaction(async tx => {
    for (const [key, limit] of [[`${DEMO_ORG_ID}:day:${now.toISOString().slice(0,10)}`, c.ASSISTANT_DAILY_REQUEST_LIMIT], [`${DEMO_ORG_ID}:minute:${actorHash(actor)}:${Math.floor(now.getTime()/60000)}`, c.ASSISTANT_MINUTE_REQUEST_LIMIT]] as const) {
      const rows = await tx.$queryRaw<{ count: number }[]>`INSERT INTO "AssistantUsage" (key,count) VALUES (${key},1) ON CONFLICT (key) DO UPDATE SET count="AssistantUsage".count+1 WHERE "AssistantUsage".count < ${limit} RETURNING count`;
      if (!rows.length) throw new AssistantError("ASSISTANT_USAGE_LIMIT", 429);
    }
  });
}
