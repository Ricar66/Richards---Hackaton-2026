// Renderer real em harness LOCAL, sem API/banco/hardware. SwiftShader só neste teste, nunca na sonda do produto.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('tsx'))('esbuild');
const root = resolve(import.meta.dirname, '../..'), out = resolve(root, '.e2e/instruments');
await mkdir(out, { recursive: true });
const bundle = await build({ stdin: { contents: `import {createInstrumentScene} from './src/components/stage/three/instrument-scene';
const kind=new URLSearchParams(location.search).get('kind');
window.qa={stats:null,errors:[]}; window.input={fresh:true,simulated:true,fraction:0.65,tone:'ok',confirmed:2,total:6};
window.scene=createInstrumentScene(document.querySelector('#scene'),kind,{onFail:r=>qa.errors.push(r),onStats:s=>qa.stats=s});
scene.update(input);scene.ready.then(()=>window.ready=true);`, resolveDir: root }, bundle: true, write: false, platform: 'browser', format: 'iife', tsconfig: resolve(root, 'tsconfig.json') });
const server = createServer((req, res) => {
  if (req.url === '/scene.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].contents); }
  else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;background:#0f2128;color:#b6a3e2;font:12px system-ui}#scene{width:100%;height:100%}canvas{width:100%;height:100%;display:block}aside{position:absolute;left:12px;top:10px}</style><body><aside>RICHARDS · INSTRUMENTO ESQUEMÁTICO · SIMULADO</aside><div id="scene"></div><script src="/scene.js"></script></body></html>'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
let browser;
try {
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const kind of ['scale', 'temperature']) {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.setViewport({ width: 600, height: 420 });
    await page.goto(`http://127.0.0.1:${server.address().port}/?kind=${kind}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.ready && window.qa.stats);
    const hash = async () => createHash('sha256').update(await page.screenshot()).digest('hex');
    const initial = await hash(); await wait(300); assert.equal(await hash(), initial, 'sem dado novo nada se move');
    await page.evaluate(() => scene.update(input)); assert.equal(await hash(), initial, 'mesma leitura preserva pose');
    await page.evaluate(() => scene.update({ ...input, fraction: 1, confirmed: 6 })); assert.notEqual(await hash(), initial, 'nova leitura altera carga/coluna');
    await page.screenshot({ path: resolve(out, `${kind}-fresh.png`) });
    await page.evaluate(() => scene.update({ ...input, fresh: false }));
    const stale = await hash(); await wait(300); assert.equal(await hash(), stale, 'estado sem leitura fica parado'); assert.notEqual(stale, initial);
    await page.screenshot({ path: resolve(out, `${kind}-stale.png`) });
    await page.setViewport({ width: 320, height: 200 }); await wait(100);
    await page.screenshot({ path: resolve(out, `${kind}-mobile.png`) });
    assert.deepEqual(await page.evaluate(() => qa.errors), []);
    await page.evaluate(() => scene.dispose()); assert.equal(await page.$('canvas'), null);
    assert.deepEqual(errors, []); await page.close();
    console.log('PASSOU', kind, 'renderer, ausência de laço, atualização discreta, stale, resize e dispose.');
  }
  console.log('Não comprova calibração, hardware, GPU real ou projetor. Capturas:', out);
} finally { if (browser) await browser.close(); await new Promise(r => server.close(r)); }
