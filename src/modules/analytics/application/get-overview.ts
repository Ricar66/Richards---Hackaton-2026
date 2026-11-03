import { getDb } from "@/lib/db";
import { DEMO_ORG_ID, isDemo } from "@/lib/constants";
import { demoOverview } from "../infrastructure/demo-overview";
import type { OverviewDTO, StatusSlice } from "../domain/types";
// Consulta agregada por dia executada pelo PostgreSQL — não carregar milhares de leituras para o browser.
type DailyRow = { day: Date; liters: unknown };
export async function getOverview(): Promise<OverviewDTO> {
  try {
    const db = getDb();
    const org = await db.organization.findUnique({ where: { id: DEMO_ORG_ID } });
    if (!org) throw new Error("Base não preparada");
    const since = new Date(Date.now()-7*86400000);
    const [devices, daily, totals, sourceGroups, occurrences, activeCount, resolvedCount, occurrenceGroups, deliveredAgg, donations] = await Promise.all([
      db.device.findMany({ where: { organizationId: org.id } }),
      db.$queryRaw<DailyRow[]>`
        SELECT date_trunc('day', tr."capturedAt") AS day, COALESCE(SUM(tr."deltaLiters"), 0) AS liters
        FROM "TelemetryReading" tr INNER JOIN "Device" d ON d.id = tr."deviceId"
        WHERE d."organizationId" = ${org.id} AND tr."capturedAt" >= ${since} AND tr."capturedAt" <= NOW()
        GROUP BY 1 ORDER BY 1`,
      db.telemetryReading.aggregate({ where: { device: { organizationId: org.id }, capturedAt: { gte: since, lte: new Date() } }, _sum: { deltaLiters:true } }),
      db.telemetryReading.groupBy({ by: ['source'], where: { device: { organizationId: org.id } }, _count: { _all:true } }),
      db.occurrence.findMany({ where: { organizationId: org.id }, orderBy: { openedAt: 'desc' }, take: 30 }),
      db.occurrence.count({ where: { organizationId: org.id, status: { in: ['OPEN','ACKNOWLEDGED'] } } }),
      db.occurrence.count({ where: { organizationId: org.id, status: 'RESOLVED' } }),
      db.occurrence.groupBy({ by: ['status'], where: { organizationId: org.id }, _count: { _all: true } }),
      db.donationBatch.aggregate({ where: { organizationId: org.id, status: 'DELIVERED' }, _sum: { weightKg: true } }),
      db.donationBatch.findMany({ where: { organizationId: org.id }, include: { recipient: true }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    const buckets = new Map<string,number>();
    for(let i=6;i>=0;i--){const day=new Date(Date.now()-i*86400000).toISOString().slice(0,10);buckets.set(day,0)}
    for(const row of daily){const day=row.day.toISOString().slice(0,10);if(buckets.has(day))buckets.set(day,Number(row.liters))}
    const trend=[...buckets].map(([day,liters])=>({label:new Date(day+'T12:00:00Z').toLocaleDateString('pt-BR',{weekday:'short',timeZone:'UTC'}).replace('.',''),water:Math.round(liters*10)/10,reference:120}));
    const response=occurrences.filter(x=>x.status==='RESOLVED'&&x.resolvedAt).map(x=>(x.resolvedAt!.getTime()-x.openedAt.getTime())/60000);
    const status:StatusSlice[]=[{name:'Resolvidas',value:resolvedCount,color:'#20a48b'},
      {name:'Abertas',value:occurrenceGroups.find(x=>x.status==='OPEN')?._count._all??0,color:'#e59d55'},
      {name:'Em análise',value:occurrenceGroups.find(x=>x.status==='ACKNOWLEDGED')?._count._all??0,color:'#6099d1'}];
    const sources=new Set(sourceGroups.map(x=>x.source));
    const dataset:OverviewDTO['dataset']=sources.has('DEVICE')?(sources.has('SIMULATED')?'MIXED':'DEVICE'):'SIMULATED';
    return {
      dataset,updatedAt:new Date().toISOString(),business:org.name,
      metrics:{observedLiters:Math.round(Number(totals._sum.deltaLiters??0)*10)/10,openAlerts:activeCount,
        deliveredKg:Math.round(Number(deliveredAgg._sum.weightKg??0)*10)/10,
        resolved:resolvedCount,averageResponseMin:response.length?Math.round(response.reduce((n,x)=>n+x,0)/response.length):null,devices:devices.length},
      trend,distribution:status,occurrences:occurrences.map(o=>({id:o.id,title:o.title,description:o.description,severity:o.severity,status:o.status,source:o.source,time:o.openedAt.toISOString(),liters:o.suspectedLiters===null?null:Number(o.suspectedLiters)})),
      donations:donations.map(d=>({id:d.id,description:d.description,kg:Number(d.weightKg),status:d.status,source:d.source,recipient:d.recipient?.name??'Aguardando',createdAt:d.createdAt.toISOString()})),
      devices:devices.map(d=>({id:d.id,code:d.code,label:d.label,state:d.state,kind:d.kind,lastSeen:d.lastSeenAt?.toISOString()??null})),
    };
  }catch(err){if(!isDemo)throw err;return demoOverview()}
}
