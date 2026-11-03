import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { actorFrom } from '@/lib/actor';
import { apiError, databaseUnavailable } from '@/lib/http';
import { DonationService } from '@/modules/donations/application/donation-service';
import { DonationRuleError } from '@/modules/donations/domain/donation-workflow';
const schema=z.object({status:z.enum(['AVAILABLE','RESERVED','DELIVERED','CANCELLED']),verifiedBy:z.string().max(120).optional()});
export const runtime='nodejs';
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;let raw:unknown;try{raw=await req.json()}catch{return apiError(400,'INVALID_JSON','JSON inválido')}
 const p=schema.safeParse(raw);if(!p.success)return apiError(422,'VALIDATION_ERROR','Dados inválidos');
 try{return NextResponse.json(await new DonationService().transition(id,p.data.status,p.data.verifiedBy,actorFrom(req)))}
 catch(e){
  if(e instanceof Error&&e.message==='NOT_FOUND')return apiError(404,'NOT_FOUND','Lote não encontrado');
  // Só mensagens de regra de negócio chegam ao cliente; erro interno fica no log do servidor.
  if(e instanceof DonationRuleError)return apiError(409,'INVALID_TRANSITION',e.message);
  console.error('donation transition',e);return databaseUnavailable();
 }
}
