/**
 * Passagem para "só dados reais" e cadastro de instituição real (terminal do operador; não há tela para isso).
 *
 *   pnpm dados:limpar-simulados                        inventário: mostra o que sairia e o que fica, NÃO apaga
 *   pnpm dados:limpar-simulados --apagar               apaga o que é SIMULATED (pede SIM no terminal)
 *   pnpm dados:limpar-simulados --apagar --confirmar   idem, sem pergunta (contêiner / sem terminal)
 *   pnpm instituicao:cadastrar --nome "..." --cidade "..."
 *   pnpm instituicao:cadastrar --listar
 *
 * Faça backup antes de apagar (docs/DADOS_REAIS.md). Leitura, ocorrência ou lote real (DEVICE/MANUAL) nunca é tocado.
 */
import "dotenv/config";
import { userInfo } from "node:os";
import { createInterface } from "node:readline/promises";
import { getDb } from "@/lib/db";
import { BancadaLigadaError, cadastrarInstituicao, inventarioSimulado, limparSimulados } from "@/modules/admin/application/dados-reais";

const PREFIXO = "[DADOS]";
const log = (...a: unknown[]) => console.log(PREFIXO, ...a);
function usuario() {
  try { return userInfo().username || "desconhecido"; } catch { return process.env.USERNAME ?? process.env.USER ?? "desconhecido"; }
}
/** Nome do banco e host, nunca usuário nem senha. */
function bancoAlvo() {
  try { const u = new URL(process.env.DATABASE_URL ?? ""); return `banco ${u.pathname.replace(/^\//, "")} em ${u.hostname}:${u.port || "5432"}`; }
  catch { return "DATABASE_URL ausente ou inválida"; }
}
function arg(nome: string) { const i = process.argv.indexOf(nome); return i >= 0 ? process.argv[i + 1] : undefined; }
const tem = (nome: string) => process.argv.includes(nome);

async function limpar() {
  const db = getDb();
  const inv = await inventarioSimulado(db);
  log(`Alvo: ${bancoAlvo()}`);
  log("Sai (tudo SIMULATED):");
  console.log(`  leituras: ${inv.leituras}\n  ocorrências: ${inv.ocorrencias} (eventos da linha do tempo: ${inv.eventosDeOcorrencia})\n  lotes de doação: ${inv.lotes}\n  auditoria desses registros: ${inv.auditoria}\n  missões ligadas: ${inv.missoes}`);
  for (const i of inv.instituicoes) console.log(`  instituição "${i.nome}": ${i.removivel ? "sai" : `FICA (${i.motivo})`}`);
  log(`Fica intocado (real): ${inv.reais.leituras} leitura(s), ${inv.reais.ocorrencias} ocorrência(s), ${inv.reais.lotes} lote(s).`);
  const nada = !inv.leituras && !inv.ocorrencias && !inv.lotes && !inv.instituicoes.some(i => i.removivel);
  if (nada) { log("Nada fictício a apagar."); return; }
  if (!tem("--apagar")) { log("Nada foi apagado. Para apagar: faça o backup e rode de novo com --apagar."); return; }
  if (!tem("--confirmar")) {
    if (!process.stdin.isTTY) throw new Error("sem terminal interativo para confirmar: rode de novo com --apagar --confirmar");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const resposta = await rl.question(`${PREFIXO} Backup feito? Digite SIM para apagar: `).finally(() => rl.close());
    if (resposta.trim().toUpperCase() !== "SIM") { log("Nada foi apagado."); return; }
  }
  const autor = `admin:${usuario()}`;
  const r = await limparSimulados(db, autor);
  log(`Apagado (autor ${autor}): ${r.leituras} leitura(s), ${r.ocorrencias} ocorrência(s) com ${r.eventosDeOcorrencia} evento(s), ${r.lotes} lote(s), ${r.auditoria} registro(s) de auditoria, ${r.missoes} missão(ões).`);
  if (r.instituicoesRemovidas.length) log(`Instituições removidas: ${r.instituicoesRemovidas.join("; ")}.`);
  for (const m of r.instituicoesMantidas) log(`Instituição mantida: ${m.nome} (${m.motivo}).`);
  if (r.dispositivosAjustados) log(`Último contato recalculado pela leitura real em ${r.dispositivosAjustados} sensor(es).`);
  log("Auditoria: SIMULATED_DATA_PURGED gravado. Recarregue as telas abertas (F5).");
}

async function instituicao() {
  const db = getDb();
  if (tem("--listar")) {
    const all = await db.recipientOrganization.findMany({ orderBy: { name: "asc" }, select: { name: true, city: true, active: true } });
    log(`${bancoAlvo()} · ${all.length} instituição(ões)`);
    for (const r of all) console.log(`  ${r.active ? "ativa  " : "inativa"} ${r.name} · ${r.city}`);
    return;
  }
  const nome = arg("--nome"), cidade = arg("--cidade");
  if (!nome || !cidade) throw new Error('uso: pnpm instituicao:cadastrar --nome "Nome da instituição" --cidade "Cidade"');
  const r = await cadastrarInstituicao(db, { nome, cidade, actor: `admin:${usuario()}` });
  log(r.criada ? `Cadastrada: ${r.nome} · ${r.cidade} (${bancoAlvo()}).` : `Já existia: ${r.nome} · ${r.cidade}. Nada foi alterado.`);
}

const comando = process.argv[2];
(comando === "limpar" ? limpar() : comando === "instituicao" ? instituicao() : Promise.reject(new Error("comando: limpar | instituicao")))
  .catch(e => { log(`ERRO: ${e instanceof BancadaLigadaError ? `recusado, ${e.message}` : e instanceof Error ? e.message : e}`); process.exitCode = 1; })
  .finally(() => getDb().$disconnect().catch(() => undefined));
