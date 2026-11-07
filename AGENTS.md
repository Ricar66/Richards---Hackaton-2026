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

## Handoff 07/11/2026 — Água em escolas, auditoria de uso e doações sanitárias (somente develop)
- Guia normativo, hipóteses e limitações: `docs/ESCOLAS_AGUA_E_DOACOES_LEGAIS.md`.
- Nova API GET `/api/monitoring/fixture-activity`: janela fixa 72h, somente telemetria física `DEVICE`, cobertura temporal verificada e sensor fisicamente online. Simulado nunca entra na análise.
- A ausência de fluxo só pode sugerir inspeção após confirmação HUMANA de sensor exclusivo/calibrado e de uso esperado; nem fluxo nem ausência diagnosticam entupimento.
- Nova API POST `/api/monitoring/fixture-inspections`: operador solicita vistoria `MANUAL`, backend recalcula dados, registra auditoria e bloqueia duplicata ativa. É uma ação humana, não um alarme automático.
- `/monitoramento`, `/dispositivos` e centro de controle destacam o caso de escolas. Volume noturno e custo estimado são observação/cenário, não vazamento ou economia comprovados.
- Doações: a API exige origem do alimento, checklist sanitário, responsável e cargo/habilitação declarada. Lotes de buffet exposto seguem bloqueados no MVP por cautela; a lei não estabelece proibição universal.
- Testes criados em `tests/fixture-activity.test.ts`, `tests/integration/fixture-activity.test.ts`, `tests/integration/fixture-inspection.test.ts` e alterações anteriores de doações. Necessário rodar `pnpm test`, `pnpm test:integration`, `pnpm typecheck` e `pnpm build` em checkout real. **Ainda não executados por esta sessão**.
- Nunca fazer merge para `main` ou publicar no VPS sem revisão, ensaio físico, evidência e aprovação.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## RICHARDS Assist (PR de 07/11)

Leia `docs/assistente/HANDOFF_CLAUDE.md` antes de alterar o assistente. `/assistente` e `/api/assistant/*` são privados; nunca liberar para o QR/plateia. Ferramentas OpenAI são somente leitura; não oferecer shell/SQL/HTTP arbitrário ou mutadores de operação. Notificações são determinísticas e independentes da IA, com fila persistida e entrega pelo menos uma vez. Credenciais ficam somente no ambiente. Nenhuma validação de API externa/hardware/deploy foi feita; Claude conclui a ativação com Ricardo.

## Revisão de 3D/mobile (PR 07/11)

Leia `docs/entrega/3D_MOBILE_HANDOFF_2026-11-07.md` antes de continuar. A Sala tenta 3D automaticamente com fallback, amplia sem duplicar canvas e muda para cartões com rolagem no celular. Shader nunca usa tempo independente para inventar fluxo. Aceite visual/browser/aparelhos/projetor ainda NÃO executado; não anunciar responsividade universal ou FPS com base no build. Preservar `?3d=0`, SVG acessível, movimento reduzido e orçamento adaptativo. Não publicar main/VPS automaticamente.

## RICHARDS Circular (PR incremental de 07/11)

Leia `docs/circular/HANDOFF_CLAUDE.md` e `docs/circular/README.md`. Recurso privado, `CIRCULAR_ENABLED=false`, migration aditiva. Conservação de massa e origem MANUAL/SIMULATED são obrigatórias; coleta não comprova tratamento. Candidato à doação só PENDING_REVIEW. Não apagar/estornar documentos ou movimentações manualmente. Telegram do Circular ainda não implementado. Ensaio de software não aprova operador, legislação aplicável ou destinação física. Main/VPS dependem da aprovação de Ricardo.
