# API, DTOs, erros e contratos de integração

## Padrão de APIs
Todas as APIs recebem/retornam JSON (exceto PDFs); timestamps ISO UTC, números decimais como número apropriado para UI e arredondamento de exibição separado do banco; paginação cursor ou limite máximo. Resposta de erro estável: `{ "error": "CODE", "message": "Explicação objetiva", "requestId": "..." }`; em demo pode manter payload legado até refatorar front. **Nunca expor stack traces/chaves/tokens.**

**Implementado na Fase 1 (03/11/2026):** como a UI V2 exibe `error` direto no toast, o formato atual é `{ "error": "<mensagem legível>", "code": "<CODIGO>" }`. O `code` é o campo estável para máquinas. `requestId` ainda não existe. Códigos em uso:

| Código | HTTP | Onde |
|---|---|---|
| `INVALID_JSON` | 400 | todas as escritas |
| `DEVICE_KEY_REQUIRED`, `NOT_AUTHORIZED` | 401 | telemetria |
| `CROSS_SITE_WRITE` | 403 | proxy: escrita em `/api/*` vinda de outra origem |
| `NOT_FOUND` | 404 | ocorrência/lote fora do tenant ou inexistente |
| `INVALID_TRANSITION`, `RESOLUTION_NOTE_REQUIRED`, `CONFLICT`, `ACTIVE_OCCURRENCE_EXISTS` | 409 | ocorrências, lotes, simulador |
| `JSON_REQUIRED` | 415 | proxy: escrita em `/api/*` sem `Content-Type: application/json` |
| `VALIDATION_ERROR`, `CLOCK_SKEW` | 422 | Zod / telemetria |
| `DATABASE_UNAVAILABLE`, `NOT_SEEDED` | 503 | qualquer rota quando o banco falha. **Nunca** substituído por dados de demonstração |

`GET /api/health` consulta o banco: `200 {healthy:true, database:"up"}` ou `503 {healthy:false, database:"down"}`.

**Implementado na Fase 2:** `GET /api/occurrences/:id` (Basic Auth de operador; tenant ainda fixo). Devolve:

- **Dados e sensor**: os dados da ocorrência e o `device` com `connectivity` calculada pelo último contato.
- **`timeline`**: os eventos reais (`action`, `note`, `actor`, `at`).
- **`evidence`**: a janela de leituras que a regra avaliou ao abrir o alerta (`windowStart`, `windowEnd`, `rule`, `readings`, `totals`) e `followUp`, as leituras da mesma origem depois da abertura. Ela vem da auditoria `CREATED`. Sem janela registrada, vem `evidence: null` com `evidenceNote` explicando, e **nenhuma leitura é associada por proximidade**.

## Endpoints existentes na V3 (consultar implementação antes de alterar)
| Método | Caminho | Objetivo | Estado |
|---|---|---|---|
| GET | `/api/health` | Saúde da API | existente, conferir com banco |
| POST | `/api/iot/telemetry` | Dados ESP32 idempotentes | implementado, testar hardware |
| GET | `/api/analytics/overview` | KPIs e séries básicos | implementado, sem filtro consistente |
| PATCH | `/api/occurrences/:id` | Transição de ocorrência | implementado, demo org fixa |
| POST | `/api/donations` | Cadastrar lote | implementado, demo org fixa |
| PATCH | `/api/donations/:id` | Mudar status do lote | implementado, demo org fixa |
| GET | `/api/reports/summary` | PDF consolidado | implementado, conferir filtros |
| POST | `/api/admin/simulate` | Evento DEMO | isolar/desativar fora de lab |

## Endpoints-alvo e payloads (quando necessários)
| Método | Endpoint | Filtros/body | Permissão | Critério de aceite |
|---|---|---|---|---|
| GET | `/api/analytics/overview` | `from,to,siteId?,deviceId?,source?` | ANALYST+ | mesmos filtros nos KPIs, limites de data |
| GET | `/api/analytics/timeseries` | `from,to,bucket=15m/1h/1d,...` | ANALYST+ | série agregada e tamanho limitado |
| GET | `/api/analytics/drilldown` | `deviceId,from,to` | ANALYST+ | leituras e ocorrências associadas verificavelmente |
| GET | `/api/occurrences` | `status?,deviceId?,from?,to?,cursor?` | ANALYST+ | paginado, tenant-safe |
| GET | `/api/occurrences/:id` | id | ANALYST+ | timeline e amostras de origem |
| PATCH | `/api/occurrences/:id` | status/note | OPERATOR+ | transição válida, auditável |
| GET | `/api/devices` | site/estado | ANALYST+ | status calculado sem inventar telemetria |
| POST | `/api/donations` | lote | OPERATOR+ | novo lote `PENDING_REVIEW` |
| GET | `/api/donations` | status/periodo | ANALYST+ / destinatário autorizado | sem vazamento de outro tenant |
| PATCH | `/api/donations/:id` | transição/justificativa | OPERATOR+ ou RECIPIENT autorizado | regras sanitárias e aceite |
| GET | `/api/reports/summary` | filtros + `format=pdf` | ANALYST+ | PDF coerente com KPIs e fonte |

**P0:** não implementar toda API-alvo de uma vez. Primeiro GET overview com filtros, GET timeseries/drilldown mínimos, PATCH occurrence e donation já existentes.

## Exemplo — leitura IoT
```http
POST /api/iot/telemetry HTTP/1.1
Content-Type: application/json
x-device-key: <chave-secreta-da-placa>
```
```json
{
  "deviceCode": "RICHARDS-FLOW-001",
  "bootId": "esp32-abcd1234",
  "sequence": 42,
  "flowLpm": 2.4,
  "deltaLiters": 0.6,
  "capturedAt": "2026-11-07T13:15:00Z"
}
```
Resposta esperada `202` com `{ "accepted":true, "duplicate":false, "alerted":true, "occurrenceId":"..." }`. Data ilustrativa, não evento real.

## Exemplo — consulta BI
`GET /api/analytics/timeseries?from=2026-11-06T00:00:00Z&to=2026-11-08T00:00:00Z&bucket=15m&source=DEVICE&deviceId=...`
```json
{
  "filters": {"from":"2026-11-06T00:00:00Z","to":"2026-11-08T00:00:00Z","source":"DEVICE","bucket":"15m"},
  "unit":"L",
  "points":[{"at":"2026-11-07T13:15:00Z","deltaLiters":0.6,"samples":1,"flag":"NORMAL"}],
  "dataset":"DEVICE",
  "generatedAt":"2026-11-07T13:15:05Z"
}
```
Dados ilustrativos. Contrato-alvo, **não pressupor que essa rota existe na V3**.

## Regras de segurança e status HTTP
- `400` JSON malformado; `401` não autenticado; `403` role sem permissão; `404` item fora do tenant ou inexistente.
- `409` transição inválida, duplicação conflitante ou alteração simultânea; `422` payload semanticamente incorreto.
- `429` excesso de requisições, quando implementar rate-limit; `503` banco indisponível.
- Dispositivo usa escopo de credencial exclusivo; não depender de role web.
- Validação Zod sempre no servidor. Nunca confiar em `organizationId` do JSON enviado pelo cliente.
- Auditoria associada ao usuário/sistema em mudanças de estado.

## Contra inconsistência entre filtros
1. `from` inclusivo e `to` exclusivo (UTC), com mínimo/máximo de intervalo.
2. `siteId`, `deviceId`, `source` validados **dentro da organização autenticada**.
3. Todos os endpoints recebem mesmo filtro normalizado por `AnalyticsFilter` único.
4. PDF usa o mesmo caso de uso do overview, não implementa uma segunda matemática.
5. Métricas de doação filtram por `receivedAt` ao contar entregas.
6. Nunca renderizar filtro visual que não altera o backend; desabilitar e explicar até implementar.

## Observação de implementação legada
Os endpoints de ocorrência e doação do starter usam `DEMO_ORG_ID` fixo; isso está aceitável apenas em bancada isolada. A migração para contexto real `organizationId` é prioridade antes de expor a aplicação a usuários de outra organização.
