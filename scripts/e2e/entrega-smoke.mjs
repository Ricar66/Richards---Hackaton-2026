// Fumaça de apresentação SEM banco: não substitui a integração com Postgres/hardware.
// Servidor de teste separado, nunca a VPS: E2E_BASE_URL=http://localhost:3100.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const base = process.env.E2E_BASE_URL || 'http://localhost:3100';
if (!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw Error('Somente servidor local isolado');
const browser = await puppeteer.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
 const page = await browser.newPage(); await page.setViewport({width:1920,height:1080});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 for(const route of ['/','/monitoramento','/ocorrencias','/doacoes','/dispositivos','/relatorios','/ao-vivo']){
  const res=await page.goto(base+route,{waitUntil:'domcontentloaded'});
  assert.equal(res.status(),200,route);
  await page.waitForFunction(()=>/indisponível/i.test(document.body.innerText));
  console.log('PASSOU',route,'informa indisponibilidade sem banco');
 }
 await page.waitForSelector('.stage-controls button');
 await page.click('.stage-controls button:nth-of-type(1)');
 await page.waitForSelector('[data-paused]');
 await page.click('.stage-controls button:nth-of-type(1)');
 await page.waitForSelector('[data-stage]:not([data-paused])');
 console.log('PASSOU pausa/retomada por botão');
 await page.click('.stage-controls button:nth-of-type(2)');
 await page.waitForFunction(()=>document.querySelector('[data-twin-mode]')?.dataset.twinMode !== 'loading');
 console.log('MODO',await page.$eval('[data-twin-mode]',e=>({mode:e.dataset.twinMode,reason:e.dataset.twinReason})));
 await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
 await page.waitForSelector('[data-twin-reason="reduced"]');
 assert(await page.$eval('.stage-controls button:nth-of-type(2)',e=>e.disabled));
 console.log('PASSOU movimento reduzido usa SVG e desabilita solicitação 3D');
 await page.goto(base+'/ao-vivo?atalhos=0',{waitUntil:'domcontentloaded'});
 await page.waitForSelector('.stage-controls button');
 await page.keyboard.press('p');
 assert.equal(await page.$('[data-paused]'),null);
 await page.click('.stage-controls button:nth-of-type(1)');
 await page.waitForSelector('[data-paused]');
 console.log('PASSOU controles funcionam com atalhos desativados');
 const clipped=await page.$$eval('.stage-controls button',els=>els.some(e=>{const r=e.getBoundingClientRect();return r.left<0||r.right>innerWidth||r.bottom>innerHeight;}));
 assert(!clipped);
 if(process.env.E2E_SCREENSHOT) await page.screenshot({path:process.env.E2E_SCREENSHOT});
 assert.deepEqual(errors,[]);
 console.log('PASSOU Full HD: controles dentro do viewport; zero erros JS');
} finally {await browser.close();}
