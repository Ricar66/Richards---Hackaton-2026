import { redactSecrets } from "../domain/contracts";
export class TelegramError extends Error { constructor(public code: number, public retryAfter?: number) { super(`TELEGRAM_${code}`); } }
/** Token só fica neste transporte servidor. Nunca registrar URL, corpo do erro ou objeto Request. */
export class TelegramApi {
  constructor(private token: string, private request: typeof fetch = fetch) { if (!/^[0-9]+:[A-Za-z0-9_-]+$/.test(token)) throw new Error("TELEGRAM_TOKEN_INVALID"); }
  async call<T>(method: "getMe" | "getUpdates" | "sendMessage", payload: Record<string, unknown> = {}): Promise<T> {
    let res: Response;
    try { res = await this.request(`https://api.telegram.org/bot${this.token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(method === "getUpdates" ? 30000 : 10000) }); }
    catch { throw new TelegramError(0); }
    let b: { ok?: boolean; result?: T; error_code?: number; parameters?: { retry_after?: number } };
    try { b = await res.json(); } catch { throw new TelegramError(res.status); }
    if (!res.ok || !b.ok) throw new TelegramError(b.error_code ?? res.status, b.parameters?.retry_after);
    return b.result as T;
  }
  send(chatId: string, text: string, url?: string | null) {
    return this.call<{ message_id: number }>("sendMessage", { chat_id: chatId, text: redactSecrets(text).slice(0,4000), link_preview_options: { is_disabled: true }, ...(url ? { reply_markup: { inline_keyboard: [[{ text: "Abrir RICHARDS", url }]] } } : {}) });
  }
}
