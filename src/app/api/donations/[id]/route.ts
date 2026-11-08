import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { actorFrom } from '@/lib/actor';
import { apiError, databaseUnavailable } from '@/lib/http';
import { DonationService } from '@/modules/donations/application/donation-service';
import { DonationRuleError, FOOD_ORIGINS } from '@/modules/donations/domain/donation-workflow';
import { passportPath } from '@/modules/donations/domain/passport';
import { publicBaseUrl } from '@/lib/public-url';
const text=(max:number)=>z.string().max(max).optional();
const schema=z.object({
 status:z.enum(['AVAILABLE','RESERVED','DELIVERED','CANCELLED']),verifiedBy:text(120),
 recipientId:text(64),receivedBy:text(120),reason:text(300),note:text(500),
 foodOrigin:z.enum(FOOD_ORIGINS).optional(),reviewerQualification:text(120),
 inspectionOk:z.boolean().optional(),conservationOk:z.boolean().optional(),
 validityOk:z.boolean().optional(),transportOk:z.boolean().optional(),
 // Equipamento de origem declarado na triagem; null = não estava em equipamento monitorado.
 originEquipmentId:z.string().max(64).nullable().optional(),
});
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 try{const d=await new DonationService().detail(id);
  return NextResponse.json({...d,passportUrl:d.passportToken?publicBaseUrl(req.headers)+passportPath(d.passportToken):null},{headers:{'Cache-Control':'no-store'}})}
 catch(e){if(e instanceof Error&&e.message==='NOT_FOUND')return apiError(404,'NOT_FOUND','Lote não encontrado');console.error('donation detail',e);return databaseUnavailable()}
}
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;let raw:unknown;try{raw=await req.json()}catch{return apiError(400,'INVALID_JSON','JSON inválido')}
 const p=schema.safeParse(raw);if(!p.success)return apiError(422,'VALIDATION_ERROR','Dados inválidos');
 try{return NextResponse.json(await new DonationService().transition(id,p.data,actorFrom(req)))}
 catch(e){
  if(e instanceof Error&&e.message==='NOT_FOUND')return apiError(404,'NOT_FOUND','Lote não encontrado');
  // Só mensagens de regra de negócio chegam ao cliente; erro interno fica no log do servidor.
  if(e instanceof DonationRuleError)return apiError(409,'INVALID_TRANSITION',e.message);
  console.error('donation transition',e);return databaseUnavailable();
 }
}
