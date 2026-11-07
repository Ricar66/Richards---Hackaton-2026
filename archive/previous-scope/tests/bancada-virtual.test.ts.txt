import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Acompanhamento, avisoVazaoAlheia, CENARIOS, cenario, ensaiar, ESPERA_VAZAO_ALHEIA_S, instantes, REGRAS_PADRAO, vazaoAlheiaChegando, type Marcos,
} from "../src/iot/bancada-virtual";
import { activeOrigin } from "../src/components/bi/digital-twin";
import { mqttPayloadSchema } from "../src/iot/mqtt-payload";
import { FlowAlertPolicy, type FlowSample } from "../src/modules/monitoring/domain/flow-alert-policy";
import { ScaleSurplusDetector } from "../src/modules/monitoring/domain/scale-surplus-detector";
import type { SignalSample } from "../src/modules/monitoring/domain/sustained-run";
import { TemperatureAlertPolicy } from "../src/modules/monitoring/domain/temperature-alert-policy";

const t0 = new Date("2026-11-07T13:00:00Z").getTime();
const at = (t: number) => new Date(t0 + t * 1000);

/** Aplica o cenário, leitura a leitura, às políticas REAIS com as regras padrão (sem banco). Primeiro disparo de cada uma. */
function aplicar(nome: (typeof CENARIOS)[number], m: Marcos = {}) {
  const c = cenario(nome);
  const flow = new FlowAlertPolicy(1.5, 30), temp = new TemperatureAlertPolicy(28, 30), scale = new ScaleSurplusDetector(5, 6);
  const fluxo: FlowSample[] = [], temps: SignalSample[] = [];
  const out: { fluxo?: number; temperatura?: number; lote?: { t: number; kg: number }; maiorJanelaFluxo: number } = { maiorJanelaFluxo: 0 };
  for (const t of instantes(c, 400)) {
    const v = c.leitura(t, m);
    fluxo.push({ capturedAt: at(t), flowLpm: v.VAZAO, deltaLiters: (v.VAZAO * 2) / 60 });
    temps.push({ at: at(t), value: v.TEMP });
    const f = flow.evaluate(fluxo);
    out.maiorJanelaFluxo = Math.max(out.maiorJanelaFluxo, f.observedSeconds);
    if (f.suspicious) out.fluxo ??= t;
    if (temp.evaluate(temps).suspicious && out.temperatura === undefined) { out.temperatura = t; m.temperaturaAberta ??= t; }
    const d = scale.push({ at: at(t), value: v.PESO });
    if (d.trigger) out.lote ??= { t, kg: d.weightKg };
  }
  return out;
}

test("bancada virtual · palco nas políticas reais: fluxo em T+30, temperatura em T+48, lote de 6,0 kg 8 s depois da caixa", () => {
  const r = aplicar("palco");
  assert.equal(r.fluxo, 30, "16ª leitura com 2,4 L/min completa 30 s acima de 1,5 L/min (a regra não foi encurtada)");
  assert.equal(r.temperatura, 48, "1ª leitura acima de 28 °C em T+18, ocorrência 30 s depois");
  assert.deepEqual(r.lote, { t: 78, kg: 6 }, "sem reação a caixa entra em T+70 (3,1 kg) e fica 6 s estável; menor leitura 6,06 → 6,0 kg");
  assert.deepEqual(ensaiar(cenario("palco")).map(d => [d.tipo, d.t, d.kg]), [["UNUSUAL_FLOW", 30, undefined], ["TEMPERATURE_EXCURSION", 48, undefined], ["LOTE", 78, 6]], "o ensaio impresso pelo comando concorda");
});

test("bancada virtual · pico de 3 L/min por 10 s, repetido, nunca abre ocorrência", () => {
  const r = aplicar("pico");
  assert.equal(r.fluxo, undefined);
  assert.equal(r.maiorJanelaFluxo, 8, "cada pico rende no máximo 8 s de janela (5 leituras), longe dos 30 s");
  const c = cenario("pico");
  assert.equal([...instantes(c)].filter(t => c.leitura(t, {}).VAZAO === 3).length, 25, "5 picos de 5 leituras");
  assert.equal(r.temperatura, undefined);
  assert.equal(r.lote, undefined);
});

test("bancada virtual · cenários isolados disparam só o próprio fenômeno; ocioso não dispara nada", () => {
  const tipos = (n: (typeof CENARIOS)[number]) => ensaiar(cenario(n)).map(d => `${d.tipo}@${d.t}${d.kg !== undefined ? `:${d.kg}` : ""}`);
  assert.deepEqual(tipos("ocioso"), []);
  assert.deepEqual(tipos("vazao"), ["UNUSUAL_FLOW@30"]);
  assert.deepEqual(tipos("calor"), ["TEMPERATURE_EXCURSION@40"]);
  assert.deepEqual(tipos("carga"), ["LOTE@8:6"]);
  assert.deepEqual(ensaiar(cenario("palco"), { ...REGRAS_PADRAO, minFlowLpm: 3 }).map(d => d.tipo), ["TEMPERATURE_EXCURSION", "LOTE"], "regra mais alta que o cenário: o ensaio mostra que o fluxo não dispara");
});

test("bancada virtual · reação ao operador: Assumir fecha a vazão, Resolver põe a caixa, esfriar começa abaixo do limite", () => {
  const c = cenario("palco");
  const m: Marcos = { fluxoAberta: 30, fluxoAssumida: 38 };
  assert.ok(c.leitura(36, m).VAZAO >= 2.3);
  assert.equal(c.leitura(38, m).VAZAO, 0, "fecha na leitura em que a mudança foi vista");
  assert.equal(c.leitura(37.4, {}).PESO < 1, true);
  const resolvida: Marcos = { ...m, fluxoEncerrada: 52 };
  const pesos = [50, 52, 54, 56].map(t => c.leitura(t, resolvida).PESO);
  assert.ok(Math.abs(pesos[0]) <= 0.03, "antes de resolver: balança vazia (ruído da tara)");
  assert.deepEqual(pesos.slice(1, 3), [3.1, 6.06], "pondo a caixa, acomodando");
  assert.ok(pesos[3] >= 6.1 && pesos[3] <= 6.14);
  // A 1ª leitura do resfriamento já está abaixo de 28 °C: tratar a ocorrência de temperatura não reabre outra.
  assert.ok(c.leitura(50, { temperaturaAberta: 48, temperaturaTratada: 50 }).TEMP < 28);
  assert.ok(c.leitura(62, { temperaturaAberta: 48 }).TEMP > 28 && c.leitura(64, { temperaturaAberta: 48 }).TEMP < 28, "sem tratar: esfria 15 s depois de abrir");
  assert.ok(c.leitura(76, {}).TEMP < 28, "limite: esfria sozinho em T+75");
  assert.equal(c.leitura(56, {}).VAZAO, 0, "limite: a vazão fecha sozinha em T+55");
  assert.equal(c.leitura(100, resolvida).PESO < 1, true, "T+100: caixa retirada, sensores parados");
});

test("bancada virtual · determinística e sempre dentro do contrato MQTT", () => {
  for (const nome of CENARIOS) {
    const c = cenario(nome);
    let i = 0;
    for (const t of instantes(c, 300)) {
      const v = c.leitura(t, {});
      assert.deepEqual(c.leitura(t, {}), v, `${nome} ${t}: mesma entrada, mesma leitura`);
      const p = mqttPayloadSchema.safeParse({ dispositivo_id: "RICHARDS-FLOW-001", bootId: "bancada-1", sequence: i++, ...v });
      assert.equal(p.success, true, `${nome} ${t}: ${JSON.stringify(v)}`);
      assert.ok(!Object.is(v.PESO, -0) && !Object.is(v.VAZAO, -0));
    }
  }
  assert.throws(() => cenario("teatro" as never), /desconhecido/);
});

test("bancada virtual · Resolver direto de OPEN no meio da gravação: a reabertura não troca a do roteiro nem vira temperatura", () => {
  const m: Marcos = {};
  const a = new Acompanhamento(m);
  assert.match(a.abriu("fluxo", "F1", 30, 32).join(), /T\+30 OCORRÊNCIA de fluxo aberta \(F1\) \[SIMULATED\]/);
  // A vigia captura o que vai consultar (F1 = fluxo) e fica esperando o banco...
  const consultados = a.aConsultar();
  // ...enquanto o operador resolve F1 direto de OPEN e a leitura de T+32, ainda a 2,4 L/min, abre outra (F2).
  const reabriu = a.abriu("fluxo", "F2", 32, 34).join();
  assert.match(reabriu, /REABERTA \(F2\).*a F1 foi encerrada.*fecha a vazão/);
  assert.deepEqual([m.fluxoAssumida, m.fluxoEncerrada], [34, 34], "fluxo encerrado a partir da próxima leitura: fecha a vazão e põe a caixa");
  // A consulta volta com F1 RESOLVED: é a de fluxo (antes caía em "temperatura" e esfriava antes da hora).
  assert.deepEqual(a.leu([{ id: "F1", status: "RESOLVED" }], consultados, 36), ["ocorrência de fluxo RESOLVIDA no BI"]);
  assert.equal(m.temperaturaTratada, undefined);
  assert.equal(a.roteiro.fluxo, "F1", "a do roteiro não é perdida");
  assert.deepEqual(a.reabertas, [{ qual: "fluxo", id: "F2", t: 32, anterior: "F1" }]);
  assert.deepEqual([...a.aConsultar().keys()], ["F2"], "encerrada não é lida de novo; a reaberta segue acompanhada");
  // A temperatura do roteiro abre normalmente depois.
  a.abriu("temperatura", "T1", 48, 50);
  assert.deepEqual([m.temperaturaAberta, a.roteiro.temperatura], [48, "T1"]);
  assert.deepEqual(a.leu([{ id: "F2", status: "DISMISSED" }], a.aConsultar(), 52), ["ocorrência de fluxo reaberta (F2) DESCARTADA no BI"]);
  assert.equal(m.temperaturaTratada, undefined, "descartar a reaberta não mexe na temperatura");
  // O cenário palco reage: vazão fechada e caixa entrando (3,1 kg) na leitura seguinte à reabertura.
  const c = cenario("palco");
  assert.equal(c.leitura(34, m).VAZAO, 0);
  assert.equal(c.leitura(34, m).PESO, 3.1);
});

test("bancada virtual · Assumir e depois Resolver seguem o roteiro; temperatura reaberta esfria", () => {
  const m: Marcos = {};
  const a = new Acompanhamento(m);
  a.abriu("fluxo", "F1", 30, 32);
  assert.deepEqual(a.leu([{ id: "F1", status: "OPEN" }], a.aConsultar(), 34), [], "OPEN não é mudança");
  assert.deepEqual(a.leu([{ id: "F1", status: "ACKNOWLEDGED" }], a.aConsultar(), 38), ["ocorrência de fluxo ASSUMIDA no BI"]);
  assert.deepEqual([m.fluxoAssumida, m.fluxoEncerrada], [38, undefined]);
  a.leu([{ id: "F1", status: "RESOLVED" }], a.aConsultar(), 52);
  assert.deepEqual([m.fluxoAssumida, m.fluxoEncerrada], [38, 52]);
  a.abriu("temperatura", "T1", 48, 50);
  a.abriu("temperatura", "T2", 56, 58);
  assert.equal(m.temperaturaTratada, 58, "Resolver a de temperatura ainda quente reabriu outra: trata como tratada e esfria");
  assert.deepEqual(a.abriu("fluxo", "F1", 60, 62), [], "id já conhecido não reabre nada");
});

test("gêmeo digital do BI · baliza carimba a origem das ocorrências ativas, não a da leitura", () => {
  assert.equal(activeOrigin([], 0), null, "sem ativa, sem baliza nem selo");
  assert.deepEqual(activeOrigin([{ source: "SIMULATED" }], 1), { label: "Simulado", seal: "SIMULATED", partial: false, listed: 1 }, "richards-oc-03 do seed ao lado da leitura do ESP32");
  assert.deepEqual(activeOrigin([{ source: "DEVICE" }, { source: "DEVICE" }], 2), { label: "Sensor", seal: "DEVICE", partial: false, listed: 2 });
  assert.deepEqual(activeOrigin([{ source: "DEVICE" }, { source: "SIMULATED" }], 2), { label: "Misto", seal: "SIMULATED", partial: false, listed: 2 }, "misto com simulada é roxo");
  assert.deepEqual(activeOrigin([{ source: "DEVICE" }, { source: "MANUAL" }], 2), { label: "Misto", seal: "MANUAL", partial: false, listed: 2 });
  assert.deepEqual(activeOrigin([{ source: "MANUAL" }], 1), { label: "Manual", seal: "MANUAL", partial: false, listed: 1 });
  const d5 = Array.from({ length: 5 }, () => ({ source: "DEVICE" as const }));
  assert.deepEqual(activeOrigin(d5, 7), { label: "Sensor", seal: "DEVICE", partial: true, listed: 5 }, "7 ativas, 5 listadas: diz de quantas a origem foi lida");
  assert.deepEqual(activeOrigin([], 3), { label: "Origem não listada", seal: "MANUAL", partial: true, listed: 0 }, "nunca supõe origem");
});

/** Relógio falso para a espera da vazão de outra fonte: `esperar` só anda o relógio; `chegam`: ms em que entra leitura nova. */
function fonteAlheia(inicial: number, chegam: readonly number[] = []) {
  let ms = 0;
  const esperas: number[] = [];
  return {
    esperas,
    contar: async () => inicial + chegam.filter(c => c <= ms).length,
    esperar: async (passo: number) => { esperas.push(passo); ms += passo; },
  };
}

test("bancada virtual · ponte recém-parada (3 leituras paradas há 1-5 s): espera até 6 s e NÃO recusa", async () => {
  const f = fonteAlheia(3);
  assert.equal(await vazaoAlheiaChegando(f.contar, { esperar: f.esperar }), false, "sem leitura nova em 6 s: a outra fonte parou");
  assert.equal(f.esperas.reduce((a, b) => a + b, 0), ESPERA_VAZAO_ALHEIA_S * 1000, "esperou os 6 s, em passos de 1 s");
  assert.deepEqual(f.esperas, [1000, 1000, 1000, 1000, 1000, 1000]);
});

test("bancada virtual · leitura chegando durante a espera: recusa assim que ela chega, sem esperar o resto", async () => {
  const f = fonteAlheia(3, [2_500]); // a ponte (2 s por leitura) ainda está gravando
  assert.equal(await vazaoAlheiaChegando(f.contar, { esperar: f.esperar }), true);
  assert.deepEqual(f.esperas, [1000, 1000, 1000], "sai no 1º passo que vê a contagem crescer");
  const g = fonteAlheia(3, [5_900]);
  assert.equal(await vazaoAlheiaChegando(g.contar, { esperar: g.esperar }), true, "até o fim da espera ainda conta");
  const h = fonteAlheia(3, [6_500]);
  assert.equal(await vazaoAlheiaChegando(h.contar, { esperar: h.esperar }), false, "depois da espera, já não é desta conferência");
  let parar = false;
  const i = fonteAlheia(3, [4_000]);
  const esperarEParar = async (ms: number) => { await i.esperar(ms); parar = i.esperas.length === 2; };
  assert.equal(await vazaoAlheiaChegando(i.contar, { esperar: esperarEParar, interrompido: () => parar }), false, "Ctrl+C durante a espera: sai já");
  assert.equal(i.esperas.length, 2);
});

test("bancada virtual · aviso da vazão de outra fonte: a fotografia diz a idade e como conferir; a espera que viu leitura nova não", () => {
  assert.equal(avisoVazaoAlheia({ leituras: 0, sessoes: [], idadeS: null }), null);
  const v = { leituras: 3, sessoes: ["mqtt-deadbeef"], idadeS: 1.4 };
  const foto = avisoVazaoAlheia(v)!;
  assert.match(foto, /^3 leitura\(s\) de vazão de outra fonte neste dispositivo nos últimos 10 s, a mais nova há 1 s \(sessão mqtt-deadbeef\)/);
  assert.match(foto, /Pare a ponte pnpm mqtt ou desligue a vazão no firmware; se você acabou de parar a ponte, espere 10 s e rode de novo$/);
  assert.match(avisoVazaoAlheia({ ...v, idadeS: -0.6 })!, /a mais nova há 0 s/, "relógio de quem gravou adiantado: nunca idade negativa");
  const chegando = avisoVazaoAlheia(v, true)!;
  assert.match(chegando, /^chegou leitura nova de vazão de outra fonte neste dispositivo durante a espera de 6 s \(sessão mqtt-deadbeef\): ela está gravando agora/);
  assert.ok(chegando.endsWith("Pare a ponte pnpm mqtt ou desligue a vazão no firmware"), "a fonte grava agora: nada de 'espere e rode de novo'");
});
