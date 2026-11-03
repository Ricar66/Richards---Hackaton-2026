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
Abra http://localhost:3000. A API do ESP32 recebe pacotes em `/api/iot/telemetry`, mas não exponha a LAN sem proteção.

## Desenvolvimento local
Node 22+, pnpm 10: `pnpm install`, `pnpm db:generate`, `pnpm db:push` (somente demo), `pnpm db:seed`, `pnpm dev`.
Verificar: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.

## Status
- Protótipo HTML offline validável no navegador.
- Backend e firmware são base para integração; build end-to-end e ESP32 físico **não foram executados** nesta entrega.
- O BI V3 via iframe NÃO substitui a implementação futura React nativa/filtragem backend completa.
- Dados SIMULATED não podem ser apresentados como resultado real nem como litros economizados.

Consulte os documentos da raiz do pacote para briefings, custos, riscos, datas e pitch.


## Kit de desenvolvimento V4 (novo)
Leia `AGENTS.md` e `docs/plano/` para escopo completo e prompts. Comece pela Fase 0 do roadmap, mantendo o código V3 e aplicando correções incrementais.
