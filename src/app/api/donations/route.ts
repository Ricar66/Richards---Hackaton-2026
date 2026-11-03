import { NextRequest, NextResponse } from "next/server";
import { z } from 'zod';
import { actorFrom } from '@/lib/actor';
import { apiError, databaseUnavailable } from '@/lib/http';
import { DonationService } from '@/modules/donations/application/donation-service';
export const runtime='nodejs';
const schema=z.object({description:z.string().trim().min(4).max(180),weightKg:z.number().gt(0).max(100000)});
export async function POST(req:NextRequest){let raw:unknown;try{raw=await req.json()}catch{return apiError(400,'INVALID_JSON','JSON inválido')}
 const p=schema.safeParse(raw);if(!p.success)return apiError(422,'VALIDATION_ERROR','Lote inválido');
 try{return NextResponse.json(await new DonationService().create(p.data,actorFrom(req)),{status:201})}
 catch(e){console.error('donation create',e);return databaseUnavailable()}}
