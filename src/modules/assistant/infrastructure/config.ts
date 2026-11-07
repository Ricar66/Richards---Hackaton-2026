import { z } from "zod";
const integer = (fallback: number, max: number) => z.coerce.number().int().min(1).max(max).default(fallback);
export function assistantConfig(env: NodeJS.ProcessEnv = process.env) {
  return z.object({
    ASSISTANT_ENABLED: z.enum(["true", "false"]).default("false"),
    OPENAI_API_KEY: z.string().default(""), OPENAI_MODEL: z.string().min(1).max(100).default("gpt-4.1-mini"),
    ASSISTANT_DAILY_REQUEST_LIMIT: integer(200, 10000), ASSISTANT_MINUTE_REQUEST_LIMIT: integer(6, 60),
    TELEGRAM_ENABLED: z.enum(["true", "false"]).default("false"), TELEGRAM_BOT_TOKEN: z.string().default(""),
    TELEGRAM_BOT_USERNAME: z.string().regex(/^$|^[A-Za-z0-9_]{5,64}$/).default(""),
    ASSISTANT_BASE_URL: z.string().default(""), ASSISTANT_ESCALATION_MINUTES: integer(15, 1440),
    ASSISTANT_SUMMARY_HOUR: z.coerce.number().int().min(0).max(23).default(8),
  }).parse(env);
}
export class AssistantError extends Error {
  constructor(public code: string, public status = 503) { super(code); }
}
