# Prompts por fase — use depois do prompt mestre

## FASE 0 — Diagnóstico e baseline verde
"Abra a raiz `RICHARDS_PLATFORM` e leia AGENTS.md, docs/plano e o código existente. Quero um inventário dos arquivos e problemas verificáveis, sem recriar o projeto. Execute pnpm install, prisma generate, typecheck, lint, testes e build se possível. Teste Docker Compose/seed e `/api/health`. Corrija apenas bloqueadores, com diff, justificativa e comandos executados; nunca faça reset destrutivo. Entregue um checklist de baseline e pare."

## FASE 1 — Banco e APIs
"Com baseline aprovado, implemente contratos tipados e validação Zod para endpoints P0: telemetria, overview com `from,to,siteId,deviceId,source`, histórico timeseries, ocorrências e doações. Preserve schema existente, proponha migrações não destrutivas, use tenant derivado da sessão e testes de contrato. O JSON de simulação deve permanecer SIMULATED. Gere casos de teste e pare ao terminar esta fase."

## FASE 2 — IoT e regras
"Integrar ESP32 YF-S201 e simulador com `/api/iot/telemetry`: revisar clock skew, retransmissão, UNIQUE de `(deviceId,bootId,sequence)` sob concorrência, `FlowAlertPolicy` calibrável, evitar alertas duplicados, timeline de ACK/RESOLVE. Não prometa microvazamentos. Mostre serial esperado, curl real, respostas 202/401/422/503 e testes físicos pendentes. Não comece BI ainda."

## FASE 3 — BI Nativo Premium
"Migrar o BI V3 de iframe para React/Next.js nativo com Recharts. Manter identidade RICHARDS de sidebar escura e canvas claro, com UI de BI densa, não genérica. Criar filtros globais por URL (data, unidade, dispositivo, origem) que afetem KPIs/gráficos/tabelas no backend; drilldown point->readings->occurrence->timeline. Adicionar tooltip rico, brush, zoom, estados loading/empty/error, acessibilidade e microanimações. Não usar dados falsos ou botões inertes. Migrar uma rota de cada vez, preservando fallback operacional."

## FASE 4 — Impacto alimentar
"Criar fluxo integrado de lotes `PENDING_REVIEW -> AVAILABLE -> RESERVED -> DELIVERED`, com avaliação humana documentada, entidade autorizada, timestamps e auditoria. Bloquear transições inválidas. Dashboard soma apenas lotes DELIVERED no período de recebimento. Escreva testes unitários de transições e de API. Não certifique segurança alimentar automaticamente."

## FASE 5 — PDF e acabamento
"Implementar relatório PDF de 2 páginas com os mesmos filtros e serviços do BI. Fonte de dados, timestamps, unidade, metadados, tabelas de ocorrências e entregas, nota sobre números estimados. Verificar igualdade de métricas PDF/dashboard, responsividade 375/768/1440, estados de erro, acessibilidade do drawer e fallback demo rotulado. Enviar resultados de testes e roteiro de apresentação."

## FASE 6 — Endurecimento para piloto (não para hackathon)
"Depois do MVP validado, proponha sem executar grandes alterações: autenticação por sessão, RBAC/tenant, rotação de chave ESP32, TLS, limites, logs, auditoria, backups, retenção, rate limit, gestão de múltiplas unidades, manutenção dos sensores, custos cloud e observabilidade. Priorize por risco e custo, sem afirmar pronto."

## Prompt de revisão de PR
"Revise o diff como um tech lead exigente: regressões, arquitetura DDD, auth/tenant, idempotência, Prisma migrations, fontes SIMULATED/DEVICE, coerência matemática dos KPIs, precisão de vazão, estados de erro, UI, acessibilidade e testes. Classifique P0/P1/P2. Não altere código nesta etapa; indique correções e evidências."
