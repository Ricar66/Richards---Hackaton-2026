// Ensaio visual dos componentes reais, em HTTP local, com fixtures explicitamente SIMULADAS e SEM banco.
// node scripts/e2e/map-models.mjs --serve: inspeção manual, sem iniciar o Puppeteer.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { out, prepareMapPreview } from './map-preview.mjs';

const { html } = await prepareMapPreview();
const server = createServer((req, res) => { if (req.url !== '/' && req.url !== '/index.html') { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(html); });
await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
const origin = `http://127.0.0.1:${server.address().port}`;
if (process.argv.includes('--serve')) {
  console.log(`PRÉVIA LOCAL · SIMULADA · ${origin} · Ctrl+C para encerrar. Não é uma aprovação visual.`);
} else {
  const report = { status: 'NÃO EXECUTADO', checks: [], errors: [], gpu: null, screenshots: [], limitation: 'Sem celular físico, projetor ou teste de hardware.' };
  let browser;
  const pause = ms => new Promise(ok => setTimeout(ok, ms));
  try {
    const executablePath = [process.env.CHROME_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome', `${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`, `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`].find(p => p && existsSync(p));
    if (!executablePath) throw new Error('Chrome não encontrado; defina CHROME_PATH.');
    browser = await puppeteer.launch({ executablePath, headless: true, pipe: true, timeout: 15000, args: process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : [] });
    const page = await browser.newPage();
    page.on('pageerror', e => report.errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    const requests = [];
    page.on('request', req => { if (!req.url().startsWith(origin) && !req.url().startsWith('data:') && !req.url().startsWith('blob:')) requests.push(req.url()); });
    await page.evaluateOnNewDocument(() => {
      window.__draws = 0;
      for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
        const original = WebGL2RenderingContext.prototype[name];
        WebGL2RenderingContext.prototype[name] = function (...args) { window.__draws++; return original.apply(this, args); };
      }
    });
    await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });
    await page.goto(origin, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__mapQA?.ready || window.__mapQA?.failure, { timeout: 20000 });
    assert.equal(await page.evaluate(() => window.__mapQA.failure), '');
    report.gpu = await page.evaluate(() => { const gl = document.querySelector('canvas').getContext('webgl2'), ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'não exposta'; });
    const check = name => report.checks.push({ name, status: 'PASSOU' });
    const shot = async name => { const file = `${name}.png`; await page.$('.qa-wrap').then(el => el.screenshot({ path: resolve(out, file) })); report.screenshots.push(file); };
    for (const kind of ['HOUSE', 'COMMERCE', 'BUILDING', 'CONSTRUCTION']) {
      await page.click(`[data-kind="${kind}"]`);
      await page.waitForFunction(k => window.__mapQA.kind === k, {}, kind);
      await pause(700);
      assert.equal(await page.$$eval('canvas', els => els.length), 1, 'um único canvas após trocar modelo');
      assert.equal(await page.evaluate(() => window.__mapQA.failure), '');
      await shot(`${kind}-inspection-desktop`);
      for (const name of ['Volume', 'Superior', 'Inspeção']) {
        await page.$$eval('.hyd-3d-presets button', (els, label) => els.find(el => el.textContent === label).click(), name);
        await pause(350);
        assert.equal(await page.evaluate(() => window.__mapQA.failure), '');
      }
      check(`${kind}: troca, três enquadramentos e um canvas`);
      if (kind === 'BUILDING' || kind === 'CONSTRUCTION') {
        await page.click('.hyd-3d-floors button'); await pause(350); await shot(`${kind}-all-floors`);
      }
      await page.setViewport({ width: 390, height: 1000, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
      await pause(400);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'sem rolagem horizontal em 390');
      const selected = await page.$eval('.hyd-3d-node.sel', el => { const r = el.getBoundingClientRect(), host = el.closest('.hyd-3d').getBoundingClientRect(); return r.left >= host.left && r.right <= host.right && r.top >= host.top && r.bottom <= host.bottom; });
      assert.ok(selected, 'rótulo selecionado cabe no quadro');
      await shot(`${kind}-mobile-390`); check(`${kind}: retrato 390, rótulo dentro do quadro`);
      await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
    }
    await page.click('[data-kind="HOUSE"]'); await pause(700);
    const delta = async () => { const before = await page.evaluate(() => window.__draws); await pause(550); return (await page.evaluate(() => window.__draws)) - before; };
    assert.equal(await delta(), 0); check('Sem medidor: renderer não mantém laço contínuo');
    await page.select('[aria-label="Fixture de telemetria"]', 'flow'); await pause(700);
    assert.ok(await delta() > 20); check('Um ponto com fixture SIMULADA positiva: renderização ativa');
    await page.click('.qa-controls button'); await pause(400);
    assert.equal(await delta(), 0); check('Pausa: nenhum desenho contínuo');
    await page.click('.qa-controls button');
    for (const mode of ['zero', 'stale', 'none']) {
      await page.select('[aria-label="Fixture de telemetria"]', mode); await pause(400);
      assert.equal(await delta(), 0); check(`${mode}: nenhum desenho contínuo`);
    }
    assert.equal(requests.length, 0, 'sem pedidos externos'); assert.equal(report.errors.length, 0, 'sem erro JavaScript');
    check('Sem pedidos externos nem erros de JavaScript'); report.status = 'PASSOU';
  } catch (e) {
    report.status = browser ? 'FALHOU' : 'NÃO EXECUTADO'; report.errors.push(String(e)); process.exitCode = 1;
  } finally {
    await browser?.close(); server.close();
    await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  }
}
