# Auditoria inicial do código legado RICHARDS V3 — antes de editar

**Este diagnóstico foi baseado em inspeção estática do ZIP de 23/10/2026. Não equivale a build executado nem a teste de hardware.**

## O que já existe e deve ser preservado
- Next.js 16/React/TS; package `pnpm@10.16.1`; Docker Compose e Postgres 16.
- Prisma 7 com `@prisma/adapter-pg` e schema de 11 modelos.
- Entidade Device, leitura idempotente, `FlowAlertPolicy`, `OccurrenceService`, `DonationWorkflow`, endpoints e PDF.
- ESP32 Arduino firmware e simulador CLI.
- BI V3 em `/public/richards-bi-v3.html` + `intelligence-v3-frame.tsx` e V2 operacional em `/operacao`.

## Gaps de implementação confirmáveis no código
1. **BI principal**: V3 apresentado em `iframe`, sincronizado por mensagem apenas para leitura; não oferece todos os filtros/escritas reais que o visual sugere. Migrar gradualmente para React nativo.
2. **Tenant**: boa parte das rotas e analytics depende da constante `DEMO_ORG_ID`; não afirmar multi-tenancy ou RBAC concluído.
3. **Autenticação**: `proxy.ts` Basic Auth de laboratório; se AUTH_MODE não for basic, deixa passar. Não expor publicamente.
4. **Persistência e migração**: Dockerfile roda `pnpm db:push`/seed na inicialização; desenvolver migrations versionadas e impedir resets acidentais.
5. **Medição**: `FlowAlertPolicy` avalia amostras ao longo do tempo, não prova vazamento; testar thresholds, gaps e amostras fora de ordem.
6. **Concorrência**: check `findUnique` antes de `create` de telemetria tem possível corrida; banco UNIQUE protege dado, mas resposta deve converter conflito para `duplicate:true`, não erro genérico.
7. **Time skew**: ±5min rejeita pacotes antigos após desconexão; firmware descarta 422 e precisa documentar perda.
8. **Qualidade de BI**: overview atual agrega 7 dias fixos e fallback demo em falha do banco; filtros devem ser aplicados no backend, e falhas distinguidas de demo.
9. **Doações**: verificação guardada como string, reserva com destinatário demo fixo; não há fluxo real de instituição autenticada.
10. **Relatório PDF**: conferir consistência de filtros, dados, método e proveniência; evitar volumes “economizados”.
11. **Build**: ainda não comprovado em máquina da equipe. `pnpm install`, generate, build, test e Compose são primeiro checkpoint.
12. **Testes**: há `tests/domain.test.ts` cobrindo parte da lógica; faltam integração com banco, E2E e testes concorrentes.

## Primeira tarefa da IA (Fase 0)
- Verificar versões instaladas, lockfile e compatibilidades do projeto.
- Executar comandos e registrar saídas; corrigir **somente problemas que impedem executar o baseline**.
- Elaborar tabela `Encontrado | Arquivo | Gravidade | Correção proposta | Teste de aceite`.
- Não reescrever a interface nem criar módulos enormes antes do primeiro ambiente verde.

## Importante sobre Prisma 7
- Configuração da URL em `prisma.config.ts` e cliente com driver adapter.
- Recomenda-se configurar seeding explícito no `prisma.config.ts` caso passe a usar `prisma db seed`; o starter roda `tsx prisma/seed.ts` diretamente via `pnpm db:seed`.
- `pnpm db:push` é aceitável apenas para banco descartável de demonstração; migrations para evolução séria.
