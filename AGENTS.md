# RICHARDS — regras atuais (pivô hídrico 07/11/2026)

Leia `MEMORIA.md`, `docs/agua/ESCOPO.md` e `docs/agua/HANDOFF_CLAUDE.md` antes de editar.

- Escopo atual: exclusivamente água, vazão, instalação mapeada, investigação e relatório. Documentos antigos são históricos e não devem reintroduzir jornadas retiradas.
- Preservar monólito modular Next.js/TypeScript strict, pnpm, Prisma/PostgreSQL, DDD-lite, SSE e Three.js do cano industrial. APIs finas e auditoria na mesma transação.
- PRs com destino develop. Não alterar main/VPS/deploy sem aprovação de Ricardo; não usar force push.
- Não apagar dados ou reescrever migrations existentes. Tabelas/enums e alguns codecs legados permanecem por preservação do histórico. Código retirado em archive/ é texto não executável e não entra no ZIP.
- Planta é esquema sem escala, não projeto executivo nem simulação de pressão. Um medidor só vincula um ponto da mesma unidade. Sem vínculo, sem leitura; nunca distribuir o sinal de um único medidor por cômodos não instrumentados.
- Medidores em série podem sobrepor volume. Não tratá-los como consumos independentes nem prometer economia, vazamento ou calibração comprovados.
- DEVICE/SIMULATED explícitos. Movimento depende de dado recente, tem pausa, SVG 2D e prefers-reduced-motion. Preservar controle de performance do Three.js.
- Mapa tem versão e bloqueio de concorrência. Migração aditiva requer homologação; o startup padrão aplica migrations mesmo sem abrir a página.
- Relatar resultados reais de comandos, limites e pendências. Software não aprova hardware, projetor, celular físico ou capacidade de público.
- O deck anterior foi arquivado. Novo roteiro hídrico não equivale a apresentação visual aprovada.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
