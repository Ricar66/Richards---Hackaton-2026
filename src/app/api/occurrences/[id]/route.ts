import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OccurrenceService } from "@/modules/monitoring/application/occurrence-service";
import { actorFrom } from "@/lib/actor";
import { apiError, databaseUnavailable } from "@/lib/http";
const schema=z.object({status:z.enum(['ACKNOWLEDGED','RESOLVED','DISMISSED']),note:z.string().max(500).default('')});
export const runtime='nodejs';
const known:Record<string,[number,string]>={
 NOT_FOUND:[404,'Não encontrado'],INVALID_TRANSITION:[409,'Transição inválida'],
 RESOLUTION_NOTE_REQUIRED:[409,'Informe a verificação e a ação tomada'],
 CONFLICT:[409,'A ocorrência foi alterada por outra ação. Atualize e tente novamente.'],
};
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params; let raw:unknown;try{raw=await req.json()}catch{return apiError(400,'INVALID_JSON','JSON inválido')}
 const p=schema.safeParse(raw); if(!p.success)return apiError(422,'VALIDATION_ERROR','Dados inválidos');
 try{const updated=await new OccurrenceService().transition(id,p.data.status,p.data.note,actorFrom(req));return NextResponse.json(updated)}
 catch(e){const m=e instanceof Error?e.message:'';const hit=known[m];if(hit)return apiError(hit[0],m,hit[1]);console.error('occurrence transition',e);return databaseUnavailable()}
}
