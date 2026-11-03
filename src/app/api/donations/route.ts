import { NextRequest, NextResponse } from "next/server";
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { DEMO_ORG_ID } from '@/lib/constants';
export const runtime='nodejs';
const schema=z.object({description:z.string().trim().min(4).max(180),weightKg:z.number().gt(0).max(100000)});
export async function POST(req:NextRequest){let raw:unknown;try{raw=await req.json()}catch{return NextResponse.json({error:'JSON inválido'},{status:400})}
 const p=schema.safeParse(raw);if(!p.success)return NextResponse.json({error:'Lote inválido'},{status:422});
 try{const db=getDb();const item=await db.donationBatch.create({data:{organizationId:DEMO_ORG_ID,description:p.data.description,weightKg:p.data.weightKg,status:'PENDING_REVIEW',source:'MANUAL'}});return NextResponse.json({id:item.id,status:item.status},{status:201})}
 catch{return NextResponse.json({error:'Banco não disponível'},{status:503})}}
