import { NextResponse } from "next/server";
import { chatRequest } from "@/modules/assistant/domain/contracts";
import { answerQuestion } from "@/modules/assistant/application/answer";
import { reserveAssistantRequest } from "@/modules/assistant/application/usage";
import { assistantActor, boundedJson } from "@/modules/assistant/infrastructure/http";
import { AssistantError, assistantConfig } from "@/modules/assistant/infrastructure/config";
import { apiError } from "@/lib/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:Request){
  try {
    const actor=assistantActor(req), c=assistantConfig();
    if(c.ASSISTANT_ENABLED!=="true"||!c.OPENAI_API_KEY)throw new AssistantError("ASSISTANT_NOT_CONFIGURED");
    const p=chatRequest.safeParse(await boundedJson(req)); if(!p.success)return apiError(422,"VALIDATION_ERROR","Pergunta ou histórico inválido.");
    await reserveAssistantRequest(actor);
    return NextResponse.json(await answerQuestion(p.data.message,p.data.history),{headers:{"Cache-Control":"no-store"}});
  }catch(error){const e=error instanceof AssistantError ? error : new AssistantError("ASSISTANT_UNAVAILABLE");return apiError(e.status,e.code,e.status===429 ? "Limite de uso atingido. Aguarde; os alertas continuam independentes da IA." : "Assistente indisponível. Confira configuração e banco; nenhum dado foi substituído.");}
}
