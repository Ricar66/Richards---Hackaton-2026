import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { DEMO_ORG_ID, DEMO_RECIPIENT_ID } from '@/lib/constants';
import { DonationWorkflow } from '@/modules/donations/domain/donation-workflow';
const schema=z.object({status:z.enum(['AVAILABLE','RESERVED','DELIVERED','CANCELLED']),verifiedBy:z.string().max(120).optional()});
export const runtime='nodejs';
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;let raw:unknown;try{raw=await req.json()}catch{return NextResponse.json({error:'JSON inválido'},{status:400})}
 const p=schema.safeParse(raw);if(!p.success)return NextResponse.json({error:'Dados inválidos'},{status:422});
 try{
  const db=getDb();const old=await db.donationBatch.findFirst({where:{id,organizationId:DEMO_ORG_ID}});
  if(!old)return NextResponse.json({error:'Lote não encontrado'},{status:404});
  const verified=Boolean(old.safetyVerifiedAt)||(p.data.status==='AVAILABLE'&&Boolean(p.data.verifiedBy&&p.data.verifiedBy.trim().length>=3));
  const recipient=Boolean(old.recipientId)||p.data.status==='RESERVED';
  DonationWorkflow.assertTransition(old.status,p.data.status,verified,recipient);
  const d=await db.donationBatch.update({where:{id},data:{status:p.data.status,
    safetyVerifiedAt:p.data.status==='AVAILABLE'?new Date():undefined,
    safetyVerifiedBy:p.data.status==='AVAILABLE'?p.data.verifiedBy:undefined,
    recipientId:p.data.status==='RESERVED'?DEMO_RECIPIENT_ID:undefined,
    receivedAt:p.data.status==='DELIVERED'?new Date():undefined}});
  return NextResponse.json({id:d.id,status:d.status});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Falha na transição'},{status:409})}
}
