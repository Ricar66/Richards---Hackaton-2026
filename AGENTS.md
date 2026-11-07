# RICHARDS — regras para agentes de IA de programação

**Comece por `MEMORIA.md`:** estado atual, decisões, pendências e armadilhas, atualizados a cada entrega.

**LEIA ANTES DE EDITAR.** Este projeto possui uma base Next.js/Prisma/ESP32 existente, um BI V3 HTML (provisório) e uma UI operacional V2. O nome oficial de trabalho é **RICHARDS Intelligence**; não renomear para SALVA.

## Fonte de verdade
1. `docs/plano/01_PRODUTO_E_OBJETIVOS.md`
2. `docs/plano/02_ESCOPO_FUNCIONAL_CRITERIOS.md`
3. `docs/plano/03_ARQUITETURA_DDD_E_PASTAS.md`
4. `docs/plano/05_API_E_CONTRATOS.md`
5. `docs/plano/11_TESTES_QUALIDADE_ACEITE.md`
6. `docs/plano/14_DIAGNOSTICO_DO_CODIGO_V3.md`
7. Schema e implementações existentes

## Política de edição
- Trabalhe incrementalmente, preserve a base. Faça uma fase do backlog por vez e entregue alterações verificáveis.
- TypeScript strict; `pnpm`; Next.js App Router; PostgreSQL/Prisma 7; DDD-lite; Zod; Recharts; Docker Compose.
- Domínio sem dependências de framework; APIs finas; persistência no banco; UI com DTOs tipados.
- Não criar dados fictícios sem carimbo. Litros monitorados não são litros economizados. Verificação sanitária é humana.
- Não remover/resetar banco, reescrever repositório ou publicar segredos sem autorização.
- `iframe` V3 é alvo de migração para React nativo, **não** framework definitivo.
- Regra e hardware devem ser calibrados; não anunciar microvazamentos ou precisão sem testes.
- Dar feedback de testes PASSOU/FALHOU/NÃO EXECUTADO; nunca inventar resultado.
- Priorizar P0 e protótipo demonstrável para 6–7 de novembro de 2026.

## Ao terminar uma etapa
Relate: arquivos modificados, resumo do diff, contratos/migrações, comandos executados e resultados, como demonstrar, riscos conhecidos, o que falta. Se faltar acesso a uma ferramenta/dependência, não apresente a etapa como validada.

## Atualização 07/11/2026 — plateia QR + IoT (develop, NÃO main)
Leia ANTES de atuar: docs/entrega/PLATEIA_QR_IOT_HANDOFF_2026-11-07.md.
- /plateia e /api/plateia/stream são públicos e SOMENTE leitura; /convite é protegido. Nunca enviar eventos privados brutos.
- 70 visitantes é alvo de teste, não capacidade comprovada. Limite de código: 110 SSE por processo. Ensaio: scripts/plateia-carga.mjs.
- Gatilho balança MQTT: 1,5 kg por 6s, célula nominal 5 kg, calibrar/tarar carga TOTAL.
- Temperatura/umidade/peso no BI e plateia são eventos EFÊMEROS, sem histórico. Lotes só PENDING_REVIEW.
- QR SVG contém a URL http://187.77.229.205:8090/plateia; ao trocar host regerar SVG e editar convite no mesmo commit.
- Nenhum build, teste físico ou carga de 70 clientes foi validado nesta sessão; main intacta.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## RICHARDS Assist (PR de 07/11)

Leia `docs/assistente/HANDOFF_CLAUDE.md` antes de alterar o assistente. `/assistente` e `/api/assistant/*` são privados; nunca liberar para o QR/plateia. Ferramentas OpenAI são somente leitura; não oferecer shell/SQL/HTTP arbitrário ou mutadores de operação. Notificações são determinísticas e independentes da IA, com fila persistida e entrega pelo menos uma vez. Credenciais ficam somente no ambiente. Nenhuma validação de API externa/hardware/deploy foi feita; Claude conclui a ativação com Ricardo.
