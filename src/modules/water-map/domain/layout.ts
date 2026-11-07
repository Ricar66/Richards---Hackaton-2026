import { z } from "zod";
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),label=z.string().trim().min(2).max(70),coord=z.number().finite().min(.02).max(.98);
export const layoutSchema=z.object({kind:z.enum(["HOUSE","COMMERCE","CONSTRUCTION"]),rooms:z.array(z.object({id,label,x:coord,y:coord,w:z.number().positive().max(.95),h:z.number().positive().max(.95)}).strict()).min(1).max(20),nodes:z.array(z.object({id,label,kind:z.enum(["SUPPLY","JUNCTION","OUTLET"]),x:coord,y:coord,deviceId:id.nullable()}).strict()).min(2).max(32),edges:z.array(z.object({from:id,to:id}).strict()).min(1).max(40)}).strict().superRefine((l,ctx)=>{
 const fail=(message:string)=>ctx.addIssue({code:"custom",message}),ids=new Set(l.nodes.map(n=>n.id));
 if(ids.size!==l.nodes.length||new Set(l.rooms.map(r=>r.id)).size!==l.rooms.length)fail("Identificadores duplicados");
 if(l.rooms.some(r=>r.x+r.w>1||r.y+r.h>1))fail("Ambiente fora da planta");
 const assigned=l.nodes.flatMap(n=>n.deviceId?[n.deviceId]:[]);if(new Set(assigned).size!==assigned.length)fail("Um medidor só pode representar um ponto nesta planta");
 const roots=l.nodes.filter(n=>n.kind==="SUPPLY");if(roots.length!==1)fail("Use exatamente uma entrada");
 const incoming=new Map<string,number>(),paths=new Set<string>();
 for(const e of l.edges){if(!ids.has(e.from)||!ids.has(e.to)||e.from===e.to)fail("Ramal inválido");const k=e.from+":"+e.to;if(paths.has(k))fail("Ramal duplicado");paths.add(k);incoming.set(e.to,(incoming.get(e.to)??0)+1);}
 if(roots[0]&&incoming.has(roots[0].id))fail("A entrada não pode receber ramal");
 for(const n of l.nodes)if(n.kind!=="SUPPLY"&&incoming.get(n.id)!==1)fail("Cada ponto deve ter um único ramal de entrada");
 const seen=new Set<string>(),visiting=new Set<string>();
 function walk(n:string){if(visiting.has(n)){fail("A planta não pode ter ciclos");return;}if(seen.has(n))return;seen.add(n);visiting.add(n);for(const e of l.edges)if(e.from===n)walk(e.to);visiting.delete(n);}
 if(roots[0])walk(roots[0].id);if(seen.size!==ids.size)fail("Todos os pontos devem estar conectados à entrada");
});
export type WaterLayout=z.infer<typeof layoutSchema>;
export const saveMapSchema=z.object({siteId:id,version:z.number().int().min(-1),name:label,layout:layoutSchema}).strict();
export const KIND_LABEL={HOUSE:"Casa",COMMERCE:"Comércio",CONSTRUCTION:"Edifício em construção"}as const;
export function template(kind:WaterLayout["kind"]):WaterLayout{
 const names=kind==="HOUSE"?["Área de serviço","Banheiro","Área externa","Lavabo"]:kind==="COMMERCE"?["Área de limpeza","Sanitário de clientes","Área de operação","Sanitário da equipe"]:["Térreo · frente A","1º pavimento · frente B","2º pavimento · frente C","Canteiro · apoio"];
 return layoutSchema.parse({kind,rooms:names.map((label,i)=>({id:`room-${i}`,label,x:i%2?.54:.06,y:i<2?.1:.55,w:.4,h:.36})),nodes:[{id:"supply",label:"Entrada de água",kind:"SUPPLY",x:.5,y:.05,deviceId:null},{id:"distribution",label:"Distribuição",kind:"JUNCTION",x:.5,y:.49,deviceId:null},...names.map((label,i)=>({id:`point-${i}`,label,kind:"OUTLET",x:i%2?.75:.25,y:i<2?.3:.75,deviceId:null}))],edges:[{from:"supply",to:"distribution"},...names.map((_,i)=>({from:"distribution",to:`point-${i}`}))]});
}
export function flowState(reading:{at:string;flowLpm:number;source:string}|null,now:number){if(!reading||!Number.isFinite(reading.flowLpm)||reading.flowLpm<0||!Number.isFinite(Date.parse(reading.at)))return"NO_READING";const age=now-Date.parse(reading.at);if(age< -5000||age>120000)return"STALE";return reading.flowLpm>0?"FLOW":"IDLE";}
