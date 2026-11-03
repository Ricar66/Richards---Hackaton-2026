# RICHARDS Intelligence — Hackathon Senac 2026

**Este é um protótipo de laboratório.** A aplicação foi renomeada para RICHARDS em 23/10/2026, homenageando Ellen Swallow Richards.

## Arquitetura
Next.js App Router + React/TypeScript + pnpm + PostgreSQL/Prisma + Docker Compose + regra de vazão orientada a objetos + API IoT + export PDF.

## Rotas
O BI nativo em React é a interface principal desde a Fase 3. Os filtros ficam na URL: `?range=24h|7d|30d` ou `from`/`to`, mais `deviceId` e `source`.

| Rota | Tela |
|---|---|
| `/` | Centro de controle: KPIs, gráfico investigativo, fila de atenção, padrão semanal, sinal ao vivo |
| `/monitoramento` | Volume e vazão (gráficos sincronizados, limiar da regra) |
| `/ocorrencias` | Central com busca, filtros e paginação |
| `/doacoes` | Quadro de lotes, da verificação humana à entrega confirmada |
| `/relatorios` | Prévia + PDF com o mesmo filtro |
| `/dispositivos` | Comunicação calculada pelo último contato |

- `/intelligence`: BI V3 em iframe, mantido só como **contingência**.
- `/operacao`: redireciona para `/`.
- `/api/iot/telemetry`: recepção do ESP32. Contrato em `docs/CONTRATO_IOT.md`; demais APIs em `docs/plano/05_API_E_CONTRATOS.md`.

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

Verificar:
- `pnpm typecheck`, `pnpm lint` e `pnpm build`.
- `pnpm test`: unitários, sem banco.
- `pnpm test:integration`: Postgres real no banco separado `TEST_DATABASE_URL`, cujo nome precisa terminar em `_test`. Os testes apagam os dados **desse** banco.
- `pnpm test:e2e`: jornadas no Chrome, depois de `pnpm build`.
  - Sobe uma instância isolada em :3100 no banco de teste.
  - `--with-db-outage` também derruba o container do banco por alguns segundos.
  - As capturas ficam em `.e2e/`.

## Status
- Fases 0 a 5 concluídas. Registros em `docs/FASE_0_BASELINE.md`, `docs/FASE_1_BANCO_CONTRATOS.md`, `docs/FASE_2_IOT_OCORRENCIAS.md`, `docs/FASE_3_BI_NATIVO.md`, `docs/FASE_4_DOACOES_IMPACTO.md` e `docs/FASE_5_PDF_QA_DEMO.md`.
- Roteiro de palco com cliques e contingências: `docs/ROTEIRO_DEMO.md`.
- Modelo de dados: dicionário em Excel, MER e DER em `docs/dados/` (ver `docs/dados/README.md`).
- Firmware **não compilado** e ESP32 físico **não testado**. A equipe de IoT precisa compilar e gravar na Arduino IDE.
- Dados SIMULATED nunca podem ser apresentados como resultado real nem como litros economizados. O BI e o PDF carimbam a origem.

Consulte os documentos da raiz do pacote para briefings, custos, riscos, datas e pitch.


## Kit de desenvolvimento V4 (novo)
Leia `AGENTS.md` e `docs/plano/` para escopo completo e prompts. Comece pela Fase 0 do roadmap, mantendo o código V3 e aplicando correções incrementais.
