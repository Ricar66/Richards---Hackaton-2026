// Bancada virtual de palco: `pnpm bancada` (contingência) e `pnpm palco:checar` (pré-voo, SÓ LEITURA).
// Processo separado do Next, como a ponte MQTT: grava no banco do `.env` (DATABASE_URL) pelos MESMOS casos de uso da ponte,
// com TODAS as leituras SIMULATED e o canal "bancada-virtual" na evidência e na auditoria. Nunca apaga nada.
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { userInfo } from "node:os";
import { createInterface } from "node:readline/promises";
import pg from "pg";
import { DEMO_ORG_ID } from "@/lib/constants";
import { getDb } from "@/lib/db";
import { DonationService } from "@/modules/donations/application/donation-service";
import { OccurrenceService } from "@/modules/monitoring/application/occurrence-service";
import {
  Acompanhamento, avisoVazaoAlheia, BANCADA_INTERVALO_S, CENARIOS, cenario, ensaiar, ESPERA_VAZAO_ALHEIA_S, JANELA_VAZAO_ALHEIA_S, rotulo, vazaoAlheiaChegando,
  type Cenario, type CenarioNome, type Disparo, type Marcos, type OpcoesEspera, type Regras, type VazaoAlheia,
} from "./bancada-virtual";
import { MqttIngestion, type MqttProcessed } from "./mqtt-ingestion";
import { loadMqttConfig, MQTT_SENSORS, type MqttBridgeConfig, type MqttSensor } from "./mqtt-payload";

const PREFIXO = "[BANCADA]";
const log = (s: string) => console.log(`${PREFIXO} ${s}`);
const br = (n: number, d = 1) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const sp = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" });
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** Trava de sessão (forma de duas chaves: não colide com as travas de transação da aplicação). Uma bancada por banco. */
export const TRAVA = [20261106, 1] as const;
const TIPOS_DA_BANCADA = ["UNUSUAL_FLOW", "TEMPERATURE_EXCURSION"] as const;
const DISPARO: Record<Disparo["tipo"], string> = {
  UNUSUAL_FLOW: "ocorrência UNUSUAL_FLOW (fluxo contínuo suspeito)",
  TEMPERATURE_EXCURSION: "ocorrência TEMPERATURE_EXCURSION (temperatura acima do limite)",
  LOTE: "lote PENDING_REVIEW (aguarda verificação humana)",
};
export const NOTA_PREPARO = "Cenário simulado encerrado na preparação do palco";
export const MOTIVO_PREPARO = "lote de ensaio encerrado na preparação do palco";

export type Dispositivo = { id: string; code: string; minFlowLpm: number; continuousSeconds: number; lastSeenAt: Date | null };
export async function acharDispositivo(id: string, cfg: MqttBridgeConfig): Promise<Dispositivo> {
  const code = cfg.aliases[id] ?? id;
  const d = await getDb().device.findFirst({ where: { code, organizationId: DEMO_ORG_ID }, select: { id: true, code: true, minFlowLpm: true, continuousSeconds: true, lastSeenAt: true } });
  if (!d) throw new Error(`dispositivo "${id}" não cadastrado na organização da demonstração (rode pnpm db:seed ou use --dispositivo)`);
  return d;
}
const regrasDe = (d: Dispositivo, cfg: MqttBridgeConfig): Regras => ({
  minFlowLpm: d.minFlowLpm, continuousSeconds: d.continuousSeconds, tempLimitC: cfg.tempLimitC, tempSeconds: cfg.tempSeconds,
  scaleMinKg: cfg.scaleMinKg, scaleStableSeconds: cfg.scaleStableSeconds,
});

export type Pendencias = {
  ocorrencias: { id: string; kind: string; status: string; source: string; title: string }[];
  lotes: { id: string; weightKg: number; source: string }[];
};
/** Ocorrências ativas de fluxo e temperatura do dispositivo (regra 5) e lote da balança aguardando verificação. SÓ LEITURA. */
/**
 * O que bloquearia a BANCADA (que grava SIMULATED): a regra 5 e o lote único por balança valem por origem, então só
 * ocorrência e lote SIMULATED do dispositivo entram aqui. Registros REAIS nunca são bloqueio da bancada e nunca são
 * tocados pela preparação (não se mexe em registro real para facilitar a demonstração).
 */
export async function pendencias(d: Dispositivo): Promise<Pendencias> {
  const db = getDb();
  const ocorrencias = await db.occurrence.findMany({
    where: { organizationId: DEMO_ORG_ID, deviceId: d.id, kind: { in: [...TIPOS_DA_BANCADA] }, source: "SIMULATED", status: { in: ["OPEN", "ACKNOWLEDGED"] } },
    select: { id: true, kind: true, status: true, source: true, title: true }, orderBy: { openedAt: "asc" },
  });
  // Mesmo critério do DonationService.createFromScale: o lote não tem coluna de dispositivo, a autoria fica na auditoria.
  const criados = await db.auditEvent.findMany({ where: { organizationId: DEMO_ORG_ID, entity: "DonationBatch", action: "CREATED", metadata: { path: ["deviceCode"], equals: d.code } }, select: { entityId: true } });
  const lotes = criados.length ? await db.donationBatch.findMany({ where: { id: { in: criados.map(c => c.entityId) }, status: "PENDING_REVIEW", source: "SIMULATED" }, select: { id: true, weightKg: true, source: true } }) : [];
  return { ocorrencias, lotes: lotes.map(l => ({ ...l, weightKg: Number(l.weightKg) })) };
}

/** O que impediria o cenário de mostrar o que promete: regra 5 (ocorrência ativa do mesmo tipo) e um lote pendente por balança. */
export function bloqueios(c: Cenario, sensores: ReadonlySet<MqttSensor>, p: Pendencias): string[] {
  const tipos = new Set<string>(ensaiar(c).filter(x => sensores.has(x.sensor)).map(x => x.tipo));
  return [
    ...p.ocorrencias.filter(o => tipos.has(o.kind)).map(o => `ocorrência ${o.kind} ${o.status} ${o.source} ativa (${o.id}): pela regra 5 a nova não abriria`),
    ...(tipos.has("LOTE") ? p.lotes.map(l => `lote da balança de ${br(l.weightKg)} kg aguardando verificação (${l.id}): a balança não criaria outro`) : []),
  ];
}

export { avisoVazaoAlheia, ESPERA_VAZAO_ALHEIA_S, JANELA_VAZAO_ALHEIA_S, vazaoAlheiaChegando, type VazaoAlheia } from "./bancada-virtual";
/** Fora de uma sessão de bancada virtual (prefixo próprio do bootId). */
const FORA_DA_BANCADA = { NOT: { bootId: { startsWith: "bancada-" } } } as const;
/**
 * Leituras de vazão do dispositivo nos últimos 10 s que NÃO são de uma bancada virtual, de QUALQUER origem: a ponte
 * `pnpm mqtt` grava o potenciômetro como SIMULATED, o ESP32 pelo HTTP como DEVICE. SÓ LEITURA. É uma fotografia:
 * não diz se as leituras ainda chegam (veja `conferirVazaoAlheia`).
 * A ingestão avalia a regra de fluxo sobre o histórico da mesma origem, sem separar sessão: os zeros da ponte intercalados
 * com os 2,4 L/min da bancada cortam o fluxo contínuo a cada leitura e a UNUSUAL_FLOW nunca abre.
 */
export async function vazaoDeOutraFonte(d: Dispositivo, agora = Date.now()): Promise<VazaoAlheia> {
  const rows = await getDb().telemetryReading.findMany({
    where: { deviceId: d.id, capturedAt: { gte: new Date(agora - JANELA_VAZAO_ALHEIA_S * 1000) }, ...FORA_DA_BANCADA },
    select: { bootId: true, capturedAt: true }, orderBy: { capturedAt: "desc" }, take: 200,
  });
  return { leituras: rows.length, sessoes: [...new Set(rows.map(r => r.bootId))].slice(0, 3), idadeS: rows.length ? (agora - rows[0].capturedAt.getTime()) / 1000 : null };
}
/**
 * Total de leituras alheias do dispositivo desde um instante FIXO (10 min atrás: folga para o relógio de quem gravou; o HTTP
 * recusa desvio maior que 5 min). SÓ LEITURA. Nada é apagado, então só cresce quando chega leitura nova.
 */
export function contadorVazaoAlheia(d: Dispositivo, desde = new Date(Date.now() - 600_000)): () => Promise<number> {
  return () => getDb().telemetryReading.count({ where: { deviceId: d.id, capturedAt: { gte: desde }, ...FORA_DA_BANCADA } });
}
/**
 * Antes de a bancada simular VAZAO. Leitura alheia na janela de 10 s nem sempre é a ponte gravando: quem para a ponte
 * (Ctrl+C) e dá Enter no comando já digitado tem leituras de poucos segundos atrás. Então espera até 6 s e devolve o aviso
 * (que recusa o palco) SÓ se chegar leitura nova nesse tempo. SÓ LEITURA. `avisar`: linhas de progresso para o operador.
 */
export async function conferirVazaoAlheia(d: Dispositivo, avisar: (linha: string) => void, o: OpcoesEspera = {}): Promise<string | null> {
  const v = await vazaoDeOutraFonte(d);
  if (!v.leituras) return null;
  const espera = (o.esperaMs ?? ESPERA_VAZAO_ALHEIA_S * 1000) / 1000;
  avisar(`${v.leituras} leitura(s) de vazão de outra fonte nos últimos ${JANELA_VAZAO_ALHEIA_S} s, a mais nova há ${br(Math.max(0, v.idadeS ?? 0), 0)} s (sessão ${v.sessoes.join(", ")}): `
    + `conferindo por até ${br(espera, 0)} s se ainda chega leitura nova (a ponte acabou de parar?)...`);
  if (await vazaoAlheiaChegando(contadorVazaoAlheia(d), o)) return avisoVazaoAlheia(v, true);
  if (!o.interrompido?.()) avisar(`nenhuma leitura nova de outra fonte em ${br(espera, 0)} s: ela parou, a bancada virtual pode simular VAZAO.`);
  return null;
}
/** Mensagem do palco recusado: pendências saem com --preparar; a vazão de outra fonte, só parando a ponte. */
export function recusaDoPalco(motivos: readonly string[], vazao: string | null): string {
  return ["o palco não pode começar:", ...motivos.map(m => `  - ${m}`), ...(vazao ? [`  - ${vazao}`] : []), ...(motivos.length ? ["  Rode: pnpm bancada --preparar"] : [])].join("\n");
}

export type Nivel = "OK" | "AVISO" | "FALHA";
export type ItemChecagem = { nivel: Nivel; texto: string };
/**
 * Pré-voo do palco no banco. SÓ LEITURA: nenhuma escrita, nenhuma trava.
 * `sensores`: o que a bancada virtual vai simular (`--sensores`). Sem ele, a vazão de outra fonte é AVISO, porque o
 * pré-voo também serve para a bancada física; com VAZAO, é FALHA.
 */
export async function checar(id: string, cfg: MqttBridgeConfig, env: Readonly<Record<string, string | undefined>> = process.env, sensores?: ReadonlySet<MqttSensor>): Promise<ItemChecagem[]> {
  const db = getDb();
  const itens: ItemChecagem[] = [];
  const add = (nivel: Nivel, texto: string) => { itens.push({ nivel, texto }); };
  if (env.DEMO_MODE === "true") add("OK", 'DEMO_MODE="true"');
  else add("FALHA", `DEMO_MODE=${JSON.stringify(env.DEMO_MODE ?? "")}: a bancada virtual recusa rodar e o simulador HTTP gravaria como DEVICE`);
  const [banco] = await db.$queryRaw<{ nome: string; agora: Date }[]>`SELECT current_database() AS nome, now() AS agora`;
  add("OK", `banco ${banco.nome}`);
  const desvio = Math.abs(new Date(banco.agora).getTime() - Date.now()) / 1000;
  if (desvio > 2) add("AVISO", `o relógio do banco difere do notebook em ${br(desvio)} s (Docker/WSL depois de suspender?): reinicie o Docker Desktop`);

  let d: Dispositivo;
  try { d = await acharDispositivo(id, cfg); } catch (e) { add("FALHA", msg(e)); return itens; }
  add("OK", `dispositivo ${d.code}: fluxo ≥ ${br(d.minFlowLpm)} L/min por ${d.continuousSeconds} s · temperatura acima de ${br(cfg.tempLimitC)} °C por ${cfg.tempSeconds} s · balança ≥ ${br(cfg.scaleMinKg)} kg estável por ${cfg.scaleStableSeconds} s`);
  const previstos = ensaiar(cenario("palco"), regrasDe(d, cfg));
  const faltam = (["UNUSUAL_FLOW", "TEMPERATURE_EXCURSION", "LOTE"] as const).filter(t => !previstos.some(p => p.tipo === t));
  if (faltam.length) add("FALHA", `com essas regras o cenário palco NÃO dispara: ${faltam.join(", ")} (confira o Device e as variáveis MQTT_*)`);
  else add("OK", `palco pelas regras atuais: ${previstos.map(p => `${p.tipo} em ${rotulo(p.t)}`).join(", ")} (sem reação do operador)`);

  const ativas = await db.occurrence.findMany({ where: { organizationId: DEMO_ORG_ID, status: { in: ["OPEN", "ACKNOWLEDGED"] } }, select: { id: true, kind: true, status: true, source: true, deviceId: true }, orderBy: { openedAt: "asc" } });
  if (!ativas.length) add("OK", "nenhuma ocorrência ativa");
  for (const kind of [...new Set(ativas.map(o => o.kind))]) {
    const lista = ativas.filter(o => o.kind === kind);
    const daBancada = (TIPOS_DA_BANCADA as readonly string[]).includes(kind);
    const bloqueia = daBancada && lista.some(o => o.deviceId === d.id && o.source === "SIMULATED");
    const real = daBancada && lista.some(o => o.deviceId === d.id && o.source === "DEVICE");
    add(bloqueia ? "FALHA" : real ? "AVISO" : "OK", `${kind}: ${lista.length} ativa(s) (${lista.map(o => `${o.id} ${o.status} ${o.source}`).join("; ")})${bloqueia ? ": a SIMULADA bloqueia a bancada pela regra 5, rode pnpm bancada --preparar" : ": não bloqueia a bancada"}${real ? ". Há ocorrência REAL ativa neste sensor: ela impede o sensor real de abrir outra (regra 5 por origem) e NÃO é tocada pela preparação; se for de ensaio, resolva pelo BI com nota" : ""}`);
  }
  const { lotes } = await pendencias(d);
  if (lotes.length) add("FALHA", `lote SIMULADO da balança aguardando verificação (${lotes.map(l => `${l.id} ${br(l.weightKg)} kg ${l.source}`).join("; ")}): a bancada não cria outro, rode pnpm bancada --preparar`);
  else add("OK", "nenhum lote da balança aguardando verificação");
  const reservados = await db.donationBatch.findMany({ where: { organizationId: DEMO_ORG_ID, status: "RESERVED" }, select: { description: true, weightKg: true, source: true }, orderBy: { createdAt: "asc" } });
  if (reservados.length) add("OK", `${reservados.length} lote(s) RESERVED para confirmar a entrega: ${reservados.map(r => `${r.description} (${br(Number(r.weightKg))} kg, ${r.source})`).join("; ")}`);
  else add("FALHA", "nenhum lote RESERVED: prepare um pela tela antes do palco (verificar → reservar), com auditoria");

  const seed = await db.telemetryReading.findFirst({ where: { deviceId: d.id, bootId: "seed-2026" }, orderBy: { capturedAt: "desc" }, select: { capturedAt: true } });
  if (!seed) add("AVISO", "este dispositivo não tem leituras do seed");
  else {
    const dias = (Date.now() - seed.capturedAt.getTime()) / 86_400_000;
    add(dias > 1 ? "AVISO" : "OK", `última leitura do seed em ${sp(seed.capturedAt)}${dias > 1 ? ` (há ${br(dias)} dias): para o histórico, use o filtro 30 dias` : ""}`);
  }
  const ultima = await db.telemetryReading.findFirst({ where: { deviceId: d.id }, orderBy: { capturedAt: "desc" }, select: { capturedAt: true, source: true, bootId: true } });
  if (ultima) add("OK", `última leitura do dispositivo em ${sp(ultima.capturedAt)} (${ultima.source}, sessão ${ultima.bootId})`);
  const reais = await db.telemetryReading.count({ where: { deviceId: d.id, source: "DEVICE", capturedAt: { gte: new Date(Date.now() - 60_000) } } });
  if (reais) add("AVISO", `${reais} leitura(s) do SENSOR REAL no último minuto: com a bancada virtual junto, simule só TEMP ou PESO (--sensores); para simular VAZAO, pare a ponte pnpm mqtt`);
  const alheia = avisoVazaoAlheia(await vazaoDeOutraFonte(d));
  if (!alheia) add("OK", `nenhuma leitura de vazão de outra fonte nos últimos ${JANELA_VAZAO_ALHEIA_S} s: a bancada virtual pode simular VAZAO`);
  else if (!sensores) add("AVISO", `${alheia} (vale se a bancada virtual for simular VAZAO, o padrão; confira com pnpm palco:checar --sensores VAZAO)`);
  else if (sensores.has("VAZAO")) add("FALHA", alheia);
  else add("OK", `vazão de outra fonte gravando agora, mas a bancada virtual com --sensores ${[...sensores].join(",")} não grava vazão`);
  // Trava consultiva é por banco: conta só a deste banco (outro banco do mesmo servidor não impede esta bancada).
  const [trava] = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND granted AND objsubid = 2 AND classid::text = ${String(TRAVA[0])} AND objid::text = ${String(TRAVA[1])} AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`;
  if (trava.n) add("AVISO", "outra bancada virtual (ou um --preparar) está rodando neste banco");
  else add("OK", "nenhuma outra bancada virtual rodando neste banco");
  return itens;
}

/** Processos `node` da ponte MQTT ou da bancada, menos este e o `tsx` que o lançou. null = não deu para listar. */
function processos(): string[] | null {
  const meus = new Set([process.pid, process.ppid]);
  const r = process.platform === "win32"
    ? spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_Process -Filter 'Name=''node.exe''' | ForEach-Object { [string]$_.ProcessId + ' ' + $_.CommandLine }"], { encoding: "utf8", timeout: 15_000, windowsHide: true })
    : spawnSync("ps", ["-eo", "pid=,args="], { encoding: "utf8", timeout: 5_000 });
  if (r.error || r.status !== 0) return null;
  return r.stdout.split(/\r?\n/).map(l => l.trim()).filter(l => /run-mqtt|run-bancada-virtual/.test(l) && !meus.has(Number(l.split(/\s+/)[0])));
}

/** Site e processos, fora do banco. Melhor esforço: SÓ LEITURA. */
export async function checarAmbiente(): Promise<ItemChecagem[]> {
  const itens: ItemChecagem[] = [];
  const base = (process.env.RICHARDS_URL ?? "http://localhost:3000").replace(/\/$/, "");
  try {
    const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(3_000) });
    const j = (await r.json()) as { database?: string; at?: string };
    itens.push({ nivel: r.ok && j.database === "up" ? "OK" : "FALHA", texto: `site ${base}: banco ${j.database ?? "sem resposta"}` });
    const desvio = j.at ? Math.abs(new Date(j.at).getTime() - Date.now()) / 1000 : 0;
    if (desvio > 2) itens.push({ nivel: "AVISO", texto: `o relógio do site difere do notebook em ${br(desvio)} s: reinicie o Docker Desktop` });
  } catch {
    itens.push({ nivel: "AVISO", texto: `o site não respondeu em ${base}/api/health (docker compose up -d)` });
  }
  const lista = processos();
  if (lista === null) itens.push({ nivel: "AVISO", texto: "não foi possível listar os processos: confira run-mqtt e run-bancada-virtual no Gerenciador de Tarefas" });
  else if (!lista.length) itens.push({ nivel: "OK", texto: "nenhuma ponte MQTT nem outra bancada virtual rodando nesta máquina" });
  else for (const l of lista) itens.push({ nivel: "AVISO", texto: `processo rodando: ${l.slice(0, 180)} (se for órfão, encerre: leituras em dobro)` });
  return itens;
}

/** Encerra, com autor, nota e auditoria, o que bloquearia o palco. Pelos serviços da aplicação; nunca apaga nada. */
export async function preparar(d: Dispositivo, autor: string): Promise<string[]> {
  const p = await pendencias(d);
  const linhas: string[] = [];
  for (const o of p.ocorrencias) {
    // pendencias() só devolve SIMULATED: registro real nunca é encerrado pela preparação. Guarda dupla, por segurança.
    if (o.source !== "SIMULATED") continue;
    const nota = NOTA_PREPARO;
    try { await new OccurrenceService().transition(o.id, "DISMISSED", nota, autor); linhas.push(`ocorrência ${o.kind} ${o.id}: ${o.status} → DISMISSED`); }
    catch (e) { linhas.push(`ocorrência ${o.kind} ${o.id}: não mudou (${msg(e)})`); }
  }
  for (const l of p.lotes) {
    try { await new DonationService().transition(l.id, { status: "CANCELLED", reason: MOTIVO_PREPARO }, autor); linhas.push(`lote ${l.id} (${br(l.weightKg)} kg): PENDING_REVIEW → CANCELLED`); }
    catch (e) { linhas.push(`lote ${l.id}: não mudou (${msg(e)})`); }
  }
  return linhas;
}

/** Trava de sessão numa conexão própria (o pool do Prisma troca de conexão). Processo morto = conexão fechada = trava liberada. */
export async function travar(): Promise<pg.Client | null> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5_000 });
  await client.connect();
  const { rows } = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1::int, $2::int) AS ok", [...TRAVA]);
  if (rows[0]?.ok) return client;
  await client.end();
  return null;
}
export async function soltar(client: pg.Client) {
  try { await client.query("SELECT pg_advisory_unlock($1::int, $2::int)", [...TRAVA]); } finally { await client.end().catch(() => undefined); }
}

type Payload = { dispositivo_id: string; bootId: string; sequence: number; VAZAO?: number; TEMP?: number; UMIDADE?: number; PESO?: number };
function descrever(t: number, p: Payload, o: MqttProcessed) {
  const partes = [rotulo(t)];
  if (p.VAZAO !== undefined) partes.push(`${br(p.VAZAO, 2)} L/min`);
  if (p.TEMP !== undefined) partes.push(`${br(p.TEMP)} °C ${br(p.UMIDADE ?? 0, 0)}%`);
  if (p.PESO !== undefined) partes.push(`${br(p.PESO, 2)} kg`);
  // Progresso DECIDIDO pela FlowAlertPolicy nesta leitura, nunca estimado aqui.
  if (o.flow?.rule) partes.push(`regra de fluxo ${Math.round(o.flow.rule.observedSeconds)}/${o.flow.rule.continuousSeconds} s`);
  if (o.flow) partes.push(`seq ${o.flow.sequence} ${o.flow.duplicate ? "repetida (ignorada)" : "gravada"}`);
  partes.push("[SIMULATED]");
  return partes.join(" · ");
}

export type OpcoesSessao = { dispositivo: string; sensores: ReadonlySet<MqttSensor>; cfg?: MqttBridgeConfig; relogio?: () => number };
/** Uma execução de cenário: monta cada leitura, entrega à ingestão da ponte e acompanha (SÓ LEITURA) as ocorrências que abriu. */
export class SessaoBancada {
  /** Sessão própria: leituras idempotentes e sem o prefixo "mqtt-", que é reservado à ponte. */
  readonly bootId = `bancada-${Date.now()}`;
  readonly marcos: Marcos = {};
  /** Ocorrências do roteiro (a primeira de cada tipo) e o lote. Uma reaberta não troca a do roteiro: fica em `reabertas`. */
  readonly abertas: { fluxo?: string; temperatura?: string; lote?: string; kg?: number } = {};
  readonly contagem = { gravadas: 0, descartadas: 0, perdidas: 0 };
  private readonly ingestion: MqttIngestion;
  private readonly acompanhamento = new Acompanhamento(this.marcos);
  private readonly avisados = new Set<string>();
  private fila: Promise<unknown> = Promise.resolve();
  private fase = "";
  private i = 0;
  private readonly relogio: () => number;
  private instante = 0;

  constructor(readonly cenario: Cenario, private readonly opts: OpcoesSessao) {
    this.relogio = opts.relogio ?? Date.now;
    // Os três sensores SIMULATED, seja qual for MQTT_SIMULATED_SENSORS: a bancada virtual não mede nada.
    this.ingestion = new MqttIngestion({ ...(opts.cfg ?? loadMqttConfig()), simulated: new Set(MQTT_SENSORS) }, () => new Date(this.instante), { channel: "bancada-virtual" });
  }
  /** Instante (s, relativo a T0) da próxima leitura. */
  get t() { return this.cenario.inicio + this.i * BANCADA_INTERVALO_S; }
  terminou() { return this.t > this.cenario.fim; }
  /** Abertas pela regra depois que a do roteiro foi encerrada no meio da gravação de uma leitura. */
  get reabertas() { return this.acompanhamento.reabertas; }

  /** Lê o status das ocorrências desta sessão (SÓ LEITURA). Uma mudança vale a partir da próxima leitura a ser enviada. */
  observar(): Promise<string[]> {
    const run = this.fila.then(() => this.ler());
    this.fila = run.catch(() => undefined);
    return run;
  }
  private async ler(): Promise<string[]> {
    if (!this.cenario.reativo) return [];
    // Ids e tipos capturados ANTES do await: uma reabertura gravada durante a consulta não reclassifica a linha.
    const consultados = this.acompanhamento.aConsultar();
    if (!consultados.size) return [];
    const rows = await getDb().occurrence.findMany({ where: { id: { in: [...consultados.keys()] } }, select: { id: true, status: true } });
    return this.acompanhamento.leu(rows, consultados, this.t);
  }

  /**
   * Monta e entrega a leitura do instante `t`. Banco fora: a leitura se perde e nada é reconstruído (como na ponte).
   * `agendadoMs`: horário em que esta leitura simulada "foi medida". Vira o `capturedAt` (como a hora de medição do HTTP),
   * desde que não esteja no futuro nem mais de 1 s atrás do envio; senão vale a hora real. Assim alguns ms de atraso
   * do banco não encolhem a janela da regra (5,998 s ≠ 6 s) e os marcos batem com o ensaio impresso.
   */
  async passo(agendadoMs?: number): Promise<string[]> {
    const linhas = await this.observar().catch(e => [`não consegui ler o status das ocorrências: ${msg(e)}`]);
    const real = this.relogio();
    this.instante = agendadoMs !== undefined && agendadoMs <= real && real - agendadoMs <= 1_000 ? agendadoMs : real;
    const t = this.t;
    const v = this.cenario.leitura(t, this.marcos);
    const fase = this.cenario.fase(t, this.marcos);
    if (fase !== this.fase) { linhas.push(`${rotulo(t)} fase: ${fase}`); this.fase = fase; }
    const s = this.opts.sensores;
    const payload: Payload = {
      dispositivo_id: this.opts.dispositivo, bootId: this.bootId, sequence: this.i,
      ...(s.has("VAZAO") ? { VAZAO: v.VAZAO } : {}), ...(s.has("TEMP") ? { TEMP: v.TEMP, UMIDADE: v.UMIDADE } : {}), ...(s.has("PESO") ? { PESO: v.PESO } : {}),
    };
    this.i++;
    try {
      const o = await this.ingestion.handle(payload);
      if (o.status === "rejected") { this.contagem.descartadas++; linhas.push(`${rotulo(t)} descartada: ${o.reason}`); return linhas; }
      this.contagem.gravadas++;
      linhas.push(descrever(t, payload, o), ...this.anotar(t, o));
    } catch (e) {
      this.contagem.perdidas++;
      linhas.push(`${rotulo(t)} falha ao gravar (banco indisponível?), leitura perdida: ${msg(e)}`);
    }
    return linhas;
  }

  private anotar(t: number, o: MqttProcessed): string[] {
    const linhas: string[] = [];
    const uma = (id: string, texto: string) => { if (!this.avisados.has(id)) { this.avisados.add(id); linhas.push(texto); } };
    // `this.t` já é a próxima leitura (o índice andou antes da gravação): é dela em diante que uma reabertura vale.
    if (o.flow?.alerted && o.flow.occurrenceId) {
      linhas.push(...this.acompanhamento.abriu("fluxo", o.flow.occurrenceId, t, this.t));
      this.abertas.fluxo = this.acompanhamento.roteiro.fluxo;
    } else if (o.flow?.occurrenceId && !this.acompanhamento.conhece(o.flow.occurrenceId))
      uma(o.flow.occurrenceId, `regra 5: já existe ocorrência de fluxo ativa (${o.flow.occurrenceId}), nenhuma nova abre`);
    if (o.temperature?.alerted && o.temperature.occurrenceId) {
      linhas.push(...this.acompanhamento.abriu("temperatura", o.temperature.occurrenceId, t, this.t));
      this.abertas.temperatura = this.acompanhamento.roteiro.temperatura;
    } else if (o.temperature?.occurrenceId && !this.acompanhamento.conhece(o.temperature.occurrenceId))
      uma(o.temperature.occurrenceId, `regra 5: já existe ocorrência de temperatura ativa (${o.temperature.occurrenceId}), nenhuma nova abre`);
    if (o.donation?.created) {
      this.abertas.lote = o.donation.id; this.abertas.kg = o.donation.weightKg; this.marcos.lote ??= t;
      linhas.push(`${rotulo(t)} LOTE de ${br(o.donation.weightKg)} kg criado (${o.donation.id}) [SIMULATED], aguarda verificação humana`);
    } else if (o.donation) uma(o.donation.id, `balança: o lote ${o.donation.id} ainda aguarda verificação, nada novo criado`);
    return linhas;
  }
}

type Args = { cenario: CenarioNome; sensores: Set<MqttSensor>; sensoresInformados: boolean; inicioEm: number; dispositivo: string; checar: boolean; preparar: boolean; confirmar: boolean; ajuda: boolean };
export function lerArgumentos(argv: string[]): Args {
  const a: Args = { cenario: "palco", sensores: new Set(MQTT_SENSORS), sensoresInformados: false, inicioEm: 0, dispositivo: "RICHARDS-FLOW-001", checar: false, preparar: false, confirmar: false, ajuda: false };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split(/=(.*)/s, 2) as [string, string | undefined];
    const valor = () => {
      const v = inline ?? argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${flag} precisa de um valor (veja --ajuda)`);
      return v.trim();
    };
    switch (flag) {
      case "--": break; // separador que o pnpm pode repassar
      case "--cenario": {
        const v = valor();
        if (!(CENARIOS as readonly string[]).includes(v)) throw new Error(`--cenario "${v}" inválido: use ${CENARIOS.join(", ")}`);
        a.cenario = v as CenarioNome; break;
      }
      case "--sensores": {
        const lista = valor().split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
        if (!lista.length || lista.some(s => !(MQTT_SENSORS as readonly string[]).includes(s))) throw new Error(`--sensores: use uma lista entre ${MQTT_SENSORS.join(", ")} (ex.: VAZAO,TEMP)`);
        a.sensores = new Set(lista as MqttSensor[]); a.sensoresInformados = true; break;
      }
      case "--inicio-em": {
        const n = Number(valor());
        if (!Number.isInteger(n) || n < 0 || n > 600) throw new Error("--inicio-em: segundos inteiros entre 0 e 600");
        a.inicioEm = n; break;
      }
      case "--dispositivo": a.dispositivo = valor(); break;
      case "--checar": a.checar = true; break;
      case "--preparar": a.preparar = true; break;
      case "--confirmar": a.confirmar = true; break;
      case "--ajuda": case "--help": case "-h": a.ajuda = true; break;
      default: throw new Error(`opção desconhecida: ${argv[i]} (veja --ajuda)`);
    }
  }
  if (a.checar && a.preparar) throw new Error("use --checar OU --preparar");
  return a;
}

const AJUDA = `Bancada virtual RICHARDS: contingência de palco. Todas as leituras são gravadas como SIMULATED (canal bancada-virtual).

  pnpm palco:checar                           pré-voo, SÓ LEITURA (ocorrências ativas, lote pendente, lote RESERVED, seed, vazão de outra fonte, site, processos)
  pnpm palco:checar --sensores VAZAO          idem, com FALHA se a ponte (ou o ESP32) estiver gravando vazão agora
  pnpm bancada --preparar                     encerra o que bloquearia o palco (DISMISSED / CANCELLED, com auditoria; pede SIM)
  pnpm bancada --cenario palco --inicio-em 5  linha do tempo do pitch, acompanhando o operador no BI

  --cenario     ${CENARIOS.join(" | ")} (padrão palco)
  --sensores    lista entre VAZAO,TEMP,PESO (padrão: os três). Com a ponte pnpm mqtt ligada, simule só TEMP e/ou PESO:
                a ponte não descarta um sensor só, então para simular VAZAO pare a ponte (ou desligue a vazão no firmware).
                Com VAZAO e leitura de vazão de outra fonte nos últimos ${JANELA_VAZAO_ALHEIA_S} s, a bancada espera até ${ESPERA_VAZAO_ALHEIA_S} s
                e só recusa se chegar leitura nova (a ponte que acabou de parar não recusa)
  --inicio-em   contagem regressiva em segundos antes da 1ª leitura (padrão 0)
  --dispositivo dispositivo_id (padrão RICHARDS-FLOW-001; apelidos de MQTT_DEVICE_ALIASES valem)
  --confirmar   com --preparar, dispensa a pergunta (uso sem terminal interativo)
Leitura a cada ${BANCADA_INTERVALO_S} s. Ctrl+C encerra, libera a trava e fecha o banco.`;

let parar = false;
let acordar: (() => void) | undefined;
let trava: pg.Client | undefined;
const esperar = (ms: number) => new Promise<void>(resolve => {
  const timer = setTimeout(resolve, ms);
  acordar = () => { clearTimeout(timer); resolve(); };
});
function usuario() {
  try { return userInfo().username || "desconhecido"; } catch { return process.env.USERNAME ?? process.env.USER ?? "desconhecido"; }
}

async function prepararInterativo(d: Dispositivo, confirmado: boolean) {
  const p = await pendencias(d);
  if (!p.ocorrencias.length && !p.lotes.length) { log(`Nada a preparar em ${d.code}: nenhuma ocorrência ativa de fluxo ou temperatura, nenhum lote da balança pendente.`); return; }
  log("A preparação vai encerrar, SEM apagar nada (com autor, nota e auditoria):");
  for (const o of p.ocorrencias) console.log(`  ocorrência ${o.kind} ${o.status} ${o.source} · ${o.title} (${o.id}) → DISMISSED`);
  for (const l of p.lotes) console.log(`  lote da balança ${br(l.weightKg)} kg ${l.source} (${l.id}) → CANCELLED`);
  if (!confirmado) {
    if (!process.stdin.isTTY) throw new Error("sem terminal interativo para confirmar: rode de novo com --confirmar");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.on("SIGINT", () => { log("Nada foi alterado."); process.exit(130); });
    const resposta = await rl.question(`${PREFIXO} Digite SIM para confirmar: `).finally(() => rl.close());
    if (resposta.trim().toUpperCase() !== "SIM") { log("Nada foi alterado."); return; }
  }
  const autor = `preparacao:${usuario()}`;
  for (const l of await preparar(d, autor)) log(l);
  log(`Feito (autor ${autor}). Confira com: pnpm palco:checar`);
}

async function rodar(a: Args, d: Dispositivo, cfg: MqttBridgeConfig) {
  const c = cenario(a.cenario);
  const motivos = bloqueios(c, a.sensores, await pendencias(d));
  // Palco com pendência recusa de qualquer jeito: não vale esperar a outra fonte (a fotografia já diz a idade).
  const recusaJa = motivos.length > 0 && c.nome === "palco";
  const vazao = !a.sensores.has("VAZAO") ? null
    : recusaJa ? avisoVazaoAlheia(await vazaoDeOutraFonte(d))
      : await conferirVazaoAlheia(d, log, { esperar, interrompido: () => parar });
  if (parar) return;
  if ((motivos.length || vazao) && c.nome === "palco") throw new Error(recusaDoPalco(motivos, vazao));
  for (const m of motivos) log(`AVISO: ${m}`);
  if (vazao) log(`AVISO: ${vazao}`);
  log("SIMULAÇÃO: todas as leituras são gravadas como SIMULATED (canal bancada-virtual). Diga em voz alta: SIMULAÇÃO.");
  log(`Cenário ${c.nome}: ${c.resumo}.`);
  log(`Sensores ${[...a.sensores].join(", ")} · uma leitura a cada ${BANCADA_INTERVALO_S} s · ${Number.isFinite(c.fim) ? `${c.fim - c.inicio} s no total` : "até Ctrl+C"}.`);
  const previstos = ensaiar(c, regrasDe(d, cfg)).filter(x => a.sensores.has(x.sensor));
  log("Marcos esperados pelas regras atuais (T0 = início do fenômeno; sem reação do operador):");
  if (c.inicio < 0) console.log(`  ${rotulo(c.inicio)} primeira leitura: ${-c.inicio} s de sensores parados`);
  for (const x of previstos) console.log(`  ${rotulo(x.t)} ${DISPARO[x.tipo]}${x.kg !== undefined ? `, ${br(x.kg)} kg` : ""}`);
  if (!previstos.length) console.log("  nenhuma ocorrência nem lote");
  for (const l of c.limites) console.log(`  ${l}`);
  const esperados = new Set(ensaiar(c).filter(x => a.sensores.has(x.sensor)).map(x => x.tipo));
  if ([...esperados].some(t => !previstos.some(x => x.tipo === t))) log("AVISO: com as regras configuradas, parte do cenário não dispara (confira o Device e MQTT_*).");

  for (let n = a.inicioEm; n > 0 && !parar; n--) { process.stdout.write(`\r${PREFIXO} Começa em ${n} s... `); await esperar(1_000); }
  if (a.inicioEm) process.stdout.write("\n");
  if (parar) return;

  const sessao = new SessaoBancada(c, { dispositivo: a.dispositivo, sensores: a.sensores, cfg });
  log(`Sessão ${sessao.bootId} começou às ${sp(new Date())}.`);
  const inicio = Date.now();
  const vigia = c.reativo ? setInterval(() => { sessao.observar().then(ls => ls.forEach(log), () => undefined); }, 1_000) : undefined;
  try {
    // Horário absoluto de cada leitura: atraso de uma não empurra as seguintes.
    for (let k = 0; !parar && !sessao.terminou(); k++) {
      const agendado = inicio + k * BANCADA_INTERVALO_S * 1000;
      const espera = agendado - Date.now();
      if (espera > 0) await esperar(espera);
      if (parar) break;
      for (const l of await sessao.passo(agendado)) log(l);
    }
  } finally {
    if (vigia) clearInterval(vigia);
  }
  const { gravadas, descartadas, perdidas } = sessao.contagem;
  log(`Fim${parar ? " (interrompido)" : ""}: ${gravadas} leitura(s) gravada(s), ${descartadas} descartada(s), ${perdidas} perdida(s), tudo SIMULATED.`);
  log(`Ocorrência de fluxo: ${sessao.abertas.fluxo ?? "nenhuma"} · de temperatura: ${sessao.abertas.temperatura ?? "nenhuma"} · lote: ${sessao.abertas.lote ? `${sessao.abertas.lote} (${br(sessao.abertas.kg ?? 0)} kg)` : "nenhum"}.`);
  for (const r of sessao.reabertas) log(`Reaberta pela regra em ${rotulo(r.t)}: ocorrência de ${r.qual} ${r.id} (a ${r.anterior} foi encerrada no meio da gravação). Confira no BI.`);
}

async function principal() {
  const a = lerArgumentos(process.argv.slice(2));
  if (a.ajuda) { console.log(AJUDA); return; }
  const cfg = loadMqttConfig();
  const [{ nome }] = await getDb().$queryRaw<{ nome: string }[]>`SELECT current_database() AS nome`;
  log(`Bancada virtual RICHARDS · banco ${nome} · dispositivo ${a.dispositivo}`);
  if (a.checar) {
    const itens = [...(await checar(a.dispositivo, cfg, process.env, a.sensoresInformados ? a.sensores : undefined)), ...(await checarAmbiente())];
    for (const i of itens) console.log(`  ${i.nivel.padEnd(5)} ${i.texto}`);
    const falhas = itens.filter(i => i.nivel === "FALHA").length;
    log(falhas ? `${falhas} item(ns) a resolver antes do palco.` : "Pronto para o palco.");
    process.exitCode = falhas ? 1 : 0;
    return;
  }
  // Gravar (leituras ou preparação) só em bancada de demonstração.
  if (process.env.DEMO_MODE !== "true") throw new Error(`recusado: DEMO_MODE precisa ser "true" no .env (está ${JSON.stringify(process.env.DEMO_MODE ?? "")})`);
  trava = (await travar()) ?? undefined;
  if (!trava) throw new Error("outra bancada virtual (ou um --preparar) já está rodando neste banco: encerre-a antes (pnpm palco:checar lista os processos)");
  const d = await acharDispositivo(a.dispositivo, cfg);
  if (a.preparar) await prepararInterativo(d, a.confirmar);
  else await rodar(a, d, cfg);
}

async function encerrar() {
  if (trava) { await soltar(trava).catch(() => undefined); trava = undefined; }
  await getDb().$disconnect().catch(() => undefined);
}

// Só como comando: os testes importam as funções sem disparar nada.
if (/run-bancada-virtual\.[cm]?[jt]s$/.test(process.argv[1] ?? "")) {
  const interromper = () => {
    if (parar) process.exit(130); // segundo Ctrl+C: sai já (a trava cai junto com a conexão)
    parar = true;
    log("Encerrando: liberando a trava e o banco...");
    acordar?.();
  };
  process.on("SIGINT", interromper);
  process.on("SIGTERM", interromper);
  principal()
    .catch(e => { console.error(`${PREFIXO} ${msg(e)}`); process.exitCode = 1; })
    .finally(encerrar)
    .then(() => process.exit());
}
