# Fase 1 — Banco, autenticação de laboratório e contratos

**Data:** 03/11/2026. **Branch:** `feat/fase-1-banco-contratos`. **Base:** Fase 0 (`docs/FASE_0_BASELINE.md`).

## Resultado dos gates

| Gate | Resultado |
|---|---|
| `pnpm typecheck` | PASSOU |
| `pnpm lint` | PASSOU (0 erros, 0 avisos) |
| `pnpm test` (unitários, sem banco) | PASSOU 13/13 |
| `pnpm test:integration` (Postgres real, banco `richards_test`) | PASSOU 22/22 |
| `pnpm build` | PASSOU |
| `docker compose up --build` | PASSOU: `migrate deploy` + seed + `next start` |
| Verificação no navegador (Chrome headless, script fora do repo) | PASSOU 7/7 |
| Checagem de mutação (removendo lock e idempotência) | os testes falham como deveriam |
| ESP32 físico | NÃO EXECUTADO (sem placa) |

## O que mudou e por quê

### Dados honestos quando o banco cai (regra inviolável 1)
- `get-overview.ts`: removido o fallback que devolvia números fixos com HTTP 200 quando o banco falhava. Agora lança `DatabaseUnavailableError`. O `demo-overview.ts` foi apagado (fica no histórico do git).
- `api/analytics/overview` e `api/reports/summary`: 503 `DATABASE_UNAVAILABLE`. O PDF não é gerado com números inventados.
- `api/health`: faz `SELECT 1` (limite de 3 s) e responde 503 `database:"down"` quando o banco cai.
- `lib/db.ts`: timeout de conexão de 5 s, para um banco inalcançável virar 503 em vez de travar a requisição.
- `app/error.tsx`: tela "Dados indisponíveis no momento", sem nenhum indicador.
- V2 e iframe V3: quando o polling de 15 s falha, aparece uma faixa "Sem conexão com o servidor… os números não estão sendo atualizados".

### Telemetria sem corrida (regras 4 e 5)
- Idempotência por `INSERT … ON CONFLICT DO NOTHING` (`createMany` + `skipDuplicates`). Quem decide é a constraint UNIQUE, não um SELECT prévio. Requisições simultâneas iguais dão uma leitura só e nenhum 503.
- Abertura de ocorrência (`open-flow-occurrence.ts`) com `pg_advisory_xact_lock` por dispositivo: leituras simultâneas suspeitas abrem **uma** ocorrência. Ocorrência, evento de timeline e auditoria saem na mesma transação.
- A janela da regra considera só leituras da **mesma origem**. Histórico `SIMULATED` nunca sustenta alerta `DEVICE`.
- A auditoria da ocorrência automática guarda a janela (`windowStart`/`windowEnd`), a regra aplicada e a leitura que disparou o alerta. Isso é a base do drilldown da Fase 3.
- `/api/admin/simulate` passa pela mesma regra: com ocorrência de fluxo ativa, responde 409 `ACTIVE_OCCURRENCE_EXISTS` em vez de duplicar.
- Hash de chave malformado no banco não derruba a rota (o tamanho é checado antes do `timingSafeEqual`).

### Auditoria e concorrência nas ações
- `AuditEvent` (antes nunca gravado) agora registra: criação/ACK/RESOLVE/DISMISS de ocorrência e criação/transições de lote. Cada registro vai na mesma transação da mudança, com `actor` e estado anterior.
- `OccurrenceEvent.actor` (migration aditiva): a timeline mostra quem executou (`operador:<usuário>`, `dispositivo:<código>`, `simulador:<usuário>`).
- Guarda otimista (`updateMany … where status = lido`): duas ações simultâneas na mesma ocorrência ou lote resultam em um vencedor e um 409 `CONFLICT`, nunca em sobrescrita silenciosa.
- Doações: a lógica saiu da rota para `DonationService` (mesma regra de negócio). Só mensagens de `DonationRuleError` chegam ao cliente; erro interno vai para o log.

### Autenticação de laboratório (continua sendo **só laboratório**)
- **Fail-closed**: só `AUTH_MODE="none"` explícito desliga a senha. Antes, variável ausente ou com erro de digitação deixava tudo aberto.
- **CSRF**: escritas em `/api/*` (exceto telemetria) exigem `Content-Type: application/json` (415) e mesma origem quando o navegador informa `Origin`/`Sec-Fetch-Site` (403). Sem isso, um site externo conseguiria postar usando a Basic Auth guardada no navegador.
- `x-richards-actor` é definido **só** pelo proxy. O valor enviado pelo cliente é descartado.
- Comparação de credencial por digest SHA-256 (não vaza o tamanho da senha esperada).
- **Não é segurança de produção**: sem sessão, RBAC ou multi-tenant (tenant fixo `DEMO_ORG_ID`), sem TLS e sem rate limit.

### XSS no BI V3
- `public/richards-bi-v3.html` (e a cópia em `preview/`): função `esc()` aplicada nas 13 interpolações de texto vindo da API dentro de `innerHTML`. Antes, um lote cadastrado com `<img onerror=…>` executava script no iframe. Verificado no navegador com payload real pela ponte `postMessage`.

### Migrations e container
- `prisma/migrations/20261103120000_init` (baseline do schema) e `20261103130000_occurrence_event_actor` (aditiva). O banco de desenvolvimento existente foi marcado como baseline com `migrate resolve --applied`, sem tocar nos dados.
- Container: `migrate deploy` substitui `db push` a cada start e **nunca** reseta.
- Container em **build de produção** (`next build` + `next start`). Motivo descoberto no navegador: o `next dev` do Next 16 bloqueia recursos de desenvolvimento para origens fora de `localhost`, e a página **não hidratava** acessada por `127.0.0.1` ou pelo IP da LAN (o caso do `compose.iot-lab.yml` no dia da demo).
- `lib/format.ts`: datas sempre em `America/Sao_Paulo`. Com o container em UTC, o horário renderizado no servidor diferia do navegador e causava erro de hidratação.

### Limpeza
- `src/components/workspace.tsx` (V1 não importada) e `demo-overview.ts` apagados; continuam no histórico do git.
- Lint zerado (imports sem uso, export anônimo no PostCSS).

## Testes automatizados novos

**Integração** (`tests/integration/`, banco `richards_test`; o script e o helper recusam qualquer banco que não termine em `_test`):

- T04: origem `DEVICE`/`SIMULATED` gravada corretamente.
- T05: chave inválida ou vazia não grava nada.
- Relógio com desvio maior que 5 min é recusado.
- T07: retentativa não soma volume.
- T08: 20 requisições iguais simultâneas geram uma leitura e nenhuma falha.
- T30: novo bootId reaproveita a sequence sem colisão.
- T09: fluxo abaixo do limiar não abre ocorrência.
- T10: abre uma ocorrência só, com timeline e auditoria da janela.
- T11: interrupção do fluxo reinicia a janela.
- T12: 10 leituras suspeitas simultâneas abrem uma ocorrência.
- Histórico simulado não sustenta alerta de dispositivo.
- T13: ACK e RESOLVE ficam na timeline e na auditoria com o actor.
- T14: RESOLVE sem nota é recusado e nada muda.
- Transições inválidas, e RESOLVE duplo simultâneo com um único vencedor.
- 10 aberturas simultâneas de ocorrência geram uma só.
- T15–T19: lote nasce `PENDING_REVIEW`; sem verificação, é recusado; só `DELIVERED` entra em kg entregues; trilha de auditoria completa.
- Transição simultânea de lote com um único vencedor.
- T25: banco fora dá 503 em overview, health e PDF, mesmo com `DEMO_MODE=true`.

**Unitários**:

- `FlowAlertPolicy`: amostras fora de ordem, buraco maior que 45 s, série vazia, limiar inválido.
- Proxy:
  - 401 sem credencial e com senha errada.
  - Fail-closed com `AUTH_MODE` ausente ou digitado errado.
  - `x-richards-actor` não pode ser forjado.
  - CSRF: 403 para outra origem, 415 para `text/plain`.
  - Telemetria e health ficam fora da Basic Auth.

## Como demonstrar

```powershell
cd E:\CraftOps\apps\web\richards-platform
pnpm test; pnpm test:integration
docker compose up -d --build
curl http://127.0.0.1:3000/api/health          # 200 database:"up"
docker compose stop db
curl http://127.0.0.1:3000/api/health          # 503 database:"down"; a tela mostra "Dados indisponíveis"
docker compose start db
```

## Pendências e próximos passos

**Fase 2 — IoT + ocorrências (P0)**
- Rodar o `pnpm simulate` e o ESP32 real contra o container (IOT-01..IOT-11). Hoje o seed já deixa uma ocorrência de fluxo `OPEN`, então resolva-a antes de demonstrar uma ocorrência nova.
- `GET /api/occurrences/:id` com timeline e amostras da janela (os dados já estão na auditoria).
- `Device.state` nunca vira `OFFLINE`: calcular pelo `lastSeenAt`.
- Clock skew de ±5 min descarta amostras depois de queda longa de rede: definir uma política documentada.

**Fase 3 — BI (P0/P1)**
- Overview com filtros (`from`/`to`/`siteId`/`deviceId`/`source`), buckets em `America/Sao_Paulo` (hoje em UTC).
- Remover a linha de referência fixa de 120 L (não vem de dado) e marcar o dia corrente como parcial (hoje o último ponto "despenca").
- Moldura preta em volta do donut na V2 (visual, anterior a esta fase).

**Segurança e infra (P1/P2)**
- Imagem base `node:22-alpine` com 9 vulnerabilidades altas (Docker Scout): atualizar ou fixar um digest corrigido.
- Sessão, RBAC e tenant real antes de qualquer exposição fora do laboratório. `requestId` nos erros.
- Falta `favicon.ico` (404 em toda página).
- E2E automatizado no repositório (Playwright, como pede o doc 11). A verificação de navegador desta fase rodou com um script fora do repo.
