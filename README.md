# RICHARDS Intelligence — Hackathon Senac 2026

**Este é um protótipo de laboratório.** A aplicação foi renomeada para RICHARDS em 23/10/2026, homenageando Ellen Swallow Richards.

## Arquitetura
Next.js App Router + React/TypeScript + pnpm + PostgreSQL/Prisma + Docker Compose + regra de vazão orientada a objetos + API IoT + export PDF.

## Rotas
- `/`: **RICHARDS BI V3** — interface investigativa principal, com iframe HTML e ponte de **leitura** via `postMessage`. Demonstrações locais são simuladas; no modo conectado, filtros não suportados ficam inativos e ações de escrita ficam no módulo operacional.
- `/operacao`: UI React V2 ligada aos endpoints existentes; serve como fallback operacional.
- `/ocorrencias`, `/doacoes`, `/monitoramento`, `/relatorios`, `/dispositivos`: rotas operacionais persistidas.
- `/intelligence`: alternativa de acesso ao mesmo BI V3.
- `/api/iot/telemetry`: recepção de hardware real.

## Instalação com Docker
```
cp .env.example .env
# ajuste POSTGRES_PASSWORD, RICHARDS_OPERATOR_USER/PASSWORD e IOT_DEMO_DEVICE_KEY
docker compose up --build
```
Abra http://localhost:3000. O container roda o **build de produção** (`next build` + `next start`) e, a cada start, aplica migrations pendentes (`prisma migrate deploy`) e o seed idempotente. A API do ESP32 recebe pacotes em `/api/iot/telemetry`, mas não exponha a LAN sem proteção. Para parar sem perder dados: `docker compose down` (sem `-v`).

## Desenvolvimento local
Node 22+ e pnpm 10.16.1 (no Node 25+ não há `corepack`: `npm i -g pnpm@10.16.1`).

```
pnpm install
pnpm db:generate
pnpm db:deploy        # aplica migrations versionadas (nunca use reset/force-reset em base preservada)
pnpm db:seed          # idempotente; todos os dados iniciais são SIMULATED
pnpm dev              # hot reload em http://localhost:3000
```
Mudou o `schema.prisma`? Gere uma migration nova em `prisma/migrations/` (`pnpm db:migrate`, interativo) e versione junto com o código. `pnpm db:push` fica só para banco descartável.

Verificar: `pnpm typecheck`, `pnpm lint`, `pnpm test` (unitários, sem banco), `pnpm test:integration` (Postgres real no banco separado `TEST_DATABASE_URL`, cujo nome precisa terminar em `_test`; os testes apagam os dados **desse** banco), `pnpm build`.

## Status
- Protótipo HTML offline validável no navegador.
- Fases 0 e 1 concluídas: ver `docs/FASE_0_BASELINE.md` e `docs/FASE_1_BANCO_CONTRATOS.md`. ESP32 físico **ainda não foi testado**.
- O BI V3 via iframe NÃO substitui a implementação futura React nativa/filtragem backend completa.
- Dados SIMULATED não podem ser apresentados como resultado real nem como litros economizados.

Consulte os documentos da raiz do pacote para briefings, custos, riscos, datas e pitch.


## Kit de desenvolvimento V4 (novo)
Leia `AGENTS.md` e `docs/plano/` para escopo completo e prompts. Comece pela Fase 0 do roadmap, mantendo o código V3 e aplicando correções incrementais.
