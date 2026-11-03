// Jornadas ponta a ponta no navegador: A (água), B (doações), C (relatório), responsividade e banco fora do ar.
// Chamado por scripts/e2e/run.mjs, que prepara o banco de TESTE e sobe a instância isolada.
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

export async function runJourneys({ base, project, chromePath, outDir, auth, withDbOutage }) {
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
    let t;

    // ---------- Jornada A: água ----------
    await page.goto(base + "/", { waitUntil: "networkidle0" });
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
    await page.goto(base + "/", { waitUntil: "networkidle0" });

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
    let simOut = ""; sim.stdout.on("data", d => simOut += d); sim.stderr.on("data", d => simOut += d);
    const toast = await page.waitForFunction(() => document.querySelector(".toast")?.innerText.includes("Nova ocorrência"), { timeout: 90000 }).then(() => true, () => false);
    check("A5 leituras do simulador abrem ocorrência e o BI avisa sozinho (polling 5 s)", toast);
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
    await page.goto(base + "/?range=24h", { waitUntil: "networkidle0" }); await wait(1200);
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
    await page.goto(base + "/doacoes", { waitUntil: "networkidle0" });
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
    await page.goto(base + "/relatorios?range=24h", { waitUntil: "networkidle0" });
    const figures = await page.$$eval("[aria-labelledby=p-check] .check-list li", lis => lis.map(li => [li.querySelector("span").innerText, li.querySelector("b").innerText]));
    const b64 = await page.evaluate(async () => { const r = await fetch("/api/reports/summary?range=24h"); const a = new Uint8Array(await r.arrayBuffer()); let s = ""; for (const x of a) s += String.fromCharCode(x); return btoa(s); });
    const pdf = pdfText(Buffer.from(b64, "base64"));
    const missing = figures.filter(([, v]) => !pdf.includes(v));
    check(`C1 PDF tem os ${figures.length} números da prévia do BI (mesmo filtro 24 h)`, figures.length === 6 && missing.length === 0, missing.map(m => m.join("=")).join("; "));
    await clickButton("", "Gerar PDF");
    check("C2 botão gera o PDF e mostra nome, hora e tamanho", await waitText("richards-relatorio-"));

    // ---------- Responsividade ----------
    const pages = ["/", "/monitoramento", "/ocorrencias", "/doacoes", "/relatorios", "/dispositivos"];
    for (const [w, h] of [[375, 812], [768, 1024], [1440, 900]]) {
      await page.setViewport({ width: w, height: h, isMobile: w < 800, hasTouch: w < 800 });
      const over = [];
      for (const p of pages) {
        await page.goto(base + p, { waitUntil: "networkidle0" }); await wait(500);
        const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (o > 0) over.push(`${p}:${o}px`);
        if (p === "/" || p === "/doacoes") await page.screenshot({ path: shot(`j-${w}${p === "/" ? "-home" : p.replace("/", "-")}.png`), fullPage: w < 800 });
      }
      check(`R ${w}px: 6 telas sem rolagem horizontal`, over.length === 0, over.join(", "));
    }
    await page.setViewport({ width: 1440, height: 900 });

    // ---------- Banco fora do ar (opcional: para o container db compartilhado por alguns segundos) ----------
    if (withDbOutage) {
      await page.goto(base + "/", { waitUntil: "networkidle0" });
      execSync("docker compose stop db", { cwd: project, stdio: "ignore" });
      try {
        check("E1 polling falha: faixa de números parados aparece", await waitText("Sem conexão com o servidor desde", 30000));
        check("E1 indicador ao vivo mostra servidor indisponível", await waitText("Servidor indisponível", 15000));
        await page.goto(base + "/", { waitUntil: "networkidle0" }).catch(() => {});
        t = await text();
        check("E2 recarregar sem banco: erro honesto, nenhum KPI", t.includes("Dados indisponíveis no momento") && !(await page.$(".kpi")));
        await page.screenshot({ path: shot("j-banco-fora.png") });
      } finally {
        execSync("docker compose start db", { cwd: project, stdio: "ignore" });
        for (let i = 0; i < 40; i++) { try { if (execSync("docker inspect -f {{.State.Health.Status}} richards-platform-db-1").toString().trim() === "healthy") break; } catch {} await wait(1500); }
      }
      await page.goto(base + "/", { waitUntil: "networkidle0" });
      check("E3 banco de volta: dados reaparecem", (await text()).includes("Centro de controle") && !!(await page.$(".kpi")));
    }
  } finally {
    check("Sem erro de JavaScript na página durante as jornadas", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    console.log(`\n${results.filter(r => r.ok).length}/${results.length} verificações passaram`);
    await browser.close();
  }
  return results;
}
