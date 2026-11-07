// Teste visual/interativo contra Next LOCAL. Não grava dados, não acessa VPS/hardware.
// E2E_BASE_URL=http://localhost:3100 node scripts/e2e/twin-responsive.mjs
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const base = process.env.E2E_BASE_URL || 'http://localhost:3100';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw Error('Somente servidor local isolado');
const out = resolve('.e2e/twin-responsive'); await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (process.env.RICHARDS_OPERATOR_USER && process.env.RICHARDS_OPERATOR_PASSWORD) await page.authenticate({ username: process.env.RICHARDS_OPERATOR_USER, password: process.env.RICHARDS_OPERATOR_PASSWORD });
  for (const [width, height] of [[320, 568], [360, 640], [390, 844], [768, 1024], [844, 390], [1920, 1080]]) {
    await page.setViewport({ width, height });
    const response = await page.goto(base + '/ao-vivo?3d=0', { waitUntil: 'domcontentloaded' });
    assert.equal(response.status(), 200);
    await page.waitForSelector('.twin-expand');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: sem rolagem horizontal`);
    assert.ok(await page.$$eval('.inst', list => list.every(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth; })), `${width}: cartões dentro da largura`);
    assert.equal(await page.$$eval('.instrument-twin', list => list.length), 2, 'dois instrumentos adicionais');
    assert.ok(await page.$$eval('.instrument-twin', list => list.every(e => { const r = e.getBoundingClientRect(), p = e.closest('.inst').getBoundingClientRect(); return r.width > 0 && r.height >= 45 && r.left >= p.left && r.right <= p.right; })), `${width}: modelos dentro dos cartões`);
    assert.ok(await page.$$eval('.instrument-twin', list => list.every(e => e.dataset.instrumentMode === 'svg')), 'opção 2D vale para todos os instrumentos');
    await page.click('.twin-expand'); await page.waitForSelector('[role="dialog"]');
    const fit = await page.$eval('[role="dialog"]', panel => {
      const bounds = panel.getBoundingClientRect();
      return bounds.top >= 0 && bounds.left >= 0 && bounds.bottom <= innerHeight && bounds.right <= innerWidth &&
        [...panel.querySelectorAll('button')].filter(b => !b.disabled).every(b => { const r = b.getBoundingClientRect(); return r.height >= 44 && r.left >= bounds.left && r.right <= bounds.right && r.bottom <= bounds.bottom; });
    });
    assert.ok(fit, `${width}×${height}: diálogo e alvos de toque cabem na tela`);
    assert.ok(await page.$eval('[role="dialog"] .pipe', e => e.getBoundingClientRect().height > 30), 'gêmeo continua visível');
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => document.querySelector('[role="dialog"]').contains(document.activeElement)), 'foco contido');
    await page.screenshot({ path: resolve(out, `${width}x${height}-inspecao.png`) });
    await page.keyboard.press('Escape'); await page.waitForSelector('.twin-slot:not([data-expanded])');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Ampliar gêmeo');
    if (width <= 1024) await page.$eval('.stage-controls', e => e.scrollIntoView());
    await page.click('.stage-controls button:nth-of-type(1)'); await page.waitForSelector('[data-paused]');
    await page.screenshot({ path: resolve(out, `${width}x${height}-sala.png`), fullPage: width <= 1024 });
    console.log(`PASSOU: ${width}×${height}, layout, ampliação, toque, foco, Esc e pausa.`);
  }
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(base + '/ao-vivo?3d=1', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-twin-reason="reduced"]');
  assert.ok(await page.$eval('.stage-controls button:nth-of-type(2)', e => e.disabled));
  assert.deepEqual(errors, []);
  console.log('PASSOU: movimento reduzido, fallback SVG e zero erros JS.');
} finally { await browser.close(); }
