import { randomBytes } from "node:crypto";
import { DEMO_ORG_ID } from "@/lib/constants";
import { getDb } from "@/lib/db";
import { ingestReading,type IngestDevice,type IngestReading,type IngestResult } from "@/modules/monitoring/application/ingest-telemetry";
import { DEFAULT_MAX_GAP_SECONDS } from "@/modules/monitoring/domain/flow-alert-policy";
import { notifyLiveSafe } from "@/modules/realtime/infrastructure/notify-event";
import { mqttPayloadSchema,type MqttBridgeConfig } from "./mqtt-payload";
export type MqttProcessed={status:"processed";deviceCode:string;flow?:IngestResult&{source:"DEVICE"|"SIMULATED";sequence:number}};
export type MqttOutcome={status:"rejected";reason:string}|MqttProcessed;
export type MqttMessage={device:IngestDevice;at:Date;receivedAt:Date;flow:{source:"DEVICE"|"SIMULATED";sequence:number;reading:IngestReading};done:{flow?:IngestResult}};
/** Somente vazão. Campos adicionais de firmware antigo são descartados, sem outros efeitos operacionais. */
export class MqttIngestion{
 readonly bootId=`mqtt-${randomBytes(4).toString("hex")}`;
 readonly channel:"mqtt"|"bancada-virtual";
 private readonly memory=new Map<string,{sequence:number;lastFlowAt?:Date}>();
 private readonly rejectedAt=new Map<string,number>();
 constructor(private readonly cfg:MqttBridgeConfig,private readonly now:()=>Date=()=>new Date(),opts:{channel?:"mqtt"|"bancada-virtual"}={}){this.channel=opts.channel??"mqtt";}
 private alias(id:string){return Object.hasOwn(this.cfg.aliases,id)?this.cfg.aliases[id]:id;}
 async reportRejected(reason:string){const now=Date.now(),last=this.rejectedAt.get(reason);if(last!==undefined&&now-last<2000)return;this.rejectedAt.set(reason,now);await notifyLiveSafe({type:"message.rejected",orgId:DEMO_ORG_ID,channel:this.channel,reason});}
 async handle(raw:unknown,receivedAt?:Date,topicDeviceId?:string):Promise<MqttOutcome>{const p=await this.prepare(raw,receivedAt,topicDeviceId);if(p.status==="rejected")return p;return this.apply(p.message);}
 async prepare(raw:unknown,arrivedAt?:Date,topicDeviceId?:string):Promise<{status:"rejected";reason:string}|{status:"ready";message:MqttMessage}>{
  const p=mqttPayloadSchema.safeParse(raw);if(!p.success){await this.reportRejected("payload de vazão inválido");return{status:"rejected",reason:"payload de vazão inválido"};}
  const code=this.alias(p.data.dispositivo_id);
  if(topicDeviceId!==undefined&&this.alias(topicDeviceId)!==code){await this.reportRejected("dispositivo diferente do tópico");return{status:"rejected",reason:"dispositivo diferente do tópico"};}
  const device=await getDb().device.findFirst({where:{code,organizationId:DEMO_ORG_ID,kind:"FLOW"}});if(!device){await this.reportRejected("medidor de vazão não cadastrado");return{status:"rejected",reason:"medidor de vazão não cadastrado"};}
  const at=arrivedAt??this.now(),receivedAt=arrivedAt??new Date(),m=this.memory.get(device.id)??{sequence:0},elapsed=m.lastFlowAt?(at.getTime()-m.lastFlowAt.getTime())/1000:0;
  const seconds=elapsed>0&&elapsed<=DEFAULT_MAX_GAP_SECONDS?elapsed:this.cfg.sampleSeconds;m.lastFlowAt=at;
  const sequence=p.data.sequence??m.sequence++;this.memory.set(device.id,m);const source=this.cfg.simulated.has("VAZAO")?"SIMULATED":"DEVICE";
  return{status:"ready",message:{device,at,receivedAt,done:{},flow:{source,sequence,reading:{bootId:p.data.bootId??this.bootId,sequence,flowLpm:p.data.VAZAO,deltaLiters:Math.round(p.data.VAZAO*seconds/60*1000)/1000,capturedAt:at,receivedAt}}}};
 }
 async apply(msg:MqttMessage):Promise<MqttProcessed>{if(!msg.done.flow)msg.done.flow=await ingestReading(msg.device,msg.flow.reading,msg.flow.source,this.channel);return{status:"processed",deviceCode:msg.device.code,flow:{...msg.done.flow,source:msg.flow.source,sequence:msg.flow.sequence}};}
 abandon(msg:MqttMessage){void msg;}
}
