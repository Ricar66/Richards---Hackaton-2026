/** HTTP real contra Next de produção + banco EXCLUSIVO *_test. Sem chamadas externas. */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID, createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
const url = process.env.TEST_DATABASE_URL;
if (!url || !/^[a-z0-9_]+_test$/.test(new URL(url).pathname.slice(1))) throw new Error('TEST_DATABASE_URL deve apontar para banco *_test; recusado');
const port = Number(process.env.CIRCULAR_TEST_PORT || 3187), base = `http://127.0.0.1:${port}`;
if (await fetch(`${base}/api/health`).then(()=>true,()=>false)) throw new Error('Porta ocupada; recusado');
const env = { ...process.env, DATABASE_URL: url, TEST_DATABASE_URL: url, AUTH_MODE: 'basic', RICHARDS_OPERATOR_USER: 'circular-test', RICHARDS_OPERATOR_PASSWORD: 'test-only-local-circular', ASSISTANT_ENABLED: 'false', TELEGRAM_ENABLED: 'false' };
const prep = spawnSync(process.execPath, ['--import','tsx','--input-type=module','-e', 'const h=await import("./tests/integration/helpers.ts");try{await h.resetAndSeed()}finally{await h.db().$disconnect()}'], {env,stdio:'inherit'});
assert.equal(prep.status,0,'preparação isolada');
const authorization = 'Basic '+Buffer.from(`${env.RICHARDS_OPERATOR_USER}:${env.RICHARDS_OPERATOR_PASSWORD}`).toString('base64');
async function start(enabled) {
  const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{env:{...env,CIRCULAR_ENABLED:String(enabled)},stdio:'ignore'});
  for(let i=0;i<100;i++){if(server.exitCode!==null)throw new Error('Next encerrou antes da sonda');if(await fetch(`${base}/api/health`).then(r=>r.ok,()=>false))return server;await new Promise(r=>setTimeout(r,100));}
  server.kill();throw new Error('Next não iniciou');
}
async function stop(server){if(server.exitCode!==null)return;const exited=once(server,'exit');server.kill('SIGTERM');await exited;}
async function call(path,method='GET',body,expected=200,extra={}){
 const res=await fetch(base+path,{method,headers:{authorization,...(body?{'content-type':'application/json'}:{}),...extra},body:body?JSON.stringify(body):undefined});
 const data=await res.json();assert.equal(res.status,expected,`${method} ${path}: ${JSON.stringify(data)}`);return data;
}
const ago=m=>new Date(Date.now()-m*60000).toISOString();
let server=await start(false);
try{await call('/api/circular','GET',undefined,503);const page=await fetch(base+'/circular',{headers:{authorization}});assert.equal(page.status,200);assert.match(await page.text(),/Ativação pendente/);}finally{await stop(server);}
server=await start(true);
try{
 for(const path of ['/circular','/api/circular','/api/circular/partners','/api/circular/evidence/forged'])assert.equal((await fetch(base+path,{headers:{'x-richards-actor':'operador:forjado'}})).status,401);
 assert.equal((await fetch(base+'/api/circular/batches',{method:'POST',headers:{authorization,'content-type':'application/json',origin:'https://other.example'},body:'{}'})).status,403);
 assert.equal((await fetch(base+'/api/circular/batches',{method:'POST',headers:{authorization,'content-type':'application/json'},body:'x'.repeat(17000)})).status,413);
 const initial=await call('/api/circular?source=SIMULATED&range=30d');assert.equal(initial.count,0);assert(initial.sites.length);
 await call('/api/circular?source=DEVICE','GET',undefined,422);
 const {id:partnerId}=await call('/api/circular/partners','POST',{name:'Operador HTTP SIMULADO',city:'Ribeirão Preto',source:'SIMULATED',methods:['COMPOSTING'],materials:['PLANT_ONLY'],authorizationReference:'ENSAIO SEM LICENCA REAL',reviewedBy:'Conferente de ensaio',reviewExpiresAt:new Date(Date.now()+86400000).toISOString(),attested:true},201);
 const registration={requestKey:randomUUID(),siteId:initial.sites[0].id,description:'Ensaio HTTP SIMULADO',weightKg:5,origin:'PREPARATION',material:'PLANT_ONLY',reason:'Cascas do cenário de software',source:'SIMULATED',occurredAt:ago(60)};
 const {id}=await call('/api/circular/batches','POST',registration,201);assert.equal((await call('/api/circular/batches','POST',registration,201)).id,id);
 const path=`/api/circular/batches/${id}`;
 async function action(body){const d=await call(path);return call(path,'PATCH',{version:d.version,attested:true,...body});}
 await action({action:'TRIAGE',decision:'RESIDUE',origin:'PREPARATION',material:'PLANT_ONLY',reviewedBy:'Pessoa de ensaio',note:'Somente teste de software sem comprovação física'});
 await action({action:'SCHEDULE',partnerId,method:'COMPOSTING',scheduledAt:ago(30),reason:'Material compatível neste cenário simulado'});
 const version=(await call(path)).version, collection={version,attested:true,action:'COLLECT',requestKey:randomUUID(),weightKg:5,eventAt:ago(10),receivedBy:'Coletor de ensaio'};
 await call(path,'PATCH',collection);await call(path,'PATCH',collection);
 const pdf=await PDFDocument.create();pdf.addPage().drawText('SIMULATED SOFTWARE TEST ONLY');const bytes=await pdf.save(), base64=Buffer.from(bytes).toString('base64');
 async function evidence(kind,weightKg){return call(path+'/evidence','POST',{version:(await call(path)).version,attested:true,requestKey:randomUUID(),kind,weightKg,eventAt:ago(kind==='RECEIPT'?5:1),documentReference:'ENSAIO HTTP SEM EVIDENCIA FISICA',reviewedBy:'Conferente ficticio',file:{mime:'application/pdf',base64}},201);}
 const receipt=await evidence('RECEIPT',5);await evidence('TREATMENT',2);
 const download=await fetch(base+`/api/circular/evidence/${receipt.id}`,{headers:{authorization}});assert.equal(download.status,200);assert.match(download.headers.get('content-disposition'),/^attachment;/);assert.equal(download.headers.get('x-content-type-options'),'nosniff');assert.match(download.headers.get('cache-control'),/no-store/);assert.equal(download.headers.get('x-document-sha256'),createHash('sha256').update(bytes).digest('hex'));assert.deepEqual(Buffer.from(await download.arrayBuffer()),Buffer.from(bytes));
 const summary=await call('/api/circular?source=SIMULATED&range=30d');assert.equal(summary.kpis.residueKg,5);assert.equal(summary.kpis.organicConfirmedKg,2);assert.equal(summary.kpis.unprovenKg,3);assert.equal((await call('/api/circular?source=MANUAL&range=30d')).count,0);
 const page=await fetch(base+'/circular?source=SIMULATED',{headers:{authorization}});assert.equal(page.status,200);assert.match(await page.text(),/RICHARDS Circular/);
 console.log('PASSOU: HTTP produção, flag off/on, autenticação, CSRF, limites, fluxo, repetição, origem e download SHA256. Ensaio SIMULATED; sem teste físico/browser.');
}finally{await stop(server);}
