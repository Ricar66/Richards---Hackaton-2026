import { NextRequest, NextResponse } from "next/server";
import { IngestTelemetry, telemetrySchema } from "@/modules/monitoring/application/ingest-telemetry";
import { isDemo } from "@/lib/constants";
import { apiError, databaseUnavailable } from "@/lib/http";
export const runtime = "nodejs";
// Status HTTP fazem parte do contrato com o firmware (202 retira da fila, 422 descarta, demais retentam).
export async function POST(req: NextRequest) {
  const key=req.headers.get('x-device-key')??'';
  if(!key) return apiError(401,'DEVICE_KEY_REQUIRED','Credencial do dispositivo obrigatória');
  let body:unknown;
  try{body=await req.json()}catch{return apiError(400,'INVALID_JSON','JSON inválido')}
  const parsed=telemetrySchema.safeParse(body);
  if(!parsed.success)return NextResponse.json({error:'Telemetria inválida',code:'VALIDATION_ERROR',issues:parsed.error.issues},{status:422});
  try{return NextResponse.json(await new IngestTelemetry().execute(parsed.data,key, isDemo && req.headers.get("x-richards-simulator")==="true"),{status:202})}
  catch(e){const message=e instanceof Error?e.message:'unknown';
    if(message==='NOT_AUTHORIZED')return apiError(401,'NOT_AUTHORIZED','Credencial inválida');
    if(message==='CLOCK_SKEW')return apiError(422,'CLOCK_SKEW','Relógio do dispositivo fora da tolerância de 5 minutos');
    console.error('ingest telemetry',e);return databaseUnavailable();}
}
