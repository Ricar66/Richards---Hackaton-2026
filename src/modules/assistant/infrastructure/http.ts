import { actorFrom } from "@/lib/actor";
import { AssistantError } from "./config";
export function assistantActor(req: Request) {
  const actor=actorFrom(req);
  // O proxy autentica e sobrescreve o header. AUTH_MODE=none nunca libera a IA paga nem vinculação.
  if (!actor.startsWith("operador:")) throw new AssistantError("ASSISTANT_AUTH_REQUIRED",403);
  return actor;
}
export async function boundedJson(req: Request, max=16000): Promise<unknown> {
  const reader=req.body?.getReader(); if(!reader)throw new AssistantError("INVALID_JSON",400);
  const chunks:Uint8Array[]=[];let size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new AssistantError("REQUEST_TOO_LARGE",413);}chunks.push(value);}}
  finally{reader.releaseLock();}
  try{return JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new AssistantError("INVALID_JSON",400);}
}
