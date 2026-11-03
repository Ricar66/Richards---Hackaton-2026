# Modelagem PostgreSQL/Prisma — baseline e evolução

## Baseline existente (não excluir)
`Organization`, `User`, `Site`, `Device`, `TelemetryReading`, `Occurrence`, `OccurrenceEvent`, `RecipientOrganization`, `DonationBatch`, `Mission`, `AuditEvent`. Revisar `prisma/schema.prisma` antes de mudar; há 11 modelos e enums.

## Relações e invariantes
- Organization 1:N Site/User/Device/Occurrence/DonationBatch/Mission/AuditEvent.
- Site 1:N Device e Occurrence; garantir `site.organizationId` == `device.organizationId` ao cadastrar.
- Device 1:N TelemetryReading; identidade global `code` única; chave guardada como hash seguro.
- TelemetryReading tem chave única `(deviceId,bootId,sequence)`; nunca editar medição já aceita.
- Occurrence 1:N OccurrenceEvent; nunca remover histórico por mudança de status.
- DonationBatch 0..1 RecipientOrganization; reservar apenas para instituição ativa, aceite deve ser auditável.
- `Mission` é apenas planejamento de futuro, não construir fluxo completo no MVP.

## Campos atuais fundamentais
| Entidade | Campos | Observação |
|---|---|---|
| Organization | `id,name,sector,city,isDemo` | tenant |
| Site | `id,organizationId,name,description` | unidade monitorada |
| Device | `code,kind,state,apiKeyHash,minFlowLpm,continuousSeconds,lastSeenAt,calibrationPulsesPerLiter` | configuração por sensor |
| TelemetryReading | `bootId,sequence,flowLpm,deltaLiters,capturedAt,receivedAt,source` | leitura imutável |
| Occurrence | `kind,severity,status,title,description,suspectedLiters,openedAt,acknowledgedAt,resolvedAt` | suspeita, não diagnóstico |
| DonationBatch | `description,weightKg,status,source,safetyVerifiedBy,safetyVerifiedAt,recipientId,receivedAt` | verificação humana |
| AuditEvent | `entity,entityId,action,metadata,at` | rastreamento |

## Evolução mínima proposta (não executar tudo antes do MVP)
- `Device`: `sampleIntervalSeconds`, `expectedMinFlow`, `timezone` na unidade e `isEnabled` (se necessário).
- `Site`: horários de funcionamento e política de alerta (opcional; começar com janela configurável no dispositivo).
- `TelemetryReading`: `durationMs` ou `sampledAtStart`, `firmwareVersion`, `qualityFlag`, `receivedAt` existente. `durationMs` é desejável para validar `deltaLiters` contra `flowLpm` e evitar dados incoerentes.
- `Occurrence`: associação rastreável à primeira/última leitura usada na decisão; melhor por `windowStart/windowEnd` ou evento `metadata` com os IDs da amostragem.
- `DonationBatch`: `availableUntil`, `pickupAddress` ou unidade, `deliveryProofBy`, `deliveryProofAt`, `cancelReason`; consentimento/regra sanitária conforme caso.
- `OrganizationMembership`: para usuários que pertencem a múltiplas organizações **apenas se houver necessidade real**; no MVP `User.organizationId` basta.
- `DeviceCredential`: rotação de chave e revogação; no MVP manter uma única credencial forte e não compartilhar entre placas.

## Consultas e semântica
- Litros por dia: `SUM(deltaLiters)` com `capturedAt >= from && capturedAt < to`, filtros por organização/unidade/dispositivo/origem.
- Nunca somar `flowLpm` para obter litros; vazão é taxa, usar `deltaLiters` por intervalo.
- Série de gráfico: buckets `date_trunc` em SQL com cuidado para timezone e agrupamento; devolver timezone na resposta.
- Outliers: marcados como condição de investigação, não removidos silenciosamente.
- Doações: `SUM(weightKg)` apenas `DELIVERED` no intervalo de entrega `receivedAt` (não data de criação!).
- Indicador “alertas abertos”: usar status `OPEN` e `ACKNOWLEDGED` se a legenda disser “ativos”; se disser só “abertos”, contar apenas `OPEN`.
- Tempo de resposta: escolher exatamente `openedAt -> acknowledgedAt` ou `openedAt -> resolvedAt`, com nomenclatura correta.
- Dado misto: agrupar por `source`, identificar fração de amostras `SIMULATED` e `DEVICE`; não ocultar demo.

## Proteção e migração
- Nunca rodar `prisma migrate reset` nem `db push --force-reset` contra bases preservadas.
- `pnpm db:migrate` para alterações versionadas, com script de backup antes de mudanças em produção.
- Índices compostos e constraints contra pesos negativos, duplicação, transições inválidas nos casos de uso.
- Transações ao atualizar lote + auditoria, ocorrência + timeline; conflito de concorrência deve ser tratado.
- Hash de chave de dispositivo não retorna em GET. Credenciais em `.env` ou secret manager.

## Diagrama
Consultar `modelo_erd.mmd` e o schema atual no código. O diagrama é conceitual; o schema de verdade é `prisma/schema.prisma` versionado.
