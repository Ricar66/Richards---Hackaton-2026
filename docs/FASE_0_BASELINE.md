# Fase 0 — Inventário e baseline verde

**Data:** 03/11/2026. **Escopo:** só o mínimo para instalar, gerar Prisma, passar typecheck/lint/test/build, subir o Docker e testar o health. Nada de visual novo.

**Ambiente da execução:** Windows 11, Node 25.9.0 (local) e Node 22 Alpine (imagem Docker), pnpm 10.16.1, Docker Desktop 29.8.2, Compose v5.5.1, PostgreSQL 16 (container).
**Cópia de trabalho:** `E:\CraftOps\apps\web\richards-platform`. O pacote original (ZIP extraído em `Downloads`) ficou intocado e serviu de base para o diff.

## Gates — antes e depois

| Gate | Como veio | Depois da Fase 0 | Evidência |
|---|---|---|---|
| `pnpm install` | PASSOU (não havia lockfile) | PASSOU | `pnpm-lock.yaml` gerado |
| `pnpm db:generate` | **FALHOU**: `'prisma' não é reconhecido` | PASSOU | Prisma Client 7.10.1 gerado em `src/generated/prisma` |
| `prisma validate` | **FALHOU**: 23 erros P1012 | PASSOU | "The schema is valid" |
| `pnpm typecheck` | **FALHOU**: 13 erros (todos em cascata do client não gerado) | PASSOU | `tsc --noEmit` exit 0 |
| `pnpm lint` | **FALHOU**: 9 erros, 4 avisos | PASSOU: 0 erros, 3 avisos | avisos: 2 imports sem uso, export anônimo no postcss |
| `pnpm test` | PASSOU 4/4 | PASSOU 4/4 | só testes de domínio |
| `pnpm build` | NÃO EXECUTADO (falharia: começa por `prisma generate`) | PASSOU | Next 16.4.4, 13 rotas + proxy |
| `docker compose up --build` | NÃO EXECUTADO | PASSOU | db `healthy`, web pronto |
| `GET /api/health` | NÃO EXECUTADO | PASSOU 200 | ver ressalva em T25 |
| ESP32 físico | NÃO EXECUTADO | NÃO EXECUTADO | sem placa nesta etapa |
| `pnpm simulate` | NÃO EXECUTADO | NÃO EXECUTADO | ingestão testada com POSTs manuais (abaixo) |

## O que estava quebrado e como foi corrigido

| # | Encontrado | Arquivo | Gravidade | Correção | Teste de aceite |
|---|---|---|---|---|---|
| 1 | CLI `prisma` não está nas dependências; `db:generate`, `build`, `db:push` e `prisma/config` quebram | `package.json` | P0 | `prisma@7.10.1` exato em devDependencies (mesma versão do client) | `pnpm db:generate` gera o client |
| 2 | Os 10 `enum` em linha única (`enum Role { A B }`) não são sintaxe válida do Prisma; o parser se perde e gera 23 erros | `prisma/schema.prisma` | P0 | Um valor por linha. **Nenhum nome ou valor mudou** | `prisma validate` OK; `db push` cria as 11 tabelas |
| 3 | Sem lockfile; imagem instala com `--no-frozen-lockfile` (cada build pode puxar versões diferentes) | `Dockerfile`, `pnpm-lock.yaml` | P0 | Copia o lockfile e instala com `--frozen-lockfile` | build da imagem PASSOU |
| 4 | `let` nunca reatribuído | `src/app/api/reports/summary/route.ts` | P1 | `const` | lint |
| 5 | `useEffect(() => setData(initialData))` (setState síncrono em effect, regra do React Compiler) | `src/components/workspace-v2.tsx` | P1 | Padrão "ajustar estado durante o render". A ressincronização é necessária: `/ocorrencias` → `/doacoes` reaproveita a mesma instância | lint + build |
| 6 | Variável `offset` mutada dentro do `map` no render do donut | `src/components/workspace-v2.tsx` | P1 | Offsets pré-calculados, mesma matemática e mesmo desenho | lint + build |
| 7 | `<a href="/api/reports/summary">` acusado por `no-html-link-for-pages` | `src/components/workspace-v2.tsx` | P2 (falso positivo) | Mantido `<a>` com supressão justificada: `<Link>` faria prefetch e geraria um PDF a cada prefetch | lint |
| 8 | `workspace.tsx` (UI V1) não é importado por nenhuma rota e tem 3 erros de lint | `eslint.config.mjs` | P2 | Ignorado no lint. **Remoção só com autorização** | lint |
| 9 | `POSTGRES_PASSWORD` ausente do `.env.example`, embora README e LEIA_PRIMEIRO mandem ajustá-lo | `.env.example` | P1 | Variável adicionada com aviso de sincronizar com `DATABASE_URL` | compose usa a senha do `.env` |
| — | Alterações automáticas do `next build` | `tsconfig.json`, `next-env.d.ts` | — | Next incluiu `.next/dev/types/**/*.ts` | — |

## Testes da matriz (docs/plano/11) executados nesta fase

| ID | Resultado | Observação |
|---|---|---|
| T01 | PASSOU | compose sobe, health 200 |
| T02 | PASSOU | banco parado e religado: 170 leituras preservadas |
| T03 | PASSOU | seed rodado 2×: 1 org, 1 unidade, 1 sensor, 168 leituras, 3 ocorrências, 3 lotes |
| T04 | PASSOU | 202, leitura gravada com `source=SIMULATED` (header de simulador em `DEMO_MODE=true`) |
| T05 | PASSOU | chave errada → 401; sem chave → 401 |
| T06 | PASSOU | `flowLpm=5000` → 422; JSON quebrado → 400 |
| T07 | PASSOU | mesmo `bootId+sequence` → `duplicate:true`, uma linha só |
| T08 | NÃO REPRODUZIDO | 5 POSTs paralelos iguais → 1 linha e 4 `duplicate`. **A corrida continua no código** (`findUnique` → `create`); sob carga, a violação de UNIQUE vira 503 |
| T25 | **FALHOU** | com o banco **desligado**, `/api/analytics/overview` responde **200 com números do `demo-overview.ts`** (842,6 L) sem sinalizar falha; `/api/health` responde `healthy:true` |
| Demais | NÃO EXECUTADOS | Fases 1–5 |

Também verificado: o proxy devolve 401 sem credencial ou com senha errada; `/`, `/operacao`, `/ocorrencias`, `/doacoes`, `/monitoramento`, `/relatorios`, `/dispositivos`, `/intelligence` e `/richards-bi-v3.html` respondem 200 com credencial; o PDF sai `application/pdf` válido; o overview com banco ligado vem do PostgreSQL (6.197,8 L, não os 842,6 L do fallback). O HTML V3 não tem nenhuma URL externa e funciona offline.

## Diagnóstico priorizado (o que ficou para as próximas fases)

**P0, entram na Fase 1**
1. **Fallback demo silencioso** (`get-overview.ts`): com `DEMO_MODE=true`, qualquer erro de banco vira números fictícios com HTTP 200. Deve responder 503 e a UI deve mostrar erro honesto (T25).
2. **Health sem banco** (`api/health`): fazer `SELECT 1` e devolver 503 quando o banco cair.
3. **Corrida na ingestão** (`ingest-telemetry.ts`): tratar `P2002` como `duplicate:true` em vez de 503 (T08).
4. **Migrations versionadas**: o container roda `db push` + seed + `next dev` a cada start. Criar a migration inicial (baseline do schema atual) e trocar para `prisma migrate deploy`.
5. **`AuditEvent` nunca é gravado**: nenhuma rota escreve auditoria. Gravar na mesma transação das mudanças de ocorrência e doação.

**P1**
- Overview: janela fixa de 7 dias, buckets por dia em **UTC** (o plano pede `America/Sao_Paulo`) e linha de referência **fixa em 120 L** num gráfico de dados reais (~900 L/dia no seed). Ela é rotulada "ilustrativa", mas não vem de dado nenhum.
- KPI "Ocorrências abertas" soma `OPEN` + `ACKNOWLEDGED`. Pelo doc 04, ou o rótulo vira "ativas" ou a conta passa a usar só `OPEN`.
- `Device.state` nunca vira `OFFLINE` (não há verificação por `lastSeenAt`); o seed grava `ONLINE`.
- O container web roda `next dev` (primeira carga de cada rota compila na hora). Para o palco, considerar `next build` + `next start`.
- Tenant fixo `DEMO_ORG_ID` em todas as rotas; Basic Auth de laboratório (`AUTH_MODE` diferente de `basic` deixa tudo aberto).

**P2**
- Fontes `DM Sans` e `Plus Jakarta Sans` usadas no CSS mas nunca carregadas (cai na fonte do sistema).
- Tempo médio de resposta calculado só sobre as 30 ocorrências mais recentes.
- `NEXT_PUBLIC_APP_NAME` não é usado no código.
- Node 25 não traz mais o `corepack`; o `corepack enable` do LEIA_PRIMEIRO falha. Nesse caso instale com `npm i -g pnpm@10.16.1`.
- pnpm 10 ignora scripts de build de `esbuild`, `@prisma/engines` e `prisma`. Nada quebrou (generate, db push e tsx funcionaram), mas `pnpm approve-builds` resolve o aviso se ele incomodar.

## Como reproduzir

```powershell
cd E:\CraftOps\apps\web\richards-platform
Copy-Item .env.example .env    # trocar senhas e chave; POSTGRES_PASSWORD igual à senha do DATABASE_URL
pnpm install
pnpm db:generate; pnpm typecheck; pnpm lint; pnpm test; pnpm build
docker compose up -d --build   # http://localhost:3000 (usuário/senha do .env)
curl http://127.0.0.1:3000/api/health
docker compose down            # para os containers; o volume com os dados permanece
```

Só a bancada local `127.0.0.1` foi usada. O `compose.iot-lab.yml` (porta 3001 na LAN) não foi ativado.
