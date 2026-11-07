import { z } from "zod";
export const chatMessage = z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(2000) }).strict();
export const chatRequest = z.object({ message: z.string().trim().min(1).max(2000), history: z.array(chatMessage).max(6).default([]) }).strict();
export type ChatMessage = z.infer<typeof chatMessage>;
export type AssistantAnswer = { answer: string; sources: { label: string; href: string }[]; generatedAt: string; model: string; usage: { inputTokens: number; outputTokens: number } };
export const toolArguments = {
  operation_summary: z.object({ range: z.enum(["24h", "7d", "30d"]), source: z.enum(["ALL", "DEVICE", "SIMULATED", "MANUAL"]) }).strict(),
  active_occurrences: z.object({}).strict(),
  occurrence_evidence: z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/) }).strict(),
  product_help: z.object({ topic: z.enum(["produto", "agua", "alimentos", "iot", "limites"]) }).strict(),
};
export type ToolName = keyof typeof toolArguments;
/** Não guardar ou enviar acidentalmente chaves coladas na conversa. Não é um detector universal de dados pessoais. */
export function redactSecrets(text: string) {
  return text.replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|\d{6,}:[A-Za-z0-9_-]{25,})\b/g, "[CREDENCIAL REMOVIDA]").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}
export function privateTelegramUpdate(raw: unknown): { updateId: number; chatId: string; text: string } | null {
  const schema = z.object({ update_id: z.number().int().nonnegative().safe(), message: z.object({ text: z.string().max(2000), chat: z.object({ id: z.number().int().positive().safe(), type: z.literal("private") }), from: z.object({ id: z.number().int().positive().safe(), is_bot: z.literal(false) }) }) });
  const p = schema.safeParse(raw);
  if (!p.success || p.data.message.from.id !== p.data.message.chat.id) return null;
  return { updateId: p.data.update_id, chatId: String(p.data.message.chat.id), text: redactSecrets(p.data.message.text.trim()) };
}
export function retryDelay(attempt: number, retryAfter?: number) { return retryAfter && Number.isFinite(retryAfter) ? Math.max(1000, retryAfter * 1000) : Math.max(1000, Math.min(900, 2 ** Math.min(attempt, 10)) * 1000); }
export function operationalUrl(base: string, path: string): string | null {
  try { const u = new URL(base); if (!["https:", "http:"].includes(u.protocol) || u.username || u.password || u.search || u.hash) return null; return new URL(path, u.origin).href; } catch { return null; }
}
