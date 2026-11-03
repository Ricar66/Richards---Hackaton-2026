# Fase 4 — Doações e impacto

**Data:** 03/11/2026. **Branch:** `feat/fase-3-bi-nativo` (mesma branch da Fase 3: a tela nova de doações nasceu junto com o BI nativo).

## Resultado

| Verificação | Resultado |
|---|---|
| `pnpm test`: regras de etapa da doação | PASSOU |
| `pnpm test:integration`: T15–T19, concorrência, T43 (kg do período), T45 (instituição/recebedor/motivo), T46 (trilha) | PASSOU |
| Jornada B no navegador: cadastro → verificação com checklist → reserva com instituição → entrega com recebedor → KPI | PASSOU 5/5 |
| Migration `20261103140000_donation_receipt` aplicada no banco de dev (container) e no de teste | PASSOU: aditiva, 2 colunas anuláveis, nenhum dado alterado |

## Regras (domínio `donation-workflow.ts` + `donation-service.ts`)

| Etapa | Exige | Registro |
|---|---|---|
| `PENDING_REVIEW → AVAILABLE` | nome de quem verificou e checklist declarado na tela (inspeção visual, conservação, validade) | `safetyVerifiedBy/At`, auditoria com o checklist |
| `AVAILABLE → RESERVED` | **instituição ativa escolhida** (antes era fixa no código) | `recipientId` e nome da instituição na auditoria |
| `RESERVED → DELIVERED` | **nome de quem recebeu na instituição** | `receivedBy`, `receivedAt` |
| qualquer etapa aberta `→ CANCELLED` | motivo com 5 caracteres ou mais | `cancelReason` |

- Transições fora da tabela são recusadas (`INVALID_TRANSITION`), como já eram.
- Duas ações simultâneas no mesmo lote: só uma vence (guarda otimista).
- O software **não certifica segurança alimentar**. A tela diz isso no passo de verificação.
- **Kg entregues** soma só `DELIVERED` com `receivedAt` dentro do período do filtro.
- **Kg a caminho** (disponíveis + reservados) aparece separado e rotulado "ainda não é impacto".

## Tela `/doacoes`
- **KPIs**: kg entregues, kg a caminho, lotes aguardando verificação e instituições atendidas.
- **Quadro em quatro colunas**: pendente, disponível, reservado e entregue no período, cada uma com contagem e kg.
- **Gaveta do lote**: o formulário da etapa da vez, o cancelamento com motivo e a **trilha** da auditoria (quem fez, quando, o quê).
- **Cadastro de lote novo**: entra como verificação pendente, com origem MANUAL.

## Arquivos e justificativa
- `prisma/schema.prisma` e `prisma/migrations/20261103140000_donation_receipt/`: `receivedBy` e `cancelReason`, aditivos.
- `src/modules/donations/domain/donation-workflow.ts`: `assertDetails`, a declaração exigida por etapa.
- `src/modules/donations/application/donation-service.ts`:
  - transição com `recipientId` / `receivedBy` / `reason` / `note`;
  - `detail()` com a trilha;
  - `recipients()`.
- `src/app/api/donations/[id]/route.ts`: o GET do detalhe e o PATCH com o novo payload.
- `src/app/api/recipients/route.ts`: o endpoint novo.
- `prisma/seed.ts`: uma segunda instituição **fictícia** ("Cozinha Comunitária · Demonstração"), para mostrar a escolha. Lote entregue do seed ganha `receivedBy` só em banco novo; banco existente não é alterado.
- `src/components/bi/views/donations.tsx` e `donation-drawer.tsx`: a tela.
- `tests/domain.test.ts` e `tests/integration/donations.test.ts`: os testes adaptados ao payload novo, mais T45 e T46.

## Riscos e próximos passos
- **P1, tenant**: a instituição receptora ainda não tem login próprio. Quem confirma a entrega é o operador, digitando o nome de quem recebeu. RBAC e perfil RECIPIENT ficam para a Fase 6.
- **P2, cadastro de instituições**: não existe tela para cadastrar instituições; hoje elas vêm do seed.
