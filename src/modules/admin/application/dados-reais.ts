import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { DEMO_RECIPIENT_IDS } from "@/lib/constants";
import { auditRecord } from "@/modules/audit/infrastructure/audit-record";

/**
 * Passagem para "só dados reais" (decisão do Ricardo, 06/11): apaga o que é SIMULATED e as instituições fictícias
 * do seed. Nunca toca em leitura, ocorrência ou lote de outra origem (DEVICE ou MANUAL): registro histórico real
 * não é modificado. Tudo numa transação só, com um evento de auditoria do que saiu.
 */
type Db = PrismaClient | Prisma.TransactionClient;

export type InventarioSimulado = {
  leituras: number; ocorrencias: number; eventosDeOcorrencia: number; lotes: number; missoes: number; auditoria: number;
  instituicoes: { id: string; nome: string; removivel: boolean; motivo: string | null }[];
  reais: { leituras: number; ocorrencias: number; lotes: number };
  /** Leitura SIMULATED mais recente: bancada ou simulador ligado durante a limpeza recriaria dado na hora. */
  ultimaSimuladaEm: Date | null;
};
export type ResultadoLimpeza = Omit<InventarioSimulado, "reais" | "ultimaSimuladaEm" | "instituicoes"> & {
  instituicoesRemovidas: string[]; instituicoesMantidas: { nome: string; motivo: string }[]; dispositivosAjustados: number;
};

/** Janela em que uma leitura SIMULATED indica bancada/simulador ainda ligado. */
export const JANELA_BANCADA_LIGADA_MS = 120_000;
const DEMONSTRACAO = /demonstra[çc][ãa]o/i;

async function alvos(db: Db) {
  const [occ, lots] = await Promise.all([
    db.occurrence.findMany({ where: { source: "SIMULATED" }, select: { id: true } }),
    db.donationBatch.findMany({ where: { source: "SIMULATED" }, select: { id: true } }),
  ]);
  return { occIds: occ.map(o => o.id), lotIds: lots.map(l => l.id) };
}
const auditWhere = (occIds: string[], lotIds: string[]): Prisma.AuditEventWhereInput => ({ OR: [
  { entity: "Occurrence", entityId: { in: occIds } }, { entity: "DonationBatch", entityId: { in: lotIds } },
] });
const missionWhere = (occIds: string[], lotIds: string[]): Prisma.MissionWhereInput => ({ OR: [
  { occurrenceId: { in: occIds } }, { donationBatchId: { in: lotIds } },
] });

export async function inventarioSimulado(db: Db): Promise<InventarioSimulado> {
  const { occIds, lotIds } = await alvos(db);
  const [leituras, eventosDeOcorrencia, missoes, auditoria, reaisLeituras, reaisOcorrencias, reaisLotes, ultima, recipients] = await Promise.all([
    db.telemetryReading.count({ where: { source: "SIMULATED" } }),
    db.occurrenceEvent.count({ where: { occurrenceId: { in: occIds } } }),
    db.mission.count({ where: missionWhere(occIds, lotIds) }),
    db.auditEvent.count({ where: auditWhere(occIds, lotIds) }),
    db.telemetryReading.count({ where: { source: { not: "SIMULATED" } } }),
    db.occurrence.count({ where: { source: { not: "SIMULATED" } } }),
    db.donationBatch.count({ where: { source: { not: "SIMULATED" } } }),
    db.telemetryReading.findFirst({ where: { source: "SIMULATED" }, orderBy: { receivedAt: "desc" }, select: { receivedAt: true } }),
    db.recipientOrganization.findMany({ where: { id: { in: [...DEMO_RECIPIENT_IDS] } }, select: { id: true, name: true } }),
  ]);
  const instituicoes = await Promise.all(recipients.map(async r => {
    const reaisLigados = await db.donationBatch.count({ where: { recipientId: r.id, source: { not: "SIMULATED" } } });
    const motivo = !DEMONSTRACAO.test(r.name) ? "o nome já não diz \"Demonstração\" (pode ter virado instituição real)"
      : reaisLigados ? `ligada a ${reaisLigados} lote(s) real(is): o histórico real não é modificado` : null;
    return { id: r.id, nome: r.name, removivel: motivo === null, motivo };
  }));
  return { leituras, ocorrencias: occIds.length, eventosDeOcorrencia, lotes: lotIds.length, missoes, auditoria, instituicoes,
    reais: { leituras: reaisLeituras, ocorrencias: reaisOcorrencias, lotes: reaisLotes }, ultimaSimuladaEm: ultima?.receivedAt ?? null };
}

export class BancadaLigadaError extends Error {}

export async function limparSimulados(db: PrismaClient, actor: string, now = new Date()): Promise<ResultadoLimpeza> {
  return db.$transaction(async tx => {
    const inv = await inventarioSimulado(tx);
    if (inv.ultimaSimuladaEm && now.getTime() - inv.ultimaSimuladaEm.getTime() < JANELA_BANCADA_LIGADA_MS)
      throw new BancadaLigadaError(`chegou leitura SIMULATED há ${Math.round((now.getTime() - inv.ultimaSimuladaEm.getTime()) / 1000)} s: pare a bancada virtual, o simulador e a ponte MQTT antes de limpar`);
    const { occIds, lotIds } = await alvos(tx);
    const devicesTouched = await tx.telemetryReading.findMany({ where: { source: "SIMULATED" }, distinct: ["deviceId"], select: { deviceId: true } });

    const missoes = (await tx.mission.deleteMany({ where: missionWhere(occIds, lotIds) })).count;
    const auditoria = (await tx.auditEvent.deleteMany({ where: auditWhere(occIds, lotIds) })).count;
    const eventosDeOcorrencia = (await tx.occurrenceEvent.deleteMany({ where: { occurrenceId: { in: occIds } } })).count;
    const ocorrencias = (await tx.occurrence.deleteMany({ where: { id: { in: occIds }, source: "SIMULATED" } })).count;
    const lotes = (await tx.donationBatch.deleteMany({ where: { id: { in: lotIds }, source: "SIMULATED" } })).count;
    const leituras = (await tx.telemetryReading.deleteMany({ where: { source: "SIMULATED" } })).count;

    const removiveis = inv.instituicoes.filter(i => i.removivel);
    // A trava de novo, já sem os lotes simulados: só sai a instituição sem nenhum lote restante.
    const instituicoesRemovidas: string[] = [];
    for (const r of removiveis) {
      if (await tx.donationBatch.count({ where: { recipientId: r.id } })) continue;
      await tx.recipientOrganization.delete({ where: { id: r.id } });
      instituicoesRemovidas.push(r.nome);
    }
    const instituicoesMantidas = inv.instituicoes.filter(i => !instituicoesRemovidas.includes(i.nome)).map(i => ({ nome: i.nome, motivo: i.motivo ?? "ainda ligada a lote" }));

    // "Último contato" volta para a leitura real mais recente; sem leitura real, o sensor fica "sem comunicação" até o próximo pacote.
    let dispositivosAjustados = 0;
    for (const { deviceId } of devicesTouched) {
      const real = await tx.telemetryReading.findFirst({ where: { deviceId }, orderBy: { receivedAt: "desc" }, select: { receivedAt: true } });
      const dev = await tx.device.findUnique({ where: { id: deviceId }, select: { lastSeenAt: true } });
      if (dev && (!real || (dev.lastSeenAt && dev.lastSeenAt > real.receivedAt))) {
        await tx.device.update({ where: { id: deviceId }, data: { lastSeenAt: real?.receivedAt ?? null } });
        dispositivosAjustados++;
      }
    }

    const org = await tx.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    if (org) await tx.auditEvent.create({ data: auditRecord({ organizationId: org.id, entity: "Organization", entityId: org.id, action: "SIMULATED_DATA_PURGED", actor, metadata: {
      leituras, ocorrencias, eventosDeOcorrencia, lotes, missoes, auditoria, instituicoesRemovidas, dispositivosAjustados,
      intocados: inv.reais, motivo: "passagem para só dados reais",
    } }) });
    return { leituras, ocorrencias, eventosDeOcorrencia, lotes, missoes, auditoria, instituicoesRemovidas, instituicoesMantidas, dispositivosAjustados };
  }, { maxWait: 10_000, timeout: 120_000 });
}

export type CadastroInstituicao = { criada: boolean; id: string; nome: string; cidade: string };

/** Instituição real que recebe doações. Não há tela para isso: o operador cadastra pelo terminal, com auditoria. */
export async function cadastrarInstituicao(db: PrismaClient, input: { nome: string; cidade: string; actor: string }): Promise<CadastroInstituicao> {
  const nome = input.nome.trim().replace(/\s+/g, " "), cidade = input.cidade.trim().replace(/\s+/g, " ");
  if (nome.length < 3 || nome.length > 120) throw new Error("nome da instituição: de 3 a 120 caracteres");
  if (cidade.length < 2 || cidade.length > 80) throw new Error("cidade: de 2 a 80 caracteres");
  if (DEMONSTRACAO.test(nome)) throw new Error("o nome não pode conter \"Demonstração\": a limpeza trata esse nome como fictício");
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('recipient-register'))`;
    const existing = await tx.recipientOrganization.findFirst({ where: { name: { equals: nome, mode: "insensitive" } } });
    if (existing) return { criada: false, id: existing.id, nome: existing.name, cidade: existing.city };
    const created = await tx.recipientOrganization.create({ data: { name: nome, city: cidade } });
    const org = await tx.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    if (org) await tx.auditEvent.create({ data: auditRecord({ organizationId: org.id, entity: "RecipientOrganization", entityId: created.id, action: "CREATED", actor: input.actor, metadata: { name: nome, city: cidade } }) });
    return { criada: true, id: created.id, nome: created.name, cidade: created.city };
  });
}
