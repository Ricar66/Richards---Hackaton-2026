import { NextRequest, NextResponse } from 'next/server';
import { DEMO_ORG_ID,DEMO_SITE_ID,DEMO_DEVICE_ID,isDemo } from '@/lib/constants';
import { actorFrom } from '@/lib/actor';
import { apiError, databaseUnavailable } from '@/lib/http';
import { openFlowOccurrence } from '@/modules/monitoring/application/open-flow-occurrence';
export const runtime='nodejs';
/** DEMO ONLY: never enable on a public environment. Protected by operator HTTP Basic auth in proxy. */
export async function POST(req:NextRequest){
 if(!isDemo)return apiError(404,'DISABLED','Desabilitado');
 const json=await req.json().catch(()=>({}));if(json?.scenario!=='flow')return apiError(422,'UNSUPPORTED_SCENARIO','Cenário não suportado');
 const actor=actorFrom(req);
 try{
  // Mesma regra da telemetria: não abre segunda ocorrência enquanto houver uma ativa para o sensor.
  const r=await openFlowOccurrence({organizationId:DEMO_ORG_ID,siteId:DEMO_SITE_ID,deviceId:DEMO_DEVICE_ID,source:'SIMULATED',
   title:'Alerta de demonstração · fluxo suspeito',description:'Ocorrência simulada via painel. Não representa medição física.',suspectedLiters:3.6,
   eventNote:'Gerado pelo simulador, sem sensor físico',actor:`simulador:${actor}`,evidence:{scenario:'flow'}});
  if(!r.created)return apiError(409,'ACTIVE_OCCURRENCE_EXISTS','Já existe uma ocorrência de fluxo SIMULADA ativa para este sensor. Resolva-a antes de simular outra (uma ocorrência real não é afetada).');
  return NextResponse.json({id:r.occurrenceId,status:'OPEN',source:'SIMULATED'},{status:201});
 }catch(e){console.error('simulate',e);return databaseUnavailable()}
}
