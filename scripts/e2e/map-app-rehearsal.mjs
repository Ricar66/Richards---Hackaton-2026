// Ensaio da /mapa na aplicação COMPLETA: next start + API + banco de TESTE + GPU real + bancada SIMULADA.
// Foi o aceite do PR #12 (maquetes 3D) em 08/11/2026: 24/24 no notebook com GPU Intel integrada.
//
// Uso (na raiz do projeto): node scripts/e2e/map-app-rehearsal.mjs [pasta-de-saída]   (padrão: .e2e/map-app)
// Pré-requisitos: `pnpm build`; container do Postgres no ar; `.env` com TEST_DATABASE_URL terminando em _test
// e o login do operador; Chrome instalado (CHROME_PATH se não for o padrão); porta 3120 livre.
// ATENÇÃO: ZERA o banco de TESTE (recusa qualquer banco que não termine em _test) e grava leituras SIMULATED nele.
// Nunca aponte para o banco da demo. Sem GPU (CI), N1 falha: o ensaio é para máquina com placa de vídeo.
// Saída: capturas PNG e stats.json (verificações, tarefas longas, quadros, pausa).
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
const project = process.cwd(), outDir = process.argv[2] ?? join(project, ".e2e/map-app");
const require = createRequire(join(project, "package.json"));
require("dotenv").config({ path: join(project, ".env"), quiet: true });
const puppeteer = require("puppeteer-core"), pg = require("pg");
const url = process.env.TEST_DATABASE_URL;
if (!url || !/_test$/.test(new URL(url).pathname)) throw new Error("só banco _test");
const auth = { username: process.env.RICHARDS_OPERATOR_USER, password: process.env.RICHARDS_OPERATOR_PASSWORD };
const PORT = 3120, base = `http://localhost:${PORT}`, env = { ...process.env, DATABASE_URL: url, DEMO_MODE: "true", ASSISTANT_ENABLED: "false", TELEGRAM_ENABLED: "false" };
mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const checks = [], check = (n, ok, d = "") => { checks.push({ n, ok: !!ok, d }); console.log(`${ok ? "PASSOU" : "FALHOU"}  ${n}${d ? "  — " + d : ""}`); };
if (spawnSync("node scripts/test-db-prepare.mjs", { cwd: project, stdio: "ignore", shell: true, env }).status !== 0) throw new Error("prepare");
const c = new pg.Client({ connectionString: url }); await c.connect();
if (!(await c.query("SELECT current_database() n")).rows[0].n.endsWith("_test")) throw new Error("recusado");
await c.query(`TRUNCATE "AuditEvent","Mission","OccurrenceEvent","Occurrence","TelemetryReading","DonationBatch","RecipientOrganization","Device","Site","User","Organization" CASCADE`); await c.end();
spawnSync("pnpm db:seed", { cwd: project, stdio: "ignore", shell: true, env: { ...env, SEED_DEMO_DATA: "false" } });
if (await fetch(base + "/api/health").then(() => true, () => false)) throw new Error("porta ocupada");
const server = spawn(process.execPath, [join(project, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT)], { cwd: project, env, stdio: "ignore" });
for (let i = 0; i < 60; i++) { try { if ((await fetch(base + "/api/health")).ok) break; } catch {} await sleep(1000); }
const executablePath = [process.env.CHROME_PATH, `${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`, `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`, "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && existsSync(p));
if (!executablePath) throw new Error("Chrome não encontrado; defina CHROME_PATH.");
const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const errors = [];
let bancada;
const stats = {};
try {
  const page = await browser.newPage(); await page.authenticate(auth);
  page.on("dialog", d => d.accept());
  page.on("pageerror", e => errors.push(String(e))); page.on("console", m => { if (m.type() === "error" || /WARNING|PCFSoft/.test(m.text())) errors.push(m.text()); });
  await page.evaluateOnNewDocument(() => {
    window.__draws = 0;
    for (const name of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) { const o = WebGL2RenderingContext.prototype[name]; WebGL2RenderingContext.prototype[name] = function (...a) { window.__draws++; return o.apply(this, a); }; }
  });
  await page.evaluateOnNewDocument(() => { window.__lt = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push(e.duration); }).observe({ type: "longtask", buffered: true }); } catch {} });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(base + "/mapa", { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: ".robo-strip{display:none!important}" });
  const ready = () => page.waitForSelector('.hyd-3d-wrap[data-map-mode="3d"]', { timeout: 30000 }).then(() => true, () => false);
  const load = async kind => {
    await page.select(".hyd-editor select", kind);
    await page.$$eval(".hyd-editor .btn", bs => bs.find(b => /Carregar modelo/.test(b.textContent))?.click());
    await sleep(1800);
  };
  const shot = async name => { await sleep(500); await (await page.$(".hyd-3d-wrap")).screenshot({ path: join(outDir, name) }); };
  const hash = async () => createHash("sha256").update(Buffer.from(await (await page.$(".hyd-3d canvas")).screenshot())).digest("hex");
  const cam = label => page.$$eval(".hyd-3d-cam button", (bs, l) => bs.find(b => b.getAttribute("aria-label") === l)?.click(), label);
  const preset = name => page.$$eval(".hyd-3d-presets button", (bs, n) => bs.find(b => b.textContent === n)?.click(), name);
  const canvases = () => page.$$eval("canvas", cs => cs.length);
  /** Maior tarefa longa (ms) desde a marca; sem tarefa longa = 0. */
  const mark = () => page.evaluate(() => window.__lt.length);
  const longest = from => page.evaluate(i => Math.round(Math.max(0, ...window.__lt.slice(i))), from);
  const frames = async ms => { const fr = await page.evaluate(t => new Promise(res => { const d = []; let last = performance.now(); const end = last + t; const step = x => { d.push(x - last); last = x; if (x < end) requestAnimationFrame(step); else res(d); }; requestAnimationFrame(step); }), ms); const s = [...fr].sort((a, b) => a - b), q = p => +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1); return { p50: q(0.5), p95: q(0.95), n: fr.length }; };

  check("N1 /mapa abre na maquete 3D com a GPU real", await ready());
  for (const [kind, name] of [["HOUSE", "casa"], ["COMMERCE", "mercado"], ["CONSTRUCTION", "obra"], ["BUILDING", "predio"]]) {
    await load(kind);
    const labels = await page.$$eval(".hyd-3d-node", ns => ns.length);
    const mode = await page.$eval(".hyd-mode", e => e.textContent);
    check(`N2 ${name}: maquete desenhada na aplicação completa, ${labels} rótulos`, labels > 0 && /3D/.test(mode) && await canvases() === 1, mode);
    await shot(`${name}-inspecao.png`);
    const m0 = await mark();
    await preset("Volume"); await sleep(1500);
    const lt = await longest(m0); stats[`${name}-volume-longtask`] = lt;
    await shot(`${name}-volume.png`);
    await preset("Superior"); await sleep(900); await shot(`${name}-superior.png`);
    const m1 = await mark();
    await preset("Inspeção"); await sleep(1500);
    const lt2 = await longest(m1);
    check(`N3 ${name}: Inspeção ↔ Volume ↔ Superior com um canvas e sem travar (maior tarefa longa ≤ 400 ms)`, await canvases() === 1 && lt <= 400 && lt2 <= 400 && /3D/.test(await page.$eval(".hyd-mode", e => e.textContent)), `→Volume ${lt} ms · →Inspeção ${lt2} ms`);
  }
  // Prédio: um pavimento e de volta ao prédio inteiro.
  await page.$$eval(".hyd-3d-floors button", bs => bs.find(b => /2º/.test(b.textContent))?.click()); await sleep(900);
  const onFloor = await page.$$eval(".hyd-3d-node", ns => ns.map(n => n.textContent));
  check("N4 prédio: o 2º pavimento mostra só os pontos dele", onFloor.length >= 3 && onFloor.every(t => /20[12]|^\d+$/.test(t.trim())), `${onFloor.length} rótulos`);
  await shot("predio-2pav.png");
  await page.$$eval(".hyd-3d-floors button", bs => bs[0].click()); await sleep(900);

  // Mercado com medidor na pia industrial e leitura SIMULADA da bancada (banco de TESTE).
  await load("COMMERCE");
  await page.click(".hyd-point-list button:nth-child(3)"); await sleep(200);
  const devSel = await page.$$eval(".hyd-point-editor select", ss => ss.findIndex(s => [...s.options].some(o => /Sem sensor/.test(o.textContent))));
  const opt = await page.$$eval(".hyd-point-editor select", (ss, i) => [...ss[i].options].map(o => o.value).find(v => v), devSel);
  await page.$$eval(".hyd-point-editor select", (ss, [i, v]) => { const s = ss[i]; s.value = v; s.dispatchEvent(new Event("change", { bubbles: true })); }, [devSel, opt]);
  await page.click(".hyd-toolbar .primary");
  check("N5 mercado salvo com o medidor na pia industrial", await page.waitForFunction(() => document.body.innerText.includes("Planta salva com auditoria"), { timeout: 15000 }).then(() => true, () => false));
  await page.select(".hyd-toolbar label:nth-of-type(2) select", "SIMULATED");
  bancada = spawn(process.execPath, [join(project, "node_modules/tsx/dist/cli.mjs"), "src/iot/run-bancada-virtual.ts", "--cenario", "palco", "--inicio-em", "1"], { cwd: project, env, stdio: "ignore" });
  const flowing = await page.waitForFunction(() => { const t = document.querySelector(".hyd-3d-node.sel small")?.textContent ?? ""; const m = /([\d.,]+) L\/min/.exec(t); return !!m && parseFloat(m[1].replace(/\./g, "").replace(",", ".")) > 0; }, { timeout: 90000 }).then(() => true, () => false);
  await sleep(2500);
  const h1 = await hash(); await sleep(500); const h2 = await hash();
  check("N6 leitura SIMULADA chega à pia industrial e a água corre (canvas muda)", flowing && h1 !== h2, await page.$eval(".hyd-3d-node.sel", e => e.innerText.replace(/\n/g, " ")).catch(() => "—"));
  const fi = await frames(6000); stats.inspecaoAgua = fi;
  check("N7 desempenho com água correndo, Inspeção: p95 ≤ 20 ms", fi.p95 <= 20, `p50 ${fi.p50} · p95 ${fi.p95} · ${await page.$eval(".hyd-mode", e => e.textContent)}`);
  await shot("mercado-agua-inspecao.png");
  await preset("Volume"); await sleep(1500);
  const fv = await frames(6000); stats.volumeAgua = fv;
  check("N8 desempenho com água correndo, Volume: p95 ≤ 20 ms", fv.p95 <= 20, `p50 ${fv.p50} · p95 ${fv.p95} · ${await page.$eval(".hyd-mode", e => e.textContent)}`);
  await shot("mercado-agua-volume.png");
  await preset("Inspeção"); await sleep(1200);
  // Focar no ponto selecionado: câmera muda e o rótulo selecionado fica dentro do quadro.
  const f1 = await hash(); await cam("Focar ponto selecionado"); await sleep(900); const f2 = await hash();
  const inside = await page.$eval(".hyd-3d-node.sel", el => { const r = el.getBoundingClientRect(), h = el.closest(".hyd-3d").getBoundingClientRect(); return r.left >= h.left && r.right <= h.right && r.top >= h.top && r.bottom <= h.bottom; });
  check("N9 Focar ponto aproxima a pia e o rótulo fica dentro do quadro", f1 !== f2 && inside);
  await shot("mercado-foco.png");
  // Nomes: recolhe nomes de cômodo e deixa o selecionado cheio.
  const roomsBefore = await page.$$eval(".hyd-3d-room", r => r.length);
  await cam("Mostrar nomes na maquete"); await sleep(400);
  const roomsAfter = await page.$$eval(".hyd-3d-room", r => r.length), fullOthers = await page.$$eval(".hyd-3d-node:not(.sel):not(.mini):not(.dot)", r => r.length), selFull = await page.$$eval(".hyd-3d-node.sel:not(.mini):not(.dot)", r => r.length);
  check("N10 Nomes recolhidos: sem nome de cômodo, só o selecionado com rótulo cheio", roomsAfter === 0 && fullOthers === 0 && selFull === 1, `cômodos ${roomsBefore} → ${roomsAfter}`);
  await cam("Mostrar nomes na maquete"); await sleep(300);
  await cam("Vista inicial"); await sleep(600);
  // Tela cheia com o MESMO canvas.
  await cam("Alternar tela cheia da maquete"); await sleep(1200);
  const fs = await page.evaluate(() => ({ el: document.fullscreenElement?.className ?? "", canvases: document.querySelectorAll("canvas").length, w: document.querySelector(".hyd-3d canvas")?.clientWidth ?? 0, vw: innerWidth }));
  if (fs.el) await page.screenshot({ path: join(outDir, "tela-cheia.png") });
  await page.evaluate(() => document.exitFullscreen?.().catch(() => {})); await sleep(900);
  const after = await page.evaluate(() => ({ fs: !!document.fullscreenElement, canvases: document.querySelectorAll("canvas").length }));
  check("N11 tela cheia usa o mesmo canvas e volta ao normal", /hyd-3d-wrap/.test(fs.el) && fs.canvases === 1 && fs.w >= fs.vw - 2 && !after.fs && after.canvases === 1 && /3D/.test(await page.$eval(".hyd-mode", e => e.textContent)), JSON.stringify(fs));
  // Pausa e reduzir movimento congelam. Mede desenhos (laço contínuo ≈ 60 quadros/s) e se o DADO mudou no meio.
  // textContent: innerText de elemento escondido (visibility:hidden) volta vazio.
  const selText = () => page.$eval(".hyd-3d-node.sel", e => e.textContent).catch(() => "—");
  const dr0 = await page.evaluate(() => window.__draws); await sleep(1000); const perSecFlow = (await page.evaluate(() => window.__draws)) - dr0;
  // Contexto do laço no momento da medida. Em 08/11, 1 de 3 rodadas mediu 0 desenhos/s logo depois de sair da tela
  // cheia, com a água correndo; não reproduziu com diagnóstico. Se voltar, isto mostra se a maquete estava na tela.
  const loopCtx = await page.evaluate(() => { const r = document.querySelector(".hyd-3d")?.getBoundingClientRect(); return { top: Math.round(r?.top ?? -1), bottom: Math.round(r?.bottom ?? -1), innerHeight, scrollY, page: document.visibilityState, fullscreen: !!document.fullscreenElement }; });
  await page.$$eval(".hyd-legend .btn", bs => bs[0].click()); await sleep(500);
  const hide = await page.addStyleTag({ content: ".hyd-3d-labels,.hyd-mode,.hyd-3d-tools,.hyd-3d-hint,.hyd-3d-section-note{visibility:hidden!important}" }); await sleep(200);
  const tA = await selText(), dA = await page.evaluate(() => window.__draws);
  const cv = await page.$(".hyd-3d canvas");
  await cv.screenshot({ path: join(outDir, "pausa-1.png") }); const p1 = createHash("sha256").update(readFileSync(join(outDir, "pausa-1.png"))).digest("hex");
  await sleep(700);
  await cv.screenshot({ path: join(outDir, "pausa-2.png") }); const p2 = createHash("sha256").update(readFileSync(join(outDir, "pausa-2.png"))).digest("hex");
  await sleep(300); const perSecPaused = (await page.evaluate(() => window.__draws)) - dA, tB = await selText();
  await page.evaluate(el => el.remove(), hide);
  // Maior diferença por canal (0–255) entre as duas capturas. O compositor do Chrome deixa ruído de 1 nível mesmo
  // com ZERO desenhos de WebGL (medido em 08/11); hash idêntico era rígido demais.
  const toUrl = f => "data:image/png;base64," + readFileSync(join(outDir, f)).toString("base64");
  const pixelDiff = (f1, f2) => page.evaluate(async (u1, u2) => {
    const px = async u => { const im = new Image(); im.src = u; await im.decode(); const c = new OffscreenCanvas(im.width, im.height), g = c.getContext("2d"); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
    const a = await px(u1), b = await px(u2); let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m;
  }, toUrl(f1), toUrl(f2));
  const maxDiff = p1 === p2 ? 0 : await pixelDiff("pausa-1.png", "pausa-2.png");
  stats.pausa = { perSecFlow, perSecPaused, tA, tB, maxDiff, loopCtx };
  // Congelado = sem laço contínuo (menos de 1/6 dos desenhos de 1 s correndo) e quadro igual (≤ 2 níveis) se o dado não mudou.
  check("N12 Pausar movimento congela a maquete", perSecPaused < perSecFlow / 6 && (maxDiff <= 2 || tA !== tB), `desenhos/s correndo ${perSecFlow} · pausado ${perSecPaused} · maior diferença ${maxDiff}/255 · leitura ${tA} → ${tB} · ${JSON.stringify(loopCtx)}`);
  await page.$$eval(".hyd-legend .btn", bs => bs[0].click());
  // Reduzir movimento: mesmo critério da pausa (hash exato falhava pelo ruído de 1 nível do compositor).
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]); await sleep(700);
  const hide2 = await page.addStyleTag({ content: ".hyd-3d-labels,.hyd-mode,.hyd-3d-tools,.hyd-3d-hint,.hyd-3d-section-note{visibility:hidden!important}" }); await sleep(200);
  const uA = await selText(), eA = await page.evaluate(() => window.__draws);
  await cv.screenshot({ path: join(outDir, "reduzir-1.png") }); await sleep(700); await cv.screenshot({ path: join(outDir, "reduzir-2.png") });
  await sleep(300); const perSecReduced = (await page.evaluate(() => window.__draws)) - eA, uB = await selText();
  await page.evaluate(el => el.remove(), hide2);
  const reducedDiff = await pixelDiff("reduzir-1.png", "reduzir-2.png");
  const reducedLabel = await page.$eval(".hyd-3d-node.sel small", e => e.textContent).catch(() => "");
  stats.reduzir = { perSecFlow, perSecReduced, uA, uB, reducedDiff };
  check("N13 reduzir movimento: maquete parada e a leitura continua no rótulo", perSecReduced < perSecFlow / 6 && (reducedDiff <= 2 || uA !== uB) && /L\/min/.test(reducedLabel), `desenhos/s ${perSecReduced} · maior diferença ${reducedDiff}/255 · rótulo ${reducedLabel}`);
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);
  // Girar arrastando: muda a vista e o corte acompanha (as fachadas que viram para a câmera abrem).
  const g1 = await hash();
  const box = await (await page.$(".hyd-3d canvas")).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 420, box.y + box.height / 2 + 20, { steps: 14 }); await page.mouse.up(); await sleep(600);
  const g2 = await hash();
  check("N14 arrastar gira a maquete", g1 !== g2);
  await shot("mercado-girado.png");
  bancada?.kill(); bancada = null;
  // Planta 2D do prédio por pavimento continua.
  await load("BUILDING");
  await page.click(".hyd-views button:nth-child(1)"); await sleep(500);
  const pick = await page.$$eval(".hyd-floor-pick button", bs => bs.map(b => b.textContent));
  await page.$$eval(".hyd-floor-pick button", bs => bs.find(b => /Cobertura/.test(b.textContent))?.click()); await sleep(400);
  const roof = await page.$eval(".hyd-svg", s => s.textContent);
  check("N15 planta 2D do prédio por pavimento", pick.length === 5 && /Caixa d'água superior/.test(roof), pick.join(" | "));
  await page.click(".hyd-views button:nth-child(3)"); await ready(); await sleep(800);
  // Perda de contexto WebGL: cai para a perspectiva vetorial, sem tela em branco.
  await page.evaluate(() => document.querySelector(".hyd-3d canvas").getContext("webgl2").getExtension("WEBGL_lose_context").loseContext());
  const fb = await page.waitForSelector(".hyd-3d-fallback", { timeout: 8000 }).then(() => true, () => false);
  check("N16 perda de contexto WebGL cai para a perspectiva vetorial", fb && /3D indisponível/.test(await page.$eval(".hyd-3d-fallback .hyd-mode", e => e.textContent).catch(() => "")), await page.$eval(".hyd-3d-fallback .hyd-mode", e => e.textContent).catch(() => "—"));
  await page.screenshot({ path: join(outDir, "perda-contexto.png") });
  // Celular 390 (recarrega: isMobile/hasTouch reiniciam a página).
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.reload({ waitUntil: "domcontentloaded" }); await page.addStyleTag({ content: ".robo-strip{display:none!important}" });
  await ready(); await sleep(800);
  check("N17 celular 390: 3D de novo, sem rolagem lateral, com 'Explorar 3D'", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) && /Explorar 3D/.test(await page.$eval(".hyd-3d-cam", e => e.textContent)));
  await shot("celular-390.png");
} finally { bancada?.kill(); await browser.close(); server.kill(); }
check("N18 zero erros de JavaScript e nenhum aviso do three", errors.length === 0, errors.slice(0, 3).join(" | "));
writeFileSync(join(outDir, "stats.json"), JSON.stringify({ checks, stats }, null, 2));
console.log(`${checks.filter(x => x.ok).length}/${checks.length} verificações passaram`);
