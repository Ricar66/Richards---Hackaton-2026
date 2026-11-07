import { FlowAlertPolicy, type FlowSample } from "@/modules/monitoring/domain/flow-alert-policy";
import { ScaleSurplusDetector } from "@/modules/monitoring/domain/scale-surplus-detector";
import type { SignalSample } from "@/modules/monitoring/domain/sustained-run";
import { TemperatureAlertPolicy } from "@/modules/monitoring/domain/temperature-alert-policy";
import type { MqttSensor } from "./mqtt-payload";

/**
 * Bancada virtual de palco: cenários DETERMINÍSTICOS (seno, nada aleatório) que movem vazão, temperatura/umidade e peso
 * como a bancada do Victor. Domínio puro: sem banco, rede ou relógio. O comando (`run-bancada-virtual.ts`) entrega cada
 * leitura à MESMA ingestão da ponte MQTT, com tudo gravado como SIMULATED. As regras nunca são encurtadas para caber na fala:
 * os horários abaixo saem da regra real (1,5 L/min por 30 s; acima de 28 °C por 30 s; 5 kg estáveis por 6 s).
 */
export const BANCADA_INTERVALO_S = 2;
export const CENARIOS = ["ocioso", "vazao", "pico", "calor", "carga", "palco"] as const;
export type CenarioNome = (typeof CENARIOS)[number];
export type Leitura = { VAZAO: number; TEMP: number; UMIDADE: number; PESO: number };

/**
 * Fatos que o comando observou, em segundos relativos a T0 (quando o fenômeno começa). Aberturas e lote vêm do resultado
 * da ingestão; "assumida", "encerrada" e "tratada" vêm do status no banco (só leitura). Valem a partir da leitura em que t ≥ marco.
 */
export type Marcos = {
  fluxoAberta?: number; fluxoAssumida?: number; fluxoEncerrada?: number;
  temperaturaAberta?: number; temperaturaTratada?: number; lote?: number;
};

export type Cenario = {
  nome: CenarioNome; resumo: string;
  /** t (s) da primeira leitura; negativo = sensores parados antes de T0. */
  inicio: number;
  /** t (s) da última leitura; Infinity = até Ctrl+C. */
  fim: number;
  /** Acompanha no banco o status das ocorrências que abriu (fecha a vazão, esfria, põe a caixa), com limites para seguir sozinho. */
  reativo: boolean;
  leitura(t: number, m: Marcos): Leitura;
  /** Rótulo curto do que a bancada está fazendo; o comando registra cada mudança. */
  fase(t: number, m: Marcos): string;
  /** Reações e limites, impressos na abertura. */
  limites: string[];
};

const onda = (t: number, amp: number, periodo: number) => amp * Math.sin((2 * Math.PI * t) / periodo);
const casas = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d || 0; // `|| 0`: nunca "-0"
/** O que acontecer primeiro (marco ausente = nunca). */
const primeiro = (...ts: (number | undefined)[]) => Math.min(...ts.map(t => t ?? Infinity));
const depois = (t: number | undefined, s: number) => (t === undefined ? undefined : t + s);

/** Torneira fechada = 0; aberta = 2,4 ± 0,08 L/min (acima do limiar de 1,5 L/min do dispositivo, sem encostar nele). */
const vazao = (t: number, aberta: boolean) => (aberta ? casas(2.4 + onda(t, 0.08, 7), 2) : 0);

/**
 * DHT11: parado em 24,6 ± 0,2 °C e ~60% → rampa de 14 s até 29,6 °C (a 1ª leitura acima de 28 °C sai 10 s depois do início)
 * → patamar 29,6 ± 0,3 °C, ~45% → esfria. A 1ª leitura do resfriamento já fica abaixo de 28 °C: tratar a ocorrência
 * enquanto ainda está quente não reabre outra na leitura seguinte.
 */
function clima(t: number, rampa: number, resfria: number): Pick<Leitura, "TEMP" | "UMIDADE"> {
  if (t >= resfria) {
    const p = Math.min(1, (t - resfria) / 12);
    return { TEMP: casas(27.8 - 2.8 * p + (p === 1 ? onda(t, 0.2, 40) : 0), 1), UMIDADE: casas(45 + 13 * p, 0) };
  }
  if (t < rampa) return { TEMP: casas(24.6 + onda(t, 0.2, 40), 1), UMIDADE: casas(60 + onda(t, 1, 50), 0) };
  const p = Math.min(1, (t - rampa) / 14);
  return { TEMP: casas(24.6 + 5 * p + (p === 1 ? onda(t, 0.3, 11) : 0), 1), UMIDADE: casas(60 - 15 * p, 0) };
}

/**
 * HX711: 0 a 0,03 kg (ruído depois da tara, nunca negativo: "-0,01 kg" no telão pareceria defeito) → pondo a caixa (3,1 kg) → acomodando (6,06 kg) → 6,12 ± 0,02 kg.
 * A menor leitura estável é 6,06: o detector arredonda para baixo e o lote nasce com 6,0 kg (nunca superestima).
 */
function balanca(t: number, carga: number, retira = Infinity) {
  if (t < carga || t >= retira) return casas(Math.abs(onda(t, 0.03, 9)), 2);
  const k = Math.floor((t - carga) / BANCADA_INTERVALO_S);
  return k === 0 ? 3.1 : k === 1 ? 6.06 : casas(6.12 + onda(t, 0.02, 5), 2);
}

const parado = (t: number): Leitura => ({ VAZAO: 0, ...clima(t, Infinity, Infinity), PESO: balanca(t, Infinity) });
const resfriaEm = (m: Marcos, limite: number) => primeiro(depois(m.temperaturaAberta, 15), m.temperaturaTratada, limite);
const termico = (t: number, rampa: number, resfria: number) =>
  t < rampa ? "temperatura estável" : t >= resfria ? (t < resfria + 12 ? "esfriando" : "temperatura estável")
    : t < rampa + 14 ? "aquecendo" : "temperatura alta";

const LISTA: Cenario[] = [
  {
    nome: "ocioso", resumo: "sensores parados (painéis online, nenhuma ocorrência) até Ctrl+C",
    inicio: 0, fim: Infinity, reativo: false, leitura: parado, fase: () => "sensores parados", limites: [],
  },
  {
    nome: "vazao", resumo: "só a vazão: 2,4 L/min contínuos abrem UNUSUAL_FLOW pela regra do dispositivo",
    inicio: -10, fim: 70, reativo: true,
    leitura: (t, m) => ({ ...parado(t), VAZAO: vazao(t, t >= 0 && t < primeiro(m.fluxoAssumida, 45)) }),
    fase: (t, m) => (t < 0 ? "sensores parados" : t < primeiro(m.fluxoAssumida, 45) ? "torneira aberta" : "torneira fechada"),
    limites: ["a vazão fecha quando a ocorrência de fluxo é ASSUMIDA (ou sozinha em T+45)"],
  },
  {
    nome: "pico", resumo: "uso curto: 3 L/min por 10 s, 5 vezes, com 10 s fechada entre eles; NÃO abre ocorrência",
    inicio: -10, fim: 110, reativo: false,
    leitura: t => ({ ...parado(t), VAZAO: t >= 0 && t < 100 && t % 20 < 10 ? 3 : 0 }),
    fase: t => (t >= 0 && t < 100 && t % 20 < 10 ? "pico de 3 L/min" : "torneira fechada"),
    limites: ["cada pico dura 10 s: a regra pede fluxo contínuo por 30 s, então nada abre"],
  },
  {
    nome: "calor", resumo: "só a temperatura: sobe acima de 28 °C e abre TEMPERATURE_EXCURSION depois de 30 s",
    inicio: -10, fim: 90, reativo: true,
    leitura: (t, m) => ({ ...parado(t), ...clima(t, 0, resfriaEm(m, 70)) }),
    fase: (t, m) => termico(t, 0, resfriaEm(m, 70)),
    limites: ["esfria 15 s depois da ocorrência de temperatura, ou quando ela é tratada (no máximo em T+70)"],
  },
  {
    nome: "carga", resumo: "só a balança: caixa de ~6,1 kg vira lote de 6,0 kg aguardando verificação humana",
    inicio: -10, fim: 40, reativo: false,
    leitura: t => ({ ...parado(t), PESO: balanca(t, 0, 30) }),
    fase: t => (t < 0 || t >= 30 ? "balança vazia" : t < BANCADA_INTERVALO_S ? "pondo a caixa" : "caixa na balança"),
    limites: ["a caixa sai da balança em T+30"],
  },
  {
    nome: "palco", resumo: "linha do tempo do pitch: vazão → temperatura → balança, acompanhando o operador",
    inicio: -20, fim: 160, reativo: true,
    leitura(t, m) {
      return {
        VAZAO: vazao(t, t >= 0 && t < primeiro(m.fluxoAssumida, 55)),
        ...clima(t, 8, resfriaEm(m, 75)),
        PESO: balanca(t, primeiro(m.fluxoEncerrada, 70), 100),
      };
    },
    fase(t, m) {
      if (t < 0) return "sensores parados";
      if (t >= 100) return "encerramento: sensores parados";
      const carga = primeiro(m.fluxoEncerrada, 70);
      const aberta = t < primeiro(m.fluxoAssumida, 55);
      return [
        aberta ? (m.fluxoAberta === undefined ? "torneira aberta" : "torneira aberta, aguardando Assumir") : "torneira fechada",
        termico(t, 8, resfriaEm(m, 75)),
        t < carga ? (aberta ? "" : "aguardando Resolver") : t < carga + BANCADA_INTERVALO_S ? "pondo a caixa" : "caixa na balança",
      ].filter(Boolean).join(" · ");
    },
    limites: [
      "a vazão fecha quando a ocorrência de fluxo é ASSUMIDA (ou sozinha em T+55)",
      "a temperatura esfria 15 s depois da ocorrência de temperatura, ou quando ela é tratada (no máximo em T+75)",
      "a caixa entra na balança quando a ocorrência de fluxo é RESOLVIDA (ou sozinha em T+70)",
      "T+100: sensores parados por 60 s e fim",
    ],
  },
];

export function cenario(nome: CenarioNome): Cenario {
  const c = LISTA.find(x => x.nome === nome);
  if (!c) throw new Error(`cenário "${nome}" desconhecido: use ${CENARIOS.join(", ")}`);
  return c;
}

/** Instantes das leituras do cenário (a cada 2 s, de `inicio` a `fim`). */
export function* instantes(c: Cenario, ate = Infinity) {
  for (let t = c.inicio; t <= Math.min(c.fim, ate); t += BANCADA_INTERVALO_S) yield t;
}

/** Regras que decidem os horários: do Device (vazão) e da configuração da ponte (temperatura e balança). */
export type Regras = { minFlowLpm: number; continuousSeconds: number; tempLimitC: number; tempSeconds: number; scaleMinKg: number; scaleStableSeconds: number };
// Mesmos padrões do loadMqttConfig (a balança caiu para 1,5 kg em 07/11, HX711 de 5 kg): o ensaio impresso e a bancada
// usam a mesma regra quando ninguém configura nada.
export const REGRAS_PADRAO: Regras = { minFlowLpm: 1.5, continuousSeconds: 30, tempLimitC: 28, tempSeconds: 30, scaleMinKg: 1.5, scaleStableSeconds: 6 };
export type Disparo = { t: number; tipo: "UNUSUAL_FLOW" | "TEMPERATURE_EXCURSION" | "LOTE"; sensor: MqttSensor; kg?: number };

/**
 * Ensaia o cenário nas MESMAS políticas de domínio da ingestão, sem banco e sem reação do operador (segue os limites).
 * Serve para imprimir os marcos esperados pelas regras configuradas, nunca para afirmar o que aconteceu.
 * Como no banco: uma ocorrência ativa por tipo (regra 5) e um lote pendente por balança.
 */
export function ensaiar(c: Cenario, r: Regras = REGRAS_PADRAO, ate = 600): Disparo[] {
  const flow = new FlowAlertPolicy(r.minFlowLpm, r.continuousSeconds);
  const temp = new TemperatureAlertPolicy(r.tempLimitC, r.tempSeconds);
  const scale = new ScaleSurplusDetector(r.scaleMinKg, r.scaleStableSeconds);
  const m: Marcos = {};
  const fluxo: FlowSample[] = [];
  const temps: SignalSample[] = [];
  const out: Disparo[] = [];
  const t0 = Date.UTC(2026, 10, 6, 12); // relógio fixo: o ensaio repete igual
  for (const t of instantes(c, ate)) {
    const v = c.leitura(t, m);
    const at = new Date(t0 + t * 1000);
    fluxo.push({ capturedAt: at, flowLpm: v.VAZAO, deltaLiters: (v.VAZAO * BANCADA_INTERVALO_S) / 60 });
    temps.push({ at, value: v.TEMP });
    if (m.fluxoAberta === undefined && flow.evaluate(fluxo.slice(-120)).suspicious) { m.fluxoAberta = t; out.push({ t, tipo: "UNUSUAL_FLOW", sensor: "VAZAO" }); }
    if (m.temperaturaAberta === undefined && temp.evaluate(temps.slice(-600)).suspicious) { m.temperaturaAberta = t; out.push({ t, tipo: "TEMPERATURE_EXCURSION", sensor: "TEMP" }); }
    const d = scale.push({ at, value: v.PESO });
    if (d.trigger && m.lote === undefined) { m.lote = t; out.push({ t, tipo: "LOTE", sensor: "PESO", kg: d.weightKg }); }
  }
  return out;
}

/** "T+30", "T−20": rótulo do instante para o log e para a fala. */
export const rotulo = (t: number) => `T${t < 0 ? "−" : "+"}${Math.abs(Math.round(t))}`;

export type Qual = "fluxo" | "temperatura";
export type StatusOcorrencia = "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";
export const NOME_STATUS: Record<StatusOcorrencia, string> = { OPEN: "aberta", ACKNOWLEDGED: "ASSUMIDA", RESOLVED: "RESOLVIDA", DISMISSED: "DESCARTADA" };
/** RESOLVED e DISMISSED não mudam mais (OccurrenceService): não precisam ser lidos de novo. */
const encerrada = (s: StatusOcorrencia | undefined) => s === "RESOLVED" || s === "DISMISSED";

/**
 * Acompanha as ocorrências que a sessão abriu e decide os marcos "assumida", "encerrada" e "tratada". Domínio puro:
 * quem chama lê o status no banco (SÓ LEITURA) e entrega aqui.
 * - O tipo (fluxo ou temperatura) é fixado POR ID na abertura, e a consulta usa os ids capturados ANTES do `await`:
 *   um status que volta depois de uma reabertura nunca cai no outro tipo.
 * - Reabertura: Resolver/Descartar direto de OPEN pode ser gravado entre a leitura do status e a gravação da leitura
 *   seguinte, e a regra (ainda acima do limiar) abre outra do mesmo tipo. A do roteiro continua sendo a primeira; a nova
 *   fica registrada e o fenômeno é tratado como encerrado (fecha a vazão / esfria), seguindo o roteiro.
 */
export class Acompanhamento {
  /** A ocorrência do roteiro: a primeira de cada tipo nesta sessão. Nunca é trocada. */
  readonly roteiro: Partial<Record<Qual, string>> = {};
  /** Abertas pela regra depois que a do roteiro foi encerrada enquanto a leitura era gravada. */
  readonly reabertas: { qual: Qual; id: string; t: number; anterior: string }[] = [];
  private readonly tipo = new Map<string, Qual>();
  private readonly status = new Map<string, StatusOcorrencia>();

  constructor(private readonly marcos: Marcos) {}

  conhece(id: string) { return this.tipo.has(id); }

  /** Ids a consultar agora (os que ainda podem mudar), com o tipo de cada um. Capture antes de consultar o banco. */
  aConsultar(): Map<string, Qual> {
    return new Map([...this.tipo].filter(([id]) => !encerrada(this.status.get(id))));
  }

  /** A ingestão abriu `id` na leitura `t`. `proxima`: instante da próxima leitura, a partir da qual os marcos valem. */
  abriu(qual: Qual, id: string, t: number, proxima: number): string[] {
    if (this.tipo.has(id)) return [];
    this.tipo.set(id, qual);
    this.status.set(id, "OPEN");
    const anterior = this.roteiro[qual];
    if (anterior === undefined) {
      this.roteiro[qual] = id;
      if (qual === "fluxo") { this.marcos.fluxoAberta ??= t; return [`${rotulo(t)} OCORRÊNCIA de fluxo aberta (${id}) [SIMULATED]: no BI, Assumir investigação`]; }
      this.marcos.temperaturaAberta ??= t;
      return [`${rotulo(t)} OCORRÊNCIA de temperatura aberta (${id}) [SIMULATED]`];
    }
    // Regra 5: outra do mesmo tipo só abre se a do roteiro deixou de estar ativa (encerrada no BI no meio da gravação).
    this.reabertas.push({ qual, id, t, anterior });
    this.encerrar(qual, proxima);
    const efeito = qual === "fluxo" ? "fluxo encerrado: fecha a vazão e segue o roteiro" : "temperatura tratada: esfria";
    return [`${rotulo(t)} OCORRÊNCIA de ${qual} REABERTA (${id}) [SIMULATED]: a ${anterior} foi encerrada no BI enquanto esta leitura era gravada e a regra abriu outra. A bancada trata como ${efeito}. No BI, descarte a ${id}`];
  }

  /** Status lido no banco para `consultados` (capturados antes da consulta). `t`: próxima leitura a ser enviada. */
  leu(rows: readonly { id: string; status: StatusOcorrencia }[], consultados: ReadonlyMap<string, Qual>, t: number): string[] {
    const linhas: string[] = [];
    for (const r of rows) {
      const qual = consultados.get(r.id);
      if (!qual || this.status.get(r.id) === r.status) continue;
      this.status.set(r.id, r.status);
      if (r.status === "OPEN") continue;
      if (r.id !== this.roteiro[qual]) { linhas.push(`ocorrência de ${qual} reaberta (${r.id}) ${NOME_STATUS[r.status]} no BI`); continue; }
      linhas.push(`ocorrência de ${qual} ${NOME_STATUS[r.status]} no BI`);
      if (qual === "temperatura") this.marcos.temperaturaTratada ??= t;
      else if (r.status === "ACKNOWLEDGED") this.marcos.fluxoAssumida ??= t;
      else this.encerrar("fluxo", t);
    }
    return linhas;
  }

  private encerrar(qual: Qual, t: number) {
    if (qual === "temperatura") { this.marcos.temperaturaTratada ??= t; return; }
    this.marcos.fluxoAssumida ??= t;
    this.marcos.fluxoEncerrada ??= t;
  }
}

/** Janela em que uma leitura de vazão de outra sessão indica a ponte (ou o ESP32, ou o simulador) gravando agora. */
export const JANELA_VAZAO_ALHEIA_S = 10;
/** Com leitura alheia na janela, quanto o `pnpm bancada` espera por uma leitura NOVA antes de recusar (ponte recém-parada?). */
export const ESPERA_VAZAO_ALHEIA_S = 6;
/** Leituras de vazão de outra fonte na janela. `idadeS`: segundos desde a mais nova (null = nenhuma). */
export type VazaoAlheia = { leituras: number; sessoes: string[]; idadeS: number | null };

const segundos = (n: number) => Math.max(0, Math.round(n)).toLocaleString("pt-BR");
/**
 * Texto do conflito (null = nenhum). A ponte não descarta um sensor só: ou ela para, ou o firmware deixa de mandar a vazão.
 * `chegando`: a espera do `pnpm bancada` VIU leitura nova (a outra fonte grava agora). Sem ele (fotografia do `palco:checar`),
 * as leituras podem ser de uma ponte que acabou de parar: o texto diz a idade da mais nova e como conferir de novo.
 */
export function avisoVazaoAlheia(v: VazaoAlheia, chegando = false): string | null {
  if (!v.leituras) return null;
  const sessao = `sessão ${v.sessoes.join(", ")}`;
  if (chegando) {
    return `chegou leitura nova de vazão de outra fonte neste dispositivo durante a espera de ${ESPERA_VAZAO_ALHEIA_S} s (${sessao}): ela está gravando agora, `
      + "a bancada virtual simulando VAZAO se misturaria a ela e a regra de fluxo não abriria. Pare a ponte pnpm mqtt ou desligue a vazão no firmware";
  }
  return `${v.leituras} leitura(s) de vazão de outra fonte neste dispositivo nos últimos ${JANELA_VAZAO_ALHEIA_S} s, a mais nova há ${segundos(v.idadeS ?? 0)} s (${sessao}): `
    + "a bancada virtual simulando VAZAO se misturaria a elas e a regra de fluxo não abriria. Pare a ponte pnpm mqtt ou desligue a vazão no firmware; "
    + `se você acabou de parar a ponte, espere ${JANELA_VAZAO_ALHEIA_S} s e rode de novo`;
}

export type OpcoesEspera = { esperaMs?: number; passoMs?: number; esperar?: (ms: number) => Promise<void>; interrompido?: () => boolean };
/**
 * A outra fonte AINDA está gravando? `contar` devolve o total de leituras alheias do dispositivo desde um instante FIXO:
 * só cresce (nada é apagado), então crescer durante a espera = chegou leitura nova. Não compara relógios (ESP32 com NTP,
 * container em UTC, notebook): só a contagem. Sai na primeira leitura nova; sem nenhuma em `esperaMs`, a fonte parou.
 * Interrompido (Ctrl+C): false, e quem chama confere a interrupção.
 */
export async function vazaoAlheiaChegando(contar: () => Promise<number>, o: OpcoesEspera = {}): Promise<boolean> {
  const { esperaMs = ESPERA_VAZAO_ALHEIA_S * 1000, passoMs = 1000, interrompido = () => false } = o;
  const esperar = o.esperar ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const antes = await contar();
  for (let ms = 0; ms < esperaMs && !interrompido(); ms += passoMs) {
    await esperar(Math.min(passoMs, esperaMs - ms));
    if (interrompido()) return false;
    if ((await contar()) > antes) return true;
  }
  return false;
}
