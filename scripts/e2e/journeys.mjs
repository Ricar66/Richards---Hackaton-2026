// Jornadas ponta a ponta no navegador: A (água), B (doações), C (relatório), Sala ao vivo, responsividade e banco fora do ar.
// Chamado por scripts/e2e/run.mjs, que prepara o banco de TESTE e sobe a instância isolada.
// O BI mantém um stream SSE aberto: a rede nunca fica ociosa, então nada aqui espera "networkidle"; use go().
// page.authenticate cobre o EventSource (conferido com Chrome headless + servidor Basic Auth de teste).
import puppeteer from "puppeteer-core";
import { spawn, execFileSync } from "node:child_process";
import { inflateSync } from "node:zlib";
import { join } from "node:path";

const wait = ms => new Promise(r => setTimeout(r, ms));

/** Texto desenhado no PDF (operadores Tj), para conferir os números com a prévia do BI. */
function pdfText(buf) {
  const raw = buf.toString("latin1"), out = [], dec = new TextDecoder("windows-1252");
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let body; try { body = inflateSync(Buffer.from(m[1], "latin1")).toString("latin1"); } catch { body = m[1]; }
    for (const t of body.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)) out.push(dec.decode(Buffer.from(t[1], "hex")));
  }
  return out.join("\n");
}

export async function runJourneys({ base, project, chromePath, outDir, auth, deviceKey, withDbOutage }) {
  const results = [];
  const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok }); console.log(`${ok ? "PASSOU" : "FALHOU"}  ${name}${detail ? "  — " + detail : ""}`); };
  const pageErrors = [];
  const shot = name => join(outDir, name);
  const browser = await puppeteer.launch({ executablePath: chromePath, headless: true, userDataDir: join(outDir, "chrome-profile"), args: ["--no-first-run"] });
  try {
    const page = await browser.newPage();
    page.on("pageerror", e => pageErrors.push(e.message));
    await page.authenticate(auth);
    await page.setViewport({ width: 1440, height: 900 });
    const text = () => page.evaluate(() => document.body.innerText);
    // innerText respeita text-transform (rótulos em caixa alta): compara sem diferenciar maiúsculas.
    const waitText = (s, timeout = 15000) => page.waitForFunction(t => document.body.innerText.toLowerCase().includes(t.toLowerCase()), { timeout }, s).then(() => true, () => false);
    const kpi = label => page.evaluate(l => [...document.querySelectorAll(".kpi")].find(k => k.innerText.includes(l))?.querySelector(".kpi-value")?.innerText.replace(/\s+/g, " ").trim(), label);
    const clickButton = (scope, label, exact = false) => page.evaluate((s, l, e) => [...document.querySelectorAll(`${s} button`)].find(b => e ? b.innerText.trim() === l : b.innerText.includes(l)).click(), scope, label, exact);
    // Navega e espera a tela pronta: seletor da página + sinal fora de "conectando" (hidratou; ao vivo ou consulta de reserva).
    // `visible`: no streaming do Next o conteúdo chega antes num <div hidden> e só depois troca o esqueleto;
    // sem isso o seletor casa com o HTML oculto e o innerText ainda é o do esqueleto (servidor frio).
    const go = async (path, sel = ".page-head") => {
      await page.goto(base + path, { waitUntil: "load" });
      await page.waitForSelector(sel, { timeout: 20000, visible: true });
      await page.waitForSelector(".live-pill:not([data-live-state=connecting])", { timeout: 10000 }).catch(() => {});
    };
    const pillState = () => page.$eval(".live-pill", el => el.getAttribute("data-live-state")).catch(() => null);
    let t;

    // ---------- Jornada A: água ----------
    await go("/");
    t = await text();
    const homeOk = t.includes("Centro de controle") && t.includes("DADOS SIMULADOS");
    if (!homeOk) await page.screenshot({ path: shot("j-falha-inicio.png") });
    check("A1 Centro de controle carrega com carimbo de dados simulados", homeOk, homeOk ? "" : t.slice(0, 160).replace(/\s+/g, " "));
    check("A1 KPI de ocorrências ativas vem do banco (seed: 2)", (await kpi("Ocorrências ativas")) === "2", await kpi("Ocorrências ativas"));

    // A2b: cada texto que o KPI de volume mostra na troca de filtro (MutationObserver no body: sobrevive a remontagem).
    // Regra "nada de número inventado": nenhum valor fora do intervalo entre o antigo e o novo, e sem ir e voltar
    // (o valor novo aparecer e a tela regredir ao antigo). Achado da verificação de 06/11: 6.466,4 L entre 6.236,7 e 868,3.
    await page.evaluate(() => {
      const read = () => [...document.querySelectorAll(".kpi")].find(k => k.innerText.includes("Volume observado"))?.querySelector(".kpi-value span")?.textContent ?? null;
      const seen = window.__kpiSeen = [read()];
      window.__kpiObs = new MutationObserver(() => { const v = read(); if (v !== seen[seen.length - 1]) seen.push(v); });
      window.__kpiObs.observe(document.body, { childList: true, characterData: true, subtree: true });
    });
    await page.click("[aria-label=Período] button:nth-child(1)");
    await page.waitForFunction(() => location.search.includes("range=24h"), { timeout: 15000 });
    check("A2 filtro 24 h vai para a URL e recalcula (intervalos de 15 min)", await waitText("a cada 15 min"));
    // A2c: a troca de filtro atualiza a tela no lugar (crossfade por tipo de transição), sem remontar: quem filtra pelo
    // teclado continua no controle. Uma `key` por filtro remontava a tela e jogava o foco no <body>.
    const focusAfter = await page.evaluate(() => { const a = document.activeElement; return a && a !== document.body ? `${a.tagName} "${a.textContent?.trim()}" no ${a.closest("[aria-label]")?.getAttribute("aria-label")}` : "body"; });
    check("A2c troca de filtro mantém o foco no controle (a tela não remonta)", /Período/.test(focusAfter) && /24/.test(focusAfter), focusAfter);
    await wait(900);
    const kpiTrail = await page.evaluate(() => { window.__kpiObs.disconnect(); return window.__kpiSeen; });
    const nums = kpiTrail.map(s => s && /\d/.test(s) ? Number(s.replace(/\./g, "").replace(",", ".")) : null).filter(n => n !== null && Number.isFinite(n));
    const [first, last] = [nums[0], nums[nums.length - 1]];
    const lo = Math.min(first, last), hi = Math.max(first, last);
    const inRange = nums.every(n => n >= lo - 0.05 && n <= hi + 0.05);
    const monotone = nums.every((n, i) => i === 0 || (last >= first ? n >= nums[i - 1] - 0.05 : n <= nums[i - 1] + 0.05));
    // Precondição: o seed dá volumes diferentes em 7 dias e em 24 h. Se o KPI não mudar, não há transição para medir.
    check("A2b KPI na troca de filtro: só valores entre o antigo e o novo, sem ir e voltar", nums.length >= 2 && inRange && monotone,
      nums.length < 2 ? `KPI não mudou (${kpiTrail.join(" → ")}): precondição do seed falhou, nada foi medido`
        : `${nums.length} textos · ${kpiTrail.slice(0, 4).join(" → ")}${kpiTrail.length > 4 ? ` … ${kpiTrail[kpiTrail.length - 1]}` : ""}`);
    await page.evaluate(() => [...document.querySelectorAll("[aria-label='Origem dos dados'] button")].find(b => b.innerText === "Sensor").click());
    await page.waitForFunction(() => location.search.includes("source=DEVICE"), { timeout: 15000 });
    await waitText("SEM LEITURAS");
    check("A2 origem Sensor sem leituras reais: volume 'sem dados', nunca zero", (await kpi("Volume observado")) === "sem dados", await kpi("Volume observado"));
    await go("/");

    // A0: do POST de uma leitura (mesma rota e chave do ESP32) até a pílula mostrar o valor gravado. Medido, não presumido.
    // Leitura SIMULATED e abaixo do limiar (1,5 L/min): não abre ocorrência nem mexe nas jornadas seguintes.
    const liveOk = await page.waitForSelector(".live-pill[data-live-state=live]", { timeout: 15000 }).then(() => true, () => false);
    let a0 = null;
    if (liveOk && deviceKey) {
      const t0 = performance.now();
      const res = await fetch(base + "/api/iot/telemetry", { method: "POST", headers: { "Content-Type": "application/json", "x-device-key": deviceKey, "x-richards-simulator": "true" },
        body: JSON.stringify({ deviceCode: "RICHARDS-FLOW-001", bootId: `e2e-a0-${Date.now().toString(36)}`, sequence: 0, flowLpm: 0.43, deltaLiters: 0.014, capturedAt: new Date().toISOString() }) }).catch(e => ({ status: e.message }));
      const seen = res.status === 202 && await page.waitForFunction(v => document.querySelector(".live-pill")?.innerText.includes(v), { timeout: 10000, polling: 20 }, "0,43 L/min").then(() => true, () => false);
      a0 = { status: res.status, seen, ms: Math.round(performance.now() - t0) };
    }
    check("A0 leitura enviada aparece na pílula ao vivo em menos de 2 s (POST → tela)", a0?.seen && a0.ms < 2000,
      a0 ? `${a0.seen ? `${a0.ms} ms` : "valor não apareceu"} · HTTP ${a0.status}` : `pílula ${await pillState()}${deviceKey ? "" : " · sem IOT_DEMO_DEVICE_KEY"}`);

    // Teclado: Enter abre, Escape fecha e devolve o foco.
    await page.focus("[aria-labelledby=p-queue] .queue button");
    await page.keyboard.press("Enter");
    const opened = await page.waitForSelector("[aria-labelledby=occ-title]", { timeout: 8000 }).then(() => true, () => false);
    await page.keyboard.press("Escape"); await wait(300);
    const focusBack = await page.evaluate(() => !!document.activeElement?.closest(".queue"));
    check("A3 teclado: Enter abre a ocorrência, Escape fecha e o foco volta para a fila", opened && focusBack && !(await page.$("[aria-labelledby=occ-title]")));

    // Resolver a ocorrência do seed (regra: uma ativa por sensor).
    await page.evaluate(() => [...document.querySelectorAll(".queue button")].find(b => b.innerText.includes("Fluxo contínuo fora de horário")).click());
    await page.waitForSelector("[aria-labelledby=occ-title]");
    await waitText("Assumir investigação");
    await clickButton(".drawer", "Assumir investigação");
    check("A4 ACK registrado na linha do tempo com o operador", await waitText("Investigação assumida"));
    await page.type("#occ-note", "Registro da linha 01 fechado na demonstração; vazão zerou.");
    await clickButton(".drawer", "Resolver", true);
    check("A4 resolução com nota aparece na timeline", await waitText("Registro final"));
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => [...document.querySelectorAll(".kpi")].find(k => k.innerText.includes("Ocorrências ativas"))?.querySelector(".kpi-value")?.innerText.trim() === "1", { timeout: 20000 }).catch(() => {});
    check("A4 KPI de ativas cai para 1 sem recarregar a página", (await kpi("Ocorrências ativas")) === "1", await kpi("Ocorrências ativas"));

    // Simulador com o mesmo protocolo do firmware → regra → aviso na tela.
    const sim = spawn(process.execPath, ["scripts/iot-simulator.mjs", "--scenario", "leak", "--samples", "11", "--interval", "4"], { cwd: project, env: { ...process.env, RICHARDS_URL: base } });
    // Momento em que o simulador recebeu o 202 da leitura que abriu a ocorrência (alerted:true), para medir até o aviso.
    let simOut = "", alertAt = null;
    sim.stdout.on("data", d => { simOut += d; if (alertAt === null && /"alerted":true/.test(simOut)) alertAt = performance.now(); }); sim.stderr.on("data", d => simOut += d);
    const toast = await page.waitForFunction(() => document.querySelector(".toast")?.innerText.includes("Nova ocorrência"), { timeout: 90000, polling: 20 }).then(() => true, () => false);
    const toastAt = performance.now();
    check("A5 leituras do simulador abrem ocorrência e o BI avisa sozinho (stream; consulta de 5 s como reserva)", toast, `sinal ${await pillState()}`);
    for (let i = 0; toast && alertAt === null && i < 30; i++) await wait(100);   // a saída do simulador pode chegar depois do aviso
    const a5ms = alertAt === null ? null : Math.round(toastAt - alertAt);
    check("A5b aviso de nova ocorrência em menos de 2 s depois do 202 que a abriu", toast && a5ms !== null && a5ms < 2000,
      a5ms === null ? "simulador não registrou alerted:true" : a5ms <= 0 ? `aviso chegou antes da resposta do POST (${a5ms} ms)` : `${a5ms} ms`);
    await new Promise(r => sim.on("exit", r));
    check("A5 simulador terminou com fila vazia", /"pendingInQueue":0/.test(simOut) && /"accepted":11/.test(simOut), simOut.trim().split("\n").slice(-1).join(""));
    if (toast) {
      await page.evaluate(() => [...document.querySelectorAll(".toast-action")].find(b => b.innerText === "Investigar").click());
      await page.waitForSelector("[aria-labelledby=occ-title]");
      const ev = await page.waitForSelector(".evidence-chart .recharts-line", { timeout: 15000 }).then(() => true, () => false);
      t = await text();
      check("A5 gaveta mostra gráfico da evidência, regra e leituras da janela", ev && t.includes("Janela") && t.includes("L/min por 30 s"));
      await page.screenshot({ path: shot("j-evidencia.png") });
      await page.evaluate(() => [...document.querySelectorAll(".drawer button")].find(b => b.innerText.includes("Assumir investigação"))?.click());
      await waitText("Investigação assumida");
      await page.type("#occ-note", "Torneira de teste fechada; simulador encerrado.");
      await clickButton(".drawer", "Resolver", true);
      check("A5 ocorrência do sensor resolvida com nota", await waitText("Registro final"));
      await page.keyboard.press("Escape");
    }

    // Clique no fim da série (24 h, onde estão as leituras novas) → gaveta do intervalo.
    await go("/?range=24h"); await wait(1200);
    check("A6 marcador da ocorrência aparece no gráfico", !!(await page.$("[aria-labelledby=p-volume] .marker")));
    // Mira a coluna do marcador mais recente, longe dele no eixo vertical (clicar no marcador abre a ocorrência).
    // O gráfico fica abaixo dos cartões de sensores (07/11): rolar até ele antes de medir, senão o clique cai fora da tela.
    await page.$eval("[aria-labelledby=p-volume]", el => el.scrollIntoView({ block: "center" })); await wait(300);
    const box = await (await page.$("[aria-labelledby=p-volume] .recharts-wrapper")).boundingBox();
    const markerX = Math.max(...await page.$$eval("[aria-labelledby=p-volume] .marker", ms => ms.map(m => { const r = m.getBoundingClientRect(); return r.x + r.width / 2; })));
    await page.mouse.move(markerX, box.y + box.height * 0.25); await wait(300);
    await page.mouse.click(markerX, box.y + box.height * 0.25);
    await page.waitForSelector("[aria-labelledby=iv-title]", { timeout: 8000 }).catch(() => {});
    await wait(1500);
    t = await text();
    check("A6 clique no fim da série abre leituras do intervalo", t.includes("Leituras do intervalo"));
    check("A6 intervalo lista a ocorrência por registro (abertura ou janela)", t.includes("Ocorrências ligadas a este intervalo") && (t.includes("aberta às") || t.includes("janela de evidência")));
    await page.screenshot({ path: shot("j-intervalo.png") });
    await page.keyboard.press("Escape");

    // ---------- Jornada B: doações ----------
    await go("/doacoes");
    const kgBefore = await kpi("Kg entregues");
    await clickButton("", "Novo lote");
    await page.type(".new-batch input[maxlength='180']", "Pães da padaria · teste E2E");
    await page.type(".new-batch input[type=number]", "3.5");
    await page.click(".new-batch button[type=submit]");
    check("B1 lote novo entra como verificação pendente", await page.waitForFunction(() => document.querySelector(".board-col.pending_review")?.innerText.includes("Pães da padaria"), { timeout: 15000 }).then(() => true, () => false));
    await page.evaluate(() => [...document.querySelectorAll(".board-col.pending_review .batch button")].find(b => b.innerText.includes("Pães da padaria")).click());
    await page.waitForSelector("#don-who");
    const verifyDisabled = () => page.evaluate(() => [...document.querySelectorAll(".drawer button")].find(b => b.innerText.includes("Registrar verificação")).disabled);
    const blocked = await verifyDisabled();
    // Triagem estruturada (07/11): origem do alimento + responsável com cargo/habilitação + checklist completo.
    for (const cb of await page.$$(".checks input")) await cb.click();
    await page.type("#don-who", "Paula Mendes");
    await page.type("#don-role", "Nutricionista, CRN informado no registro");
    await page.select("#don-origin", "PLATE_LEFTOVERS");
    const unsafeBlocked = await verifyDisabled();
    await page.select("#don-origin", "WHOLE_PRODUCE");
    // Passaporte (08/11): sem equipamento de origem declarado a triagem não sai; escolhido, a evidência aparece antes do checklist valer.
    const noEquipBlocked = await verifyDisabled();
    await page.waitForFunction(() => document.querySelectorAll("#don-equip option").length > 2, { timeout: 10000 });
    await page.select("#don-equip", await page.$$eval("#don-equip option", os => os[1].value));
    const evidence = await page.waitForFunction(() => /na faixa|Sem leitura gravada/.test(document.querySelector(".don-evidence")?.innerText ?? ""), { timeout: 10000 }).then(() => true, () => false);
    await clickButton(".drawer", "Registrar verificação");
    check("B2 triagem exige origem segura, equipamento de origem, responsável com cargo e checklist (bloqueado antes, com restos de prato e sem equipamento) e libera o lote",
      blocked && unsafeBlocked && noEquipBlocked && evidence && await waitText("Reservar para uma instituição"), `antes=${blocked} restos de prato=${unsafeBlocked} sem equipamento=${noEquipBlocked} evidência=${evidence}`);
    await page.waitForFunction(() => document.querySelectorAll("#don-rec option").length > 1, { timeout: 10000 });
    const institutions = await page.$$eval("#don-rec option", os => os.length - 1);
    await page.select("#don-rec", await page.$$eval("#don-rec option", os => os[os.length - 1].value));
    await clickButton(".drawer", "Reservar");
    check(`B3 reserva escolhendo a instituição (${institutions} ativas)`, await waitText("Confirmar a entrega"));
    await page.type("#don-recv", "Seu Jorge (recebimento)");
    await clickButton(".drawer", "Confirmar entrega");
    check("B4 entrega confirmada com quem recebeu; trilha com 4 etapas", await waitText("Este lote conta nos kg entregues") && (await page.$$(".drawer .timeline li")).length === 4);
    await page.screenshot({ path: shot("j-doacao.png") });
    // Passaporte do Alimento: aberto SEM senha (contexto anônimo, como o celular de quem escaneia a etiqueta).
    const passportUrl = await page.$eval(".don-passport a[href*='/p/']", a => a.href).catch(() => "");
    const qrOk = await page.$eval(".don-pass-row img", img => img.complete && img.naturalWidth > 0).catch(() => false);
    const anon = await browser.createBrowserContext();
    try {
      const pub = await anon.newPage();
      await pub.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      const res = passportUrl ? await pub.goto(passportUrl, { waitUntil: "domcontentloaded" }) : null;
      const pt = res ? await pub.evaluate(() => document.body.innerText) : "";
      const noScroll = res ? await pub.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) : false;
      check("B6 passaporte público abre sem senha (200), mostra entrega, instituição e 'Paula M.', sem o nome completo nem quem recebeu; sem rolagem lateral no celular",
        res?.status() === 200 && /doação entregue/i.test(pt) && pt.includes("Paula M.") && !pt.includes("Mendes") && !pt.includes("Seu Jorge") && noScroll && qrOk,
        `status=${res?.status()} qr=${qrOk} scroll=${noScroll}`);
      await pub.screenshot({ path: shot("j-passaporte-390.png"), fullPage: true });
      const bad = await pub.goto(passportUrl.replace(/[a-f0-9]{6}$/, "000000"), { waitUntil: "domcontentloaded" });
      // Sem navegador: navegar até um 401 com Basic Auth faz o Chrome lançar ERR_INVALID_AUTH_CREDENTIALS em vez de devolver o status.
      const apis = await Promise.all(["/api/donations/x", "/api/donations/x/passport-qr", `/etiqueta/x`].map(async p => (await fetch(new URL(p, passportUrl))).status));
      check("B7 token desconhecido dá 404; API do lote, QR e etiqueta seguem fechados sem senha", bad?.status() === 404 && apis.every(s => s === 401), `token=${bad?.status()} privadas=${apis.join(",")}`);
    } finally { await anon.close(); await page.bringToFront(); }
    await page.keyboard.press("Escape");
    await page.waitForFunction(b => [...document.querySelectorAll(".kpi")].find(k => k.innerText.includes("Kg entregues"))?.querySelector(".kpi-value")?.innerText.replace(/\s+/g, " ").trim() !== b, { timeout: 20000 }, kgBefore).catch(() => {});
    check("B5 KPI de kg entregues soma o lote entregue", (await kpi("Kg entregues")) !== kgBefore, `${kgBefore} → ${await kpi("Kg entregues")}`);

    // ---------- Jornada C: relatório ----------
    await go("/relatorios?range=24h");
    const figures = await page.$$eval("[aria-labelledby=p-check] .check-list li", lis => lis.map(li => [li.querySelector("span").innerText, li.querySelector("b").innerText]));
    const b64 = await page.evaluate(async () => { const r = await fetch("/api/reports/summary?range=24h"); const a = new Uint8Array(await r.arrayBuffer()); let s = ""; for (const x of a) s += String.fromCharCode(x); return btoa(s); });
    const pdf = pdfText(Buffer.from(b64, "base64"));
    const missing = figures.filter(([, v]) => !pdf.includes(v));
    check(`C1 PDF tem os ${figures.length} números da prévia do BI (mesmo filtro 24 h)`, figures.length === 6 && missing.length === 0, missing.map(m => m.join("=")).join("; "));
    await clickButton("", "Gerar PDF");
    check("C2 botão gera o PDF e mostra nome, hora e tamanho", await waitText("richards-relatorio-"));

    // N1: trocar de tela pela barra lateral (deslize de saída) e clicar num filtro logo depois: o clique tem de valer.
    // Durante uma view transition o navegador não entrega clique a quem participa dela; por isso a única animação é a
    // saída da tela anterior, sem nomes próprios. Uma revelação/crossfade engolia o clique (pego em 06/11).
    await go("/");
    await page.evaluate(() => [...document.querySelectorAll(".side-link")].find(a => a.innerText.includes("Monitoramento"))?.click());
    await page.waitForFunction(() => location.pathname === "/monitoramento", { timeout: 15000 }).catch(() => {});
    await page.waitForSelector("[aria-label=Período] button", { visible: true, timeout: 20000 }).catch(() => {});
    await page.click("[aria-label=Período] button:nth-child(3)").catch(() => {});
    const n1 = await page.waitForFunction(() => location.search.includes("range=30d"), { timeout: 8000 }).then(() => true, () => false);
    check("N1 barra lateral → filtro clicado logo depois: o clique vale (nenhuma transição engole o clique)", n1, n1 ? "" : `url ${await page.evaluate(() => location.pathname + location.search)}`);

    // ---------- Sala ao vivo (telão, outra aba: a raiz traz data-stage e o estado real do stream em data-live-state) ----------
    const stage = await browser.newPage();
    stage.on("pageerror", e => pageErrors.push(`/ao-vivo: ${e.message}`));
    await stage.authenticate(auth);
    await stage.setViewport({ width: 1920, height: 1080 });
    const stageOk = await stage.goto(base + "/ao-vivo", { waitUntil: "load" }).then(() => stage.waitForSelector("[data-stage][data-live-state]", { timeout: 15000 })).then(() => true, () => false);
    const stageState = stageOk ? await stage.$eval("[data-stage]", el => el.getAttribute("data-live-state")) : null;
    if (stageOk) { await wait(1500); await stage.screenshot({ path: shot("j-sala-ao-vivo.png") }); }
    check("S1 Sala ao vivo carrega (raiz [data-stage] com data-live-state)", stageOk, stageState ? `estado ${stageState}` : "");
    // S2–S5: SVG explícito para rollback, 3D por chave com reserva, teclas 3 e P. O SVG segue acessível.
    await stage.goto(base + "/ao-vivo?3d=0", { waitUntil: "load" });
    const twin = () => stage.$eval(".twin-slot", el => [el.getAttribute("data-twin-mode"), el.getAttribute("data-twin-reason")]).catch(() => [null, null]);
    const [m0, r0] = stageOk ? await twin() : [null, null];
    check("S2 ?3d=0: rollback para SVG (motivo 'off'), sem canvas 3D", m0 === "svg" && r0 === "off" && !(await stage.$(".twin-canvas")), `modo=${m0} motivo=${r0}`);
    await stage.goto(base + "/ao-vivo?3d=1", { waitUntil: "load" }).catch(() => {});
    await stage.waitForFunction(() => { const el = document.querySelector(".twin-slot"); return el && (el.getAttribute("data-twin-mode") === "3d" || el.getAttribute("data-twin-reason")); }, { timeout: 15000 }).catch(() => {});
    const [m1, r1] = await twin();
    const svgA11y = await stage.$eval(".twin-slot > svg.pipe", el => el.getAttribute("role") === "img" && /esquemática/.test(el.getAttribute("aria-label") ?? "")).catch(() => false);
    // Sem GPU (ambiente de CI) a reserva é o resultado CERTO: vale 3d ou SVG com o motivo dito, sempre com o SVG acessível.
    check("S3 ?3d=1: cano 3D por cima (ou SVG com motivo de reserva) e o SVG continua role=img", (m1 === "3d" || (m1 === "svg" && ["no-webgl", "software", "budget", "error"].includes(r1))) && svgA11y, `modo=${m1} motivo=${r1}`);
    if (m1 === "3d") await stage.screenshot({ path: shot("j-sala-3d.png") });
    await stage.keyboard.press("3");
    await stage.waitForFunction(() => document.querySelector(".twin-slot")?.getAttribute("data-twin-reason") === "off", { timeout: 4000 }).catch(() => {});
    const [m2, r2] = await twin();
    check("S4 tecla 3 desliga o 3D: volta ao SVG (motivo 'off') sem canvas", m2 === "svg" && r2 === "off" && !(await stage.$(".twin-canvas")), `modo=${m2} motivo=${r2}`);
    await stage.keyboard.press("p");
    const pausedOk = await stage.waitForSelector("[data-stage][data-paused] .paused-pill", { timeout: 3000 }).then(() => true, () => false);
    await stage.keyboard.press("p");
    const resumed = await stage.waitForFunction(() => !document.querySelector("[data-stage]")?.hasAttribute("data-paused") && !document.querySelector(".paused-pill"), { timeout: 3000 }).then(() => true, () => false);
    check("S5 tecla P pausa o movimento (pílula no cabeçalho) e P retoma", pausedOk && resumed);
    await stage.close();

    // ---------- Responsividade ----------
    const pages = ["/", "/monitoramento", "/ocorrencias", "/doacoes", "/relatorios", "/dispositivos"];
    for (const [w, h] of [[375, 812], [768, 1024], [1440, 900]]) {
      await page.setViewport({ width: w, height: h, isMobile: w < 800, hasTouch: w < 800 });
      const over = [];
      for (const p of pages) {
        await go(p); await wait(500);
        const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (o > 0) over.push(`${p}:${o}px`);
        if (p === "/" || p === "/doacoes") await page.screenshot({ path: shot(`j-${w}${p === "/" ? "-home" : p.replace("/", "-")}.png`), fullPage: w < 800 });
      }
      check(`R ${w}px: 6 telas sem rolagem horizontal`, over.length === 0, over.join(", "));
    }
    await page.setViewport({ width: 1440, height: 900 });

    // ---------- Banco fora do ar (opcional) ----------
    // SÓ em contêiner ISOLADO (E2E_DB_CONTAINER): o `db` do docker compose guarda também o banco da DEMONSTRAÇÃO, e
    // derrubá-lo derrubaria a demo (auditoria final, 06/11). Sem a variável, a queda é recusada.
    const outageContainer = process.env.E2E_DB_CONTAINER?.trim();
    if (withDbOutage && !outageContainer) {
      check("E0 queda do banco recusada: defina E2E_DB_CONTAINER com um Postgres isolado (nunca o db da demonstração)", false);
    }
    if (withDbOutage && outageContainer) {
      // Recusa pelo rótulo do compose (serviço db do projeto), não pelo nome: renomear o contêiner não escapa da trava.
      const labels = JSON.parse(execFileSync("docker", ["inspect", "-f", "{{json .Config.Labels}}", outageContainer]).toString() || "null") ?? {};
      if (labels["com.docker.compose.service"] === "db" && labels["com.docker.compose.project"] === "richards-platform") throw new Error(`E2E_DB_CONTAINER=${outageContainer} é o banco compartilhado da demonstração: recusado`);
      await go("/");
      // A Sala também fica aberta durante a queda: é ela que está no projetor.
      const stageOut = await browser.newPage();
      stageOut.on("pageerror", e => pageErrors.push(`/ao-vivo (banco fora): ${e.message}`));
      await stageOut.authenticate(auth);
      await stageOut.setViewport({ width: 1920, height: 1080 });
      await stageOut.goto(base + "/ao-vivo", { waitUntil: "load" }).catch(() => {});
      await stageOut.waitForSelector('[data-stage][data-live-state="live"]', { timeout: 15000 }).catch(() => {});
      execFileSync("docker", ["stop", outageContainer], { stdio: "ignore" });
      try {
        await stageOut.waitForFunction(() => document.querySelector(".snap-error") && document.querySelector(".lost-banner"), { timeout: 40000 }).catch(() => {});
        const sala = await stageOut.evaluate(() => {
          const box = s => document.querySelector(s)?.getBoundingClientRect() ?? null;
          const a = box(".lost-banner"), b = box(".snap-error");
          return { text: document.querySelector(".snap-error")?.innerText.replace(/\s+/g, " ") ?? null, both: !!(a && b),
            overlap: !!(a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) };
        });
        // Com snapshot na tela, dizer "nenhum número é exibido" seria falso: os números estão lá, congelados (ensaio de 06/11).
        check("E1c Sala sem banco: aviso diz que os números estão congelados no snapshot e não cobre o SINAL PERDIDO",
          !!sala.text && /congelados no snapshot das \d\d:\d\d:\d\d/.test(sala.text) && !/nenhum número é exibido/i.test(sala.text) && sala.both && !sala.overlap,
          `${sala.text ?? "aviso não apareceu"}${sala.both ? "" : " · faltou um dos avisos"}${sala.overlap ? " · SOBREPOSTOS" : ""}`);
        await stageOut.screenshot({ path: shot("j-sala-banco-fora.png") });
        await stageOut.close();
        await page.bringToFront();
        check("E1 sem banco: busca falha e a faixa de números parados aparece", await waitText("Sem conexão com o servidor desde", 30000));
        check("E1 indicador ao vivo mostra servidor indisponível", await waitText("Servidor indisponível", 15000), `sinal ${await pillState()}`);
        await page.goto(base + "/", { waitUntil: "load" }).catch(() => {});
        await waitText("Dados indisponíveis no momento", 15000);
        t = await text();
        check("E2 recarregar sem banco: erro honesto, nenhum KPI", t.includes("Dados indisponíveis no momento") && !(await page.$(".kpi")));
        await page.screenshot({ path: shot("j-banco-fora.png") });
      } finally {
        execFileSync("docker", ["start", outageContainer], { stdio: "ignore" });
        for (let i = 0; i < 40; i++) { try { execFileSync("docker", ["exec", outageContainer, "pg_isready", "-q"], { stdio: "ignore" }); break; } catch {} await wait(1500); }
      }
      // A tela de erro continua dentro do shell: o stream se reconecta sozinho (espera crescente até 30 s), sem recarregar.
      check("E1b banco de volta: sinal volta a ao vivo sem recarregar a página", await page.waitForSelector(".live-pill[data-live-state=live]", { timeout: 60000 }).then(() => true, () => false), `sinal ${await pillState()}`);
      await go("/").catch(() => {});
      check("E3 banco de volta: dados reaparecem", (await text()).includes("Centro de controle") && !!(await page.$(".kpi")));
    }
  } finally {
    check("Sem erro de JavaScript na página durante as jornadas", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    console.log(`\n${results.filter(r => r.ok).length}/${results.length} verificações passaram`);
    await browser.close();
  }
  return results;
}
