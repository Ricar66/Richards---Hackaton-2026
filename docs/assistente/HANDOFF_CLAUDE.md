# Handoff para Claude — RICHARDS Assist + Telegram

## Base e limite de autorização

Base inicial inspecionada: develop `449adfd52adcace88dc664d408e984f6937d949c`; main `477b2ca87c7a6f4f987a4b76999db5e390c9c85b`. Durante o trabalho, a equipe avançou ambas as branches. Integramos develop até `bd7bca15ac102d81da49a2c099ded883ddcd38f3`; a última consulta remota de main mostrou `f13cbc5ee4e66aa43e08039a752abe45e52af8ae`. Essas atualizações de main foram externas a este trabalho. Conferir novamente os HEADs antes de continuar.

Ricardo pediu implementação em PR para você concluir a ativação. Branch temporária de revisão: `feat/richards-assist-telegram`, alvo **develop**. Não promover para main, não fazer force push, não alterar VPS/Coolify, credenciais, banco real ou deploy sem autorização específica. Não há segredo neste PR.

Leia AGENTS.md, MEMORIA.md e o handoff anterior de plateia/IoT. O QR público e as leituras efêmeras permanecem separados do assistente privado. A balança física mantém mínimo configurável padrão 1,5 kg; cenários antigos virtuais de 6 kg não são orientação para a célula real de 5 kg.

## Mapa da implementação

| Área | Arquivos |
|---|---|
| Modelos/migração | `prisma/schema.prisma`, migration `20261107140000_assistant_telegram` |
| Contratos/prompt/conhecimento | `src/modules/assistant/domain/`, `application/answer.ts` |
| Ferramentas autorizadas | `application/tools.ts`: consultas ao BI, lista/evidência de ocorrência e guia; nenhum mutador |
| Uso/cotas | `application/usage.ts`: contadores atômicos persistidos, hashes de ator |
| Vínculo privado | `application/telegram-links.ts`: código temporário com hash; nenhuma entrada de chatId do navegador |
| Notificações | `application/notifications.ts`: scan persistente, dedupe, leases, retry e cancelamento de avisos obsoletos |
| Conversa e inbox | `application/telegram-inbox.ts`: offset transacional, cache da resposta para retentativa, comandos e contexto curto |
| Transporte | `infrastructure/telegram-api.ts`: HTTPS fixo, erro sanitizado; OpenAI usa fetch fixo em answer.ts |
| Worker | `src/assistant/run-assistant.ts`, `health.ts`: quatro loops, liderança por advisory lock |
| APIs privadas | `/api/assistant/chat`, `/api/assistant/telegram`; proxy conserva autenticação/CSRF |
| Interface | `/assistente`, `src/components/assistant/`; entrada no menu após Dispositivos |
| Configuração | `.env.example`, `compose.assistant.yml`, script `pnpm assistente` |
| Testes | `tests/assistant.test.ts`, `tests/integration/assistant.test.ts`, proxy e `scripts/assistant-smoke.mjs` |

## O que foi efetivamente validado

Em 07/11/2026, ambiente Node 24.22.1, pnpm 10.16.1:

- **PASSOU:** Prisma generate, migração aditiva aplicada em banco temporário `richards_assist_test`, PostgreSQL **18.6** isolado. Esse binário foi ferramenta local de teste fora do repositório, não dependência do app. O Compose do produto continua PostgreSQL 16; validar nessa versão também.
- **PASSOU:** 136 unitários (incluem 9 do assistente e proteção de rotas) com `node --import tsx --test tests/*.test.ts`.
- **PASSOU:** 109 testes de integração com Postgres real, `--test-concurrency=1`, incluindo 9 cenários do assistente. Foram testados pareamento concorrente/expirado, fila, claims simultâneos, retomada de lease, retry 429, offset/inbox, limite de uso, desligamento, fonte sem dados e isolamento entre organizações.
- **PASSOU:** typecheck, lint e build de produção Next 16.4.4.
- **PASSOU:** fumaça HTTP sobre `next start` e banco isolado: página/APIs negadas sem Basic, renderização autenticada, segredo marcador ausente no HTML/JSON, criação de link de teste sem chamada ao Telegram, IA desligada respondendo 503, CSRF 403, body excedido 413 e plateia pública 200.
- **NÃO EXECUTADO:** chamada OpenAI real, Telegram real, webhook/poller externo, entrega em celular, Docker/PostgreSQL 16, navegação interativa no Chromium, hardware e projetor. Não anunciar esses itens como aprovados.

Achados reais corrigidos:
1. Upsert vazio do Prisma podia falhar sob scan concorrente. A criação da fila agora é `createMany(skipDuplicates:true)` com constraint única no banco.
2. As correções concorrentes da equipe para estabilização da balança, timer SSE e triagem sanitária foram preservadas. Não há alterações deste PR no detector físico, stream público ou fixtures de bancada/realtime.
3. A primeira integração intermediária encontrou falhas nas fixtures antigas de doação após a triagem se tornar obrigatória; as correções já publicadas pela equipe foram incorporadas, e os 109 testes passaram. O guia do assistente acompanha a triagem estruturada e distingue estimativa de custo de economia comprovada.

## P0 que você deve concluir antes de ativar

- [ ] Conferir HEAD atual e rebase/merge seguro se develop avançou.
- [ ] Revisar migration e aplicar somente em homologação com backup; nunca resetar dados.
- [ ] Confirmar HTTPS no acesso ao BI e origens do proxy antes de colocar credenciais/assistente em rede pública.
- [ ] Ricardo configurar chave OpenAI e bot dedicado. Tokens só no ambiente, nunca no PR.
- [ ] Confirmar acesso ao modelo configurado. Começar com uma pergunta pequena; medir latência/tokens e conferir números contra o BI.
- [ ] Verificar `getMe`/username, ausência de webhook ou outro poller, levantar UM worker supervisionado.
- [ ] Vincular chat pelo painel; provar que outra pessoa sem código não acessa dados. Grupos devem continuar ignorados.
- [ ] Gerar ocorrência em ambiente SIMULATED de teste com opt-in explícito. Conferir UMA criação de fila, origem, horário e entrega real no Telegram. Nunca gerar evento fictício DEVICE no banco da demo.
- [ ] Assumir/resolver no BI e conferir os avisos; simular indisponibilidade/reinício do worker e checar retomada. Uma falha ambígua pode duplicar entrega: garantia é pelo menos uma vez.
- [ ] Testar `/status`, `/resumo`, conversa contextual, `/limpar` e `/parar`. Confirmar que o bot não tem mutadores de ocorrência/doação.
- [ ] Validar interação, acessibilidade e layout no navegador/celular; ensaiar a narrativa com o assistente como IA de explicação, sem alegar previsão ou economia comprovada.
- [ ] Adaptar o serviço opcional à configuração da VPS somente após autorização. Nenhum deploy foi feito neste trabalho.

## P1 após o ensaio

- Paginar mais de 100 assinaturas, política de retenção/expurgo de inbox/entregas/cotas e arquivamento auditável.
- Métricas de fila e alerta de worker parado por monitor externo; fallback de canal se Telegram estiver indisponível.
- Avaliação de fidelidade das respostas e testes de prompt injection com dados sintéticos; fontes executadas não garantem que cada frase esteja correta.
- Histórico persistente com política de privacidade adequada, RBAC/tenant completos e login de produção (o MVP ainda usa Basic único).
- Streaming de respostas é melhoria futura; as respostas atuais são completas e limitadas, com estado de carregamento.

## Comandos reproduzíveis

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm typecheck
pnpm lint
node --import tsx --test tests/*.test.ts
pnpm build
# Somente com TEST_DATABASE_URL apontando para banco *_test descartável:
pnpm test:integration
node scripts/assistant-smoke.mjs
```

O lançador padrão `tsx --test` tentou criar pipe IPC proibido neste ambiente. O loader `node --import tsx` executou a mesma suíte com sucesso. Não alterar versões nem permissões do ambiente só para contornar esse detalhe.
