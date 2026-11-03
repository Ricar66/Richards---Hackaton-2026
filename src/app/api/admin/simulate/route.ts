import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { DEMO_ORG_ID,DEMO_SITE_ID,DEMO_DEVICE_ID,isDemo } from '@/lib/constants';
export const runtime='nodejs';
/** DEMO ONLY: never enable on a public environment. Protected by operator HTTP Basic auth in proxy. */
export async function POST(req:NextRequest){
 if(!isDemo)return NextResponse.json({error:'Desabilitado'},{status:404});
 const json=await req.json().catch(()=>({}));if(json?.scenario!=='flow')return NextResponse.json({error:'Cenário não suportado'},{status:422});
 try{const db=getDb();const occ=await db.occurrence.create({data:{organizationId:DEMO_ORG_ID,siteId:DEMO_SITE_ID,deviceId:DEMO_DEVICE_ID,kind:'UNUSUAL_FLOW',severity:'HIGH',status:'OPEN',source:'SIMULATED',title:'Alerta de demonstração · fluxo suspeito',description:'Ocorrência simulada via painel. Não representa medição física.',suspectedLiters:3.6,events:{create:{action:'CREATED',note:'Gerado pelo simulador, sem sensor físico'}}}});
 return NextResponse.json({id:occ.id,status:occ.status,source:'SIMULATED'},{status:201})}
 catch{return NextResponse.json({error:'Banco não disponível'},{status:503})}
}
