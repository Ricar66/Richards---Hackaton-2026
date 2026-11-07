// Valida o renderer real num harness LOCAL isolado. SwiftShader é permitido SOMENTE neste ensaio.
// Não muda a sonda da aplicação, que continua recusando software. Não comprova FPS da GPU do palco.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';
const require = createRequire(import.meta.url);
// esbuild já é dependência travada de tsx, ferramenta de desenvolvimento existente.
const { build } = createRequire(require.resolve('tsx'))('esbuild');
const root = resolve(import.meta.dirname, '../..');
const out = resolve(root, '.e2e/twin-scene');
await mkdir(out, { recursive: true });
const entry = process.env.TWIN_SCENE_ENTRY || resolve(root, 'src/components/stage/three/pipe-scene.ts');
await build({ stdin: { contents: `import {createPipeScene} from ${JSON.stringify(entry)};
window.qa = {lost:0,budget:0,stats:null};
const scene = createPipeScene(document.querySelector('#scene'), {onLost:()=>qa.lost++,onBudget:()=>qa.budget++,onStats:s=>qa.stats=s});
window.scene=scene; scene.ready.then(()=>{scene.update({speed:120,tone:'ok',simulated:true,live:true,still:true,pulseKey:'qa:1',visible:true});window.ready=true;});`, resolveDir: root },
  outfile: resolve(out, 'scene.js'), bundle: true, platform: 'browser', format: 'esm', tsconfig: resolve(root, 'tsconfig.json') });
const server = createServer(async (req, res) => {
  if (req.url === '/scene.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(resolve(out, 'scene.js'))); }
  else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;background:#0f2128;color:#b6a3e2;font:14px sans-serif}#scene{height:100%;width:100%}aside{position:absolute;top:20px;left:24px;letter-spacing:2px}</style></head><body><aside>RICHARDS · ENSAIO GRÁFICO · SIMULADO</aside><div id="scene"></div><script type="module" src="/scene.js"></script></body></html>'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 640 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.ready === true, { timeout: 30000 });
  const hash = async () => createHash('sha256').update(await page.screenshot()).digest('hex');
  await page.screenshot({ path: resolve(out, 'overview.png') });
  const paused = await hash(); await wait(150); assert.equal(await hash(), paused, 'pausado não redesenha água');
  await page.evaluate(() => scene.update({ still: false }));
  await wait(150); const moving = await hash(); await wait(200); assert.notEqual(await hash(), moving, 'vazão move o shader');
  await page.evaluate(() => scene.update({ speed: 0 }));
  await wait(100); const stopped = await hash(); await wait(200); assert.equal(await hash(), stopped, 'vazão zero para');
  await page.evaluate(() => scene.update({ speed: 120, live: false }));
  await wait(100); const stale = await hash(); await wait(200); assert.equal(await hash(), stale, 'sem leitura recente nem velocidade residual move a água');
  await page.evaluate(() => scene.update({ live: true, speed: 0, pulseKey: 'qa:2' }));
  await wait(100); const pulse = await hash(); await wait(150); assert.notEqual(await hash(), pulse, 'pacote com vazão zero pulsa medidor');
  await wait(800); const ended = await hash(); await wait(150); assert.equal(await hash(), ended, 'pulso termina sem iniciar fluxo');
  await page.evaluate(() => scene.update({ still: true, view: 'inspection' }));
  await page.screenshot({ path: resolve(out, 'inspection.png') });
  await page.setViewport({ width: 390, height: 400 });
  await wait(100);
  await page.screenshot({ path: resolve(out, 'mobile-scene.png') });
  await page.evaluate(() => scene.dispose());
  assert.equal(await page.$('canvas'), null, 'dispose remove canvas');
  assert.deepEqual(errors, [], 'sem erro de JS/GLSL');
  console.log('PASSOU: shader real, pausa, zero, ausência de leitura, pulso sem fluxo, enquadramentos, resize e dispose.');
  console.log('RENDERER DE TESTE: SwiftShader explícito; nenhuma aprovação de desempenho de GPU/projetor.');
  console.log('EVIDÊNCIAS', out);
} finally { await browser.close(); await new Promise(r => server.close(r)); }
