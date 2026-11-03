import { NextRequest, NextResponse } from "next/server";
import { IngestTelemetry, telemetrySchema } from "@/modules/monitoring/application/ingest-telemetry";
import { isDemo } from "@/lib/constants";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const key=req.headers.get('x-device-key')??'';
  if(!key) return NextResponse.json({error:'Credencial do dispositivo obrigatória'},{status:401});
  let body:unknown;
  try{body=await req.json()}catch{return NextResponse.json({error:'JSON inválido'},{status:400})}
  const parsed=telemetrySchema.safeParse(body);
  if(!parsed.success)return NextResponse.json({error:'Telemetria inválida',issues:parsed.error.issues},{status:422});
  try{return NextResponse.json(await new IngestTelemetry().execute(parsed.data,key, isDemo && req.headers.get("x-richards-simulator")==="true"),{status:202})}
  catch(e){const message=e instanceof Error?e.message:'unknown';
    if(message==='NOT_AUTHORIZED')return NextResponse.json({error:'Credencial inválida'},{status:401});
    if(message==='CLOCK_SKEW')return NextResponse.json({error:'Relógio do dispositivo fora da tolerância de 5 minutos'},{status:422});
    console.error('ingest telemetry',e);return NextResponse.json({error:'Falha de persistência'},{status:503});}
}
