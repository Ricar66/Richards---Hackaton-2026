import { getDb } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
import { saveMapSchema,layoutSchema } from "../domain/layout";
import { auditRecord } from "@/modules/audit/infrastructure/audit-record";
export class WaterMapError extends Error{constructor(message:string,public status=409){super(message);}}
export class WaterMapService{
 async read(siteId:string|null,source:"DEVICE"|"SIMULATED"){
  const db=getDb(),sites=await db.site.findMany({where:{organizationId:DEMO_ORG_ID},select:{id:true,name:true},orderBy:{name:"asc"}}),site=siteId?sites.find(s=>s.id===siteId):sites[0];
  if(!site)throw new WaterMapError("Unidade não encontrada",404);
  const[map,devices,readings]=await Promise.all([
   db.hydraulicMap.findUnique({where:{siteId:site.id}}),
   db.device.findMany({where:{organizationId:DEMO_ORG_ID,siteId:site.id,kind:"FLOW"},select:{id:true,code:true,label:true,minFlowLpm:true},orderBy:{code:"asc"}}),
   db.$queryRaw<{deviceId:string;capturedAt:Date;flowLpm:number;source:"DEVICE"|"SIMULATED"}[]>`
    SELECT DISTINCT ON(r."deviceId") r."deviceId",r."capturedAt",r."flowLpm"::float8 AS "flowLpm",r.source::text AS source
    FROM "TelemetryReading" r JOIN "Device" d ON d.id=r."deviceId"
    WHERE d."organizationId"=${DEMO_ORG_ID} AND d."siteId"=${site.id} AND d.kind='FLOW'
      AND r.source::text=${source} AND r."capturedAt"<=(NOW() AT TIME ZONE 'UTC')
    ORDER BY r."deviceId",r."capturedAt" DESC`,
  ]);
  const active=await db.occurrence.findMany({where:{organizationId:DEMO_ORG_ID,siteId:site.id,kind:{in:["UNUSUAL_FLOW","DEVICE_OFFLINE","MANUAL"]},source,status:{in:["OPEN","ACKNOWLEDGED"]}},select:{id:true,deviceId:true,title:true}});
  return{generatedAt:new Date().toISOString(),source,sites,site,devices,map:map?{name:map.name,version:map.version,layout:layoutSchema.parse(map.layout),updatedAt:map.updatedAt.toISOString()}:null,readings:readings.map(r=>({deviceId:r.deviceId,at:r.capturedAt.toISOString(),flowLpm:Number(r.flowLpm),source:r.source})),active};
 }
 async save(raw:unknown,actor:string){
  const p=saveMapSchema.safeParse(raw);if(!p.success)throw new WaterMapError(p.error.issues[0]?.code==="custom"?p.error.issues[0].message:"Confira nome, conexões, posições e identificação da planta",422);const input=p.data;
  return getDb().$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "Site" WHERE id=${input.siteId} AND "organizationId"=${DEMO_ORG_ID} FOR UPDATE`;
   if(!await tx.site.findFirst({where:{id:input.siteId,organizationId:DEMO_ORG_ID}}))throw new WaterMapError("Unidade não encontrada",404);
   const old=await tx.hydraulicMap.findUnique({where:{siteId:input.siteId}});if((old?.version??-1)!==input.version)throw new WaterMapError("Planta alterada por outro operador. Recarregue antes de salvar");
   const ids=input.layout.nodes.flatMap(n=>n.deviceId?[n.deviceId]:[]);
   if(ids.length!==await tx.device.count({where:{id:{in:ids},organizationId:DEMO_ORG_ID,siteId:input.siteId,kind:"FLOW"}}))throw new WaterMapError("Vincule somente medidores de vazão desta unidade",422);
   const data={name:input.name,layout:input.layout,version:input.version+1,updatedBy:actor};
   const map=await tx.hydraulicMap.upsert({where:{siteId:input.siteId},create:{siteId:input.siteId,...data},update:data});
   await tx.auditEvent.create({data:auditRecord({organizationId:DEMO_ORG_ID,entity:"HydraulicMap",entityId:input.siteId,action:old?"UPDATED":"CREATED",actor,metadata:{previousVersion:old?.version??null,version:map.version,name:input.name,previousLayout:old?.layout??null,layout:input.layout}})});
   return{version:map.version};
  });
 }
}
export type WaterMapSnapshot=Awaited<ReturnType<WaterMapService["read"]>>;
