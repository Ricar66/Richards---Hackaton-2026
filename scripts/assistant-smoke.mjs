// Fumaça HTTP do build local. Sem chamadas à OpenAI/Telegram; banco SOMENTE *_test.
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {setTimeout as wait} from 'node:timers/promises';
const database=process.env.TEST_DATABASE_URL;
if(!database||!/_test$/.test(new URL(database).pathname))throw Error('Banco de teste obrigatório');
const port=3107,base=`http://127.0.0.1:${port}`,auth='Basic '+Buffer.from('assist-smoke:local-test-password').toString('base64');
const marker='fake-marker-not-a-real-key';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{stdio:'ignore',env:{...process.env,DATABASE_URL:database,AUTH_MODE:'basic',RICHARDS_OPERATOR_USER:'assist-smoke',RICHARDS_OPERATOR_PASSWORD:'local-test-password',ASSISTANT_ENABLED:'false',OPENAI_API_KEY:marker,TELEGRAM_ENABLED:'true',TELEGRAM_BOT_TOKEN:'123456:local_test_only',TELEGRAM_BOT_USERNAME:'richards_test_bot'}});
try{
 let ready=false;for(let n=0;n<50;n++){try{const r=await fetch(base+'/api/health');if(r.ok){ready=true;break;}}catch{}await wait(200);}assert(ready,'servidor não iniciou');
 assert.equal((await fetch(base+'/assistente')).status,401);
 assert.equal((await fetch(base+'/api/assistant/telegram')).status,401);
 assert.equal((await fetch(base+'/api/assistant/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
 console.log('PASSOU: assistente e APIs privados');
 const page=await fetch(base+'/assistente',{headers:{authorization:auth}});assert.equal(page.status,200);const html=await page.text();assert(html.includes('RICHARDS Assist'));assert(!html.includes(marker));assert(!html.includes('local_test_only'));
 console.log('PASSOU: página renderiza e não expõe credenciais');
 const status=await fetch(base+'/api/assistant/telegram',{headers:{authorization:auth}});assert.equal(status.status,200);const raw=await status.text();assert(!raw.includes(marker));assert(!raw.includes('local_test_only'));assert.equal(JSON.parse(raw).aiEnabled,false);
 const headers={authorization:auth,'Content-Type':'application/json'};
 const link=await fetch(base+'/api/assistant/telegram',{method:'POST',headers,body:JSON.stringify({action:'link'})});assert.equal(link.status,200);const paired=await link.json();assert.match(paired.url,/^https:\/\/t.me\/richards_test_bot\?start=[a-f0-9]{48}$/);assert(Date.parse(paired.expiresAt)>Date.now());
 assert.equal((await fetch(base+'/api/assistant/chat',{method:'POST',headers,body:JSON.stringify({message:'olá'})})).status,503);
 assert.equal((await fetch(base+'/api/assistant/telegram',{method:'POST',headers:{...headers,origin:'https://outro-site.test'},body:'{"action":"link"}'})).status,403);
 assert.equal((await fetch(base+'/api/assistant/telegram',{method:'POST',headers,body:'x'.repeat(5000)})).status,413);
 assert.equal((await fetch(base+'/plateia')).status,200);
 console.log('PASSOU: vínculo local, IA desativada falha fechada, CSRF, limite de corpo e plateia pública preservada');
 console.log('NÃO EXECUTADO: APIs externas, navegação interativa e hardware.');
}finally{server.kill('SIGTERM');}
