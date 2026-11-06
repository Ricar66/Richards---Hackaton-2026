// Jornadas ponta a ponta no navegador: A (água), B (doações), C (relatório), Sala ao vivo, responsividade e banco fora do ar.
// Chamado por scripts/e2e/run.mjs, que prepara o banco de TESTE e sobe a instância isolada.
// O BI mantém um stream SSE aberto: a rede nunca fica ociosa, então nada aqui espera "networkidle"; use go().
// page.authenticate cobre o EventSource (conferido com Chrome headless + servidor Basic Auth de teste).
import puppeteer from "puppeteer-core";
import { spawn, execSync } from "node:child_process";
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

    await page.click("[aria-label=Período] button:nth-child(1)");
    await page.waitForFunction(() => location.search.includes("range=24h"), { timeout: 15000 });
    check("A2 filtro 24 h vai para a URL e recalcula (intervalos de 15 min)", await waitText("a cada 15 min"));
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
    const blocked = await page.evaluate(() => [...document.querySelectorAll(".drawer button")].find(b => b.innerText.includes("Registrar verificação")).disabled);
    for (const cb of await page.$$(".checks input")) await cb.click();
    await page.type("#don-who", "Paula Mendes, nutricionista");
    await clickButton(".drawer", "Registrar verificação");
    check("B2 verificação exige checklist + nome (botão bloqueado antes) e libera o lote", blocked && await waitText("Reservar para uma instituição"));
    await page.waitForFunction(() => document.querySelectorAll("#don-rec option").length > 1, { timeout: 10000 });
    const institutions = await page.$$eval("#don-rec option", os => os.length - 1);
    await page.select("#don-rec", await page.$$eval("#don-rec option", os => os[os.length - 1].value));
    await clickButton(".drawer", "Reservar");
    check(`B3 reserva escolhendo a instituição (${institutions} ativas)`, await waitText("Confirmar a entrega"));
    await page.type("#don-recv", "Seu Jorge (recebimento)");
    await clickButton(".drawer", "Confirmar entrega");
    check("B4 entrega confirmada com quem recebeu; trilha com 4 etapas", await waitText("Este lote conta nos kg entregues") && (await page.$$(".drawer .timeline li")).length === 4);
    await page.screenshot({ path: shot("j-doacao.png") });
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

    // ---------- Sala ao vivo (telão, outra aba: a raiz traz data-stage e o estado real do stream em data-live-state) ----------
    const stage = await browser.newPage();
    stage.on("pageerror", e => pageErrors.push(`/ao-vivo: ${e.message}`));
    await stage.authenticate(auth);
    await stage.setViewport({ width: 1920, height: 1080 });
    const stageOk = await stage.goto(base + "/ao-vivo", { waitUntil: "load" }).then(() => stage.waitForSelector("[data-stage][data-live-state]", { timeout: 15000 })).then(() => true, () => false);
    const stageState = stageOk ? await stage.$eval("[data-stage]", el => el.getAttribute("data-live-state")) : null;
    if (stageOk) { await wait(1500); await stage.screenshot({ path: shot("j-sala-ao-vivo.png") }); }
    check("S1 Sala ao vivo carrega (raiz [data-stage] com data-live-state)", stageOk, stageState ? `estado ${stageState}` : "");
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

    // ---------- Banco fora do ar (opcional: para o container db compartilhado por alguns segundos) ----------
    if (withDbOutage) {
      await go("/");
      execSync("docker compose stop db", { cwd: project, stdio: "ignore" });
      try {
        check("E1 sem banco: busca falha e a faixa de números parados aparece", await waitText("Sem conexão com o servidor desde", 30000));
        check("E1 indicador ao vivo mostra servidor indisponível", await waitText("Servidor indisponível", 15000), `sinal ${await pillState()}`);
        await page.goto(base + "/", { waitUntil: "load" }).catch(() => {});
        await waitText("Dados indisponíveis no momento", 15000);
        t = await text();
        check("E2 recarregar sem banco: erro honesto, nenhum KPI", t.includes("Dados indisponíveis no momento") && !(await page.$(".kpi")));
        await page.screenshot({ path: shot("j-banco-fora.png") });
      } finally {
        execSync("docker compose start db", { cwd: project, stdio: "ignore" });
        for (let i = 0; i < 40; i++) { try { if (execSync("docker inspect -f {{.State.Health.Status}} richards-platform-db-1").toString().trim() === "healthy") break; } catch {} await wait(1500); }
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
