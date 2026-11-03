# RICHARDS — regras para agentes de IA de programação

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
