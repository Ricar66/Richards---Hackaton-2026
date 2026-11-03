import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OccurrenceService } from "@/modules/monitoring/application/occurrence-service";
const schema=z.object({status:z.enum(['ACKNOWLEDGED','RESOLVED','DISMISSED']),note:z.string().max(500).default('')});
export const runtime='nodejs';
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params; let raw:unknown;try{raw=await req.json()}catch{return NextResponse.json({error:'JSON inválido'},{status:400})}
 const p=schema.safeParse(raw); if(!p.success)return NextResponse.json({error:'Dados inválidos'},{status:422});
 try{const updated=await new OccurrenceService().transition(id,p.data.status,p.data.note);return NextResponse.json({id:updated.id,status:updated.status})}
 catch(e){const m=e instanceof Error?e.message:'';return NextResponse.json({error:m==='NOT_FOUND'?'Não encontrado':m==='INVALID_TRANSITION'?'Transição inválida':m==='RESOLUTION_NOTE_REQUIRED'?'Informe a verificação e a ação tomada':'Banco indisponível'},{status:m==='NOT_FOUND'?404:m==='INVALID_TRANSITION'||m==='RESOLUTION_NOTE_REQUIRED'?409:503})}
}
