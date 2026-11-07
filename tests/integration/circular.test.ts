import { db, resetAndSeed } from "./helpers";
import test, { beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { DEMO_ORG_ID, DEMO_SITE_ID } from "../../src/lib/constants";
import { CircularService } from "../../src/modules/circular/application/circular-service";
import { batchInput, partnerInput, actionInput, evidenceInput, CircularError } from "../../src/modules/circular/domain/contracts";
const service=new CircularService(), actor="operador:teste-circular";
const ago=(m:number)=>new Date(Date.now()-m*60000).toISOString();
const later=()=>new Date(Date.now()+86400000).toISOString();
let sequence=0;const key=()=>`circular-test-key-${++sequence}`;
beforeEach(resetAndSeed);after(async()=>{await db().$disconnect();});
async function batch(source="SIMULATED",weightKg=5){return service.create(batchInput.parse({requestKey:key(),siteId:DEMO_SITE_ID,description:"Lote de ensaio Circular",weightKg,origin:"PREPARATION",material:"PLANT_ONLY",reason:"Aparas segregadas para teste",source,occurredAt:ago(60)}),actor);}
async function partner(source="SIMULATED",methods=["COMPOSTING"]){return service.createPartner(partnerInput.parse({name:"Operador de ensaio",city:"Ribeirão Preto",source,methods,materials:["PLANT_ONLY"],authorizationReference:"REFERENCIA FICTICIA DE TESTE",reviewedBy:"Conferente de teste",reviewExpiresAt:later(),attested:true}),actor);}
async function act(id:string, data:Record<string,unknown>){const row=await service.detail(id);return service.action(id,actionInput.parse({version:row.version,...(data.action==="CANCEL"?{}:{attested:true}),...data}),actor);}
async function prepare(method="COMPOSTING"){const b=await batch();const p=await partner("SIMULATED",[method]);await act(b.id,{action:"TRIAGE",decision:"RESIDUE",origin:"PREPARATION",material:"PLANT_ONLY",reviewedBy:"Pessoa de teste",note:"Aparas destinadas ao teste de software"});await act(b.id,{action:"SCHEDULE",partnerId:p.id,method,scheduledAt:ago(30),reason:"Material segregado aceito no processo de ensaio"});return{b,p};}
async function proof(id:string,kind:string,weightKg:number,requestKey=key(),tag=key()){
  const pdf=await PDFDocument.create();pdf.addPage().drawText(`SIMULATED SOFTWARE TEST ${tag}`);const bytes=await pdf.save();
  const row=await service.detail(id);
  return evidenceInput.parse({requestKey,version:row.version,kind,weightKg,eventAt:ago(kind==="RECEIPT"?5:1),documentReference:`Documento de teste ${tag}`,reviewedBy:"Conferente ficticio",attested:true,file:{mime:"application/pdf",base64:Buffer.from(bytes).toString("base64")}});
}
test("Circular: coletas e comprovantes parciais conservam massa e separam tratamento de recebimento",async()=>{
  const {b}=await prepare();const collection=actionInput.parse({action:"COLLECT",version:(await service.detail(b.id)).version,requestKey:key(),weightKg:3,eventAt:ago(10),receivedBy:"Coletor de teste",attested:true});
  await service.action(b.id,collection,actor);await service.action(b.id,collection,actor);
  const receipt=await proof(b.id,"RECEIPT",2);const e=await service.addEvidence(b.id,receipt,actor);await service.addEvidence(b.id,receipt,actor);
  const file=await service.evidenceFile(e.id);assert.equal(Buffer.from(file.content).toString("base64"),receipt.file.base64);
  await service.addEvidence(b.id,await proof(b.id,"TREATMENT",1),actor);
  let summary=await service.snapshot("SIMULATED","30d");assert.equal(summary.kpis.residueKg,5);assert.equal(summary.kpis.collectedKg,3);assert.equal(summary.kpis.receivedKg,2);assert.equal(summary.kpis.organicConfirmedKg,1);assert.equal(summary.kpis.unprovenKg,4);
  assert.equal((await service.snapshot("MANUAL","30d")).count,0);
  await act(b.id,{action:"COLLECT",requestKey:key(),weightKg:2,eventAt:ago(9),receivedBy:"Coletor de teste"});
  await service.addEvidence(b.id,await proof(b.id,"RECEIPT",3),actor);await service.addEvidence(b.id,await proof(b.id,"TREATMENT",4),actor);
  summary=await service.snapshot("SIMULATED","30d");assert.equal(summary.kpis.organicConfirmedKg,5);assert.equal(summary.kpis.unprovenKg,0);assert.equal((await service.detail(b.id)).evidence.length,4);
});
test("Circular: concorrência não duplica cadastro nem triagem para doação; liberação sanitária continua pendente",async()=>{
  const input=batchInput.parse({requestKey:key(),siteId:DEMO_SITE_ID,description:"Candidato de teste",weightKg:2,origin:"KITCHEN_UNSERVED",material:"MIXED_FOOD",reason:"Sobras de ensaio não servidas",source:"SIMULATED",occurredAt:ago(60)});
  const ids=await Promise.all(Array.from({length:5},()=>service.create(input,actor)));assert.equal(new Set(ids.map(x=>x.id)).size,1);
  await assert.rejects(service.create({...input,weightKg:3},actor),CircularError);
  const triage=actionInput.parse({action:"TRIAGE",version:0,decision:"DONATION",origin:"KITCHEN_UNSERVED",material:"MIXED_FOOD",reviewedBy:"Pessoa de teste",note:"Somente encaminhar para verificação humana",attested:true});
  const outcomes=await Promise.allSettled([service.action(ids[0].id,triage,actor),service.action(ids[0].id,triage,actor)]);assert.equal(outcomes.filter(r=>r.status==="fulfilled").length,1);
  const detail=await service.detail(ids[0].id);const donation=await db().donationBatch.findUniqueOrThrow({where:{id:detail.donationBatchId!}});assert.equal(donation.status,"PENDING_REVIEW");assert.equal(donation.source,"SIMULATED");assert.equal((await service.snapshot("SIMULATED","30d")).kpis.residueKg,0);
});
test("Circular: origem incerta/prato bloqueia candidato à doação, material incerto bloqueia destinação",async()=>{
  const b=await batch();await assert.rejects(act(b.id,{action:"TRIAGE",decision:"DONATION",origin:"PLATE",material:"MIXED_FOOD",reviewedBy:"Pessoa de teste",note:"Não pode liberar restos de prato"}),CircularError);
  await assert.rejects(act(b.id,{action:"TRIAGE",decision:"RESIDUE",origin:"UNKNOWN",material:"UNKNOWN",reviewedBy:"Pessoa de teste",note:"Composição ainda não identificada"}),CircularError);assert.equal((await service.detail(b.id)).version,0);
});
test("Circular: documento repetido, excesso, ordem temporal e tipo errado não ampliam indicadores",async()=>{
  const {b}=await prepare();await act(b.id,{action:"COLLECT",requestKey:key(),weightKg:5,eventAt:ago(10),receivedBy:"Coletor de teste"});
  await assert.rejects(service.addEvidence(b.id,await proof(b.id,"TREATMENT",1),actor),CircularError);
  const first=await proof(b.id,"RECEIPT",2);await service.addEvidence(b.id,first,actor);
  const current=(await service.detail(b.id)).version;
  await assert.rejects(service.addEvidence(b.id,{...first,requestKey:key(),version:current},actor),/já foi contabilizado/);
  await assert.rejects(service.addEvidence(b.id,await proof(b.id,"RECEIPT",4),actor),CircularError);
  const future=await proof(b.id,"TREATMENT",1);await assert.rejects(service.addEvidence(b.id,{...future,eventAt:later()},actor),CircularError);
  await assert.rejects(service.addEvidence(b.id,await proof(b.id,"DISPOSAL",1),actor),CircularError);
  assert.equal((await service.detail(b.id)).receivedKg,2);assert.equal((await service.detail(b.id)).confirmedKg,0);
});
test("Circular: operador incompatível, simulado ou vencido não atende lote manual; revisão/deativação auditadas",async()=>{
  const b=await batch("MANUAL");await act(b.id,{action:"TRIAGE",decision:"RESIDUE",origin:"PREPARATION",material:"PLANT_ONLY",reviewedBy:"Pessoa de teste",note:"Material de teste segregado"});const sim=await partner();
  await assert.rejects(act(b.id,{action:"SCHEDULE",partnerId:sim.id,method:"COMPOSTING",scheduledAt:ago(30),reason:"Teste de isolamento de origem"}),CircularError);
  const manual=await partner("MANUAL");
  await db().circularPartner.update({where:{id:manual.id},data:{reviewExpiresAt:new Date(Date.now()-1000)}});
  await assert.rejects(act(b.id,{action:"SCHEDULE",partnerId:manual.id,method:"COMPOSTING",scheduledAt:ago(30),reason:"Teste de conferência vencida"}),CircularError);
  await service.deactivatePartner(manual.id,actor);await assert.rejects(act(b.id,{action:"SCHEDULE",partnerId:manual.id,method:"COMPOSTING",scheduledAt:ago(30),reason:"Teste de operador desativado"}),CircularError);
  const review=partnerInput.parse({name:"Operador revisado",city:"Ribeirão Preto",source:"MANUAL",methods:["COMPOSTING"],materials:["PLANT_ONLY"],authorizationReference:"NOVA REFERENCIA DE TESTE",reviewedBy:"Revisor ficticio",reviewExpiresAt:later(),attested:true});await service.reviewPartner(manual.id,review,actor);
  await assert.rejects(act(b.id,{action:"SCHEDULE",partnerId:manual.id,method:"BIODIGESTION",scheduledAt:ago(30),reason:"Teste de processo incompatível"}),CircularError);
  await db().circularPartner.update({where:{id:manual.id},data:{materials:["MIXED_FOOD"]}});
  await assert.rejects(act(b.id,{action:"SCHEDULE",partnerId:manual.id,method:"COMPOSTING",scheduledAt:ago(30),reason:"Teste de material incompatível"}),CircularError);
  await db().circularPartner.update({where:{id:manual.id},data:{materials:["PLANT_ONLY"]}});
  await act(b.id,{action:"SCHEDULE",partnerId:manual.id,method:"COMPOSTING",scheduledAt:ago(30),reason:"Compatibilidade reconferida no ensaio"});
  assert.equal(await db().auditEvent.count({where:{entity:"CircularPartner",entityId:manual.id}}),3);
});
test("Circular: org externa não aparece e seus lotes/documentos/unidades não são acessíveis",async()=>{
  await db().organization.create({data:{id:"foreign-circular",name:"Outro cliente",city:"Outra",sector:"Teste"}});await db().site.create({data:{id:"foreign-site",organizationId:"foreign-circular",name:"Fora"}});
  const {b}=await prepare();await act(b.id,{action:"COLLECT",requestKey:key(),weightKg:1,eventAt:ago(10),receivedBy:"Coletor de teste"});
  const evidence=await service.addEvidence(b.id,await proof(b.id,"RECEIPT",1),actor);
  await db().circularBatch.update({where:{id:b.id},data:{organizationId:"foreign-circular"}});
  await assert.rejects(service.evidenceFile(evidence.id),(e:unknown)=>e instanceof CircularError&&e.status===404);
  await assert.rejects(service.detail(b.id),(e:unknown)=>e instanceof CircularError&&e.status===404);assert.equal((await service.snapshot("SIMULATED","30d")).count,0);
  await assert.rejects(service.create(batchInput.parse({requestKey:key(),siteId:"foreign-site",description:"Ensaio inválido",weightKg:1,origin:"PREPARATION",material:"PLANT_ONLY",reason:"Unidade de outro cliente",source:"SIMULATED",occurredAt:ago(60)}),actor),CircularError);
});
test("Circular: recebimentos simultâneos com versão igual só contabilizam uma vez",async()=>{
  const {b}=await prepare();await act(b.id,{action:"COLLECT",requestKey:key(),weightKg:5,eventAt:ago(10),receivedBy:"Coletor de teste"});
  const a=await proof(b.id,"RECEIPT",3),other=await proof(b.id,"RECEIPT",3);const result=await Promise.allSettled([service.addEvidence(b.id,a,actor),service.addEvidence(b.id,other,actor)]);assert.equal(result.filter(x=>x.status==="fulfilled").length,1);assert.equal((await service.detail(b.id)).receivedKg,3);
});
test("Circular: banco reforça conservação de massa e rejeita origem DEVICE; cancelamento não apaga fatos",async()=>{
  const {b}=await prepare();await assert.rejects(db().circularBatch.update({where:{id:b.id},data:{confirmedKg:6}}));await assert.rejects(db().circularBatch.update({where:{id:b.id},data:{source:"DEVICE"}}));
  await act(b.id,{action:"COLLECT",requestKey:key(),weightKg:1,eventAt:ago(10),receivedBy:"Coletor de teste"});await assert.rejects(act(b.id,{action:"CANCEL",reason:"Não pode apagar coleta registrada"}),CircularError);assert.equal((await service.detail(b.id)).collectedKg,1);
});
test("Circular: disposição de rejeito tem indicador próprio e não vira tratamento orgânico",async()=>{
  const {b}=await prepare("DISPOSAL");await act(b.id,{action:"COLLECT",requestKey:key(),weightKg:5,eventAt:ago(10),receivedBy:"Coletor de teste"});await service.addEvidence(b.id,await proof(b.id,"RECEIPT",5),actor);await service.addEvidence(b.id,await proof(b.id,"DISPOSAL",5),actor);
  const summary=await service.snapshot("SIMULATED","30d");assert.equal(summary.kpis.organicConfirmedKg,0);assert.equal(summary.kpis.disposalConfirmedKg,5);
  assert.equal(await db().circularBatch.count({where:{organizationId:DEMO_ORG_ID}}),1);
});

test("Circular: indicadores usam coorte de cadastro e excluem cadastro sem triagem e cancelado",async()=>{
  const {b}=await prepare();await batch();const cancelled=await batch();await act(cancelled.id,{action:"CANCEL",reason:"Cancelamento do ensaio sem movimentação"});
  let snapshot=await service.snapshot("SIMULATED","24h");assert.equal(snapshot.count,3);assert.equal(snapshot.kpis.residueKg,5);assert.equal(snapshot.kpis.awaitingTriage,1);
  await db().circularBatch.update({where:{id:b.id},data:{createdAt:new Date(Date.now()-2*86400000)}});
  snapshot=await service.snapshot("SIMULATED","24h");assert.equal(snapshot.count,2);assert.equal(snapshot.kpis.residueKg,0);
  assert.equal((await service.snapshot("SIMULATED","7d")).kpis.residueKg,5);
});
