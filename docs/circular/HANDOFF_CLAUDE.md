# Handoff — RICHARDS Circular, 07/11/2026

## Entrega e limites de autorização

MVP implementado para revisão em PR com destino **develop**, sobre `95511dea10da1e1c353b87b203c59f2ffcf656c6`. HEAD remoto de main conferido antes da entrega: `07b92f41ef0a4bb313c57fe83ae3385c034724fc`. PR independente das melhorias 3D adicionais de instrumentos (#9). Nenhum acesso ao banco da operação, mudança em main, migração da VPS ou deploy foi executado. A aprovação de Ricardo continua necessária para main/VPS.

Implementados cadastro, triagem humana, candidato à doação pendente, cadastro/conferência/desativação de operador, compatibilidade, planejamento/coleta parcial, recebimento e destinação com anexos, indicadores, auditoria, isolamento de origem e versão/retentativa. `/circular` é privado e não vai para o QR. `CIRCULAR_ENABLED=false` por padrão. Lembretes/consulta do Circular no bot ficam para a próxima etapa; não anunciar como disponíveis.

Arquitetura, regras e contratos: [README do Circular](README.md). Não há dependência nova no package/lockfile.

## Migração

`prisma/migrations/20261107180000_circular/migration.sql` adiciona cinco enums, três tabelas, índices, FKs e CHECKs de massa/origem/arquivo. Não remove tabela ou dado existente. Relação com doação é opcional e única. Anexos são bytea; backups do banco passam a incluí-los.

**Antes de executar qualquer atualização do container**, revisar SQL e aplicar em homologação PostgreSQL 16 com cópia autorizada/sanitizada ou banco novo. O startup padrão aplica migrations independentemente de `CIRCULAR_ENABLED`. Flag desligada protege o uso, não evita a alteração de schema na implantação. Não executar `db:push`, reset, truncate ou migrações destrutivas no banco da operação. Não modificar a migration depois de aplicada; evolução com nova migration.

## Evidência de execução desta entrega

Ambiente isolado: Node 24.22.1, pnpm 10.16.1, Prisma 7.10.1, Next 16.4.4, PostgreSQL **18.6.0** empacotado para teste. PostgreSQL 16 do produto ainda requer ensaio. Banco `richards_circular_test`, porta local 55437; nenhum banco remoto acessado. Todo conteúdo dos testes é fictício/SIMULATED, nunca evidência física.

| Verificação | Resultado observado |
|---|---|
| `pnpm install --frozen-lockfile`, `pnpm db:generate` | PASSOU |
| `pnpm typecheck`, `pnpm lint`, `pnpm build` | PASSOU |
| `node --import tsx --test tests/*.test.ts` | PASSOU — 155 testes, nenhum ignorado |
| `node --import tsx --test --test-concurrency=1 tests/integration/*.test.ts`, TEST_DATABASE_URL isolada, migrations aplicadas | PASSOU — 126 testes, nenhum ignorado (10 novos do Circular) |
| `python -m unittest discover -s tests -p test_entrega.py` | PASSOU — 6 testes |
| `TEST_DATABASE_URL=..._test node scripts/circular-smoke.mjs` com Next build de produção e banco isolado | PASSOU — flag off/on, 401, ator forjado, CSRF 403, tamanho 413, filtro, fluxo, repetição e download SHA256 |
| PostgreSQL 16, navegador/mobile/teclado, VPS, operador/hardware/compostagem reais | NÃO EXECUTADO nesta entrega |
| Telegram Circular / IA Circular | NÃO IMPLEMENTADO, escopo posterior |

O comando `pnpm test` encontrou bloqueio do pipe IPC do CLI tsx neste executor (`EPERM`). A mesma suíte foi executada pelo loader `node --import tsx --test` com sucesso; não foi alegado sucesso do comando que falhou. O ensaio de integração usa o mesmo loader, concorrência 1 e migrations versionadas. Pacote PostgreSQL de teste ficou fora do repositório e não é dependência do produto. As mensagens de falha de CHECK/DB durante casos negativos são esperadas; resumo final da suíte: zero falhas.

O smoke HTTP **limpa somente banco de teste** usando helper protegido por sufixo `_test`; recusará URL comum ou porta já ocupada. Precisa de schema migrado, build pronto e PostgreSQL local em execução. Inicia dois Next sequenciais na porta 3187 (ou CIRCULAR_TEST_PORT), com credenciais de ensaio internas, IA/Telegram desligados. Não chamar apontando ao banco de operação.

## Aceite de Claude em homologação

- [ ] Rever diff e SQL aditivo; confirmar HEAD atual de develop antes de integrar. Preservar alterações concorrentes, inclusive #9 quando aplicável.
- [ ] Aplicar migration em PostgreSQL 16 isolado e executar as suítes, typecheck, lint, build e smoke HTTP. Revisar backup/restauração com documentos.
- [ ] Ativar flag apenas na homologação; usar `compose.circular.yml` opcional ou configuração equivalente **fora da VPS ativa** nesta fase. Confirmar modo Basic configurado.
- [ ] Abrir `/circular` em 1920×1080, 390×844 e 360×800; verificar campos de data, upload no celular, filtros, contraste, foco/teclado, ausência de rolagem horizontal e preferência de movimento reduzido. Layout possui breakpoints, mas não recebeu aceite visual nesta sessão.
- [ ] Usar **SIMULATED**. Cadastrar operador fictício com PLANT_ONLY/COMPOSTING; criar lote 5 kg, triar, planejar, coletar 3 kg, comprovar recebimento 2 kg e tratamento 1 kg: indicadores devem ser 5/3/2/1 com **4 kg sem comprovação final**. Quantidades sobrepostas são etapas, não somar tudo como impacto.
- [ ] Confirmar que coleta sem documento não comprova tratamento; anexos repetidos na mesma etapa não contam novamente; abrir duas abas e provocar conflito de versão. Botão “Atualizar lote” permite reler a versão corrente.
- [ ] Testar operador expirado/inativo, material/processo incompatível, excesso de massa e origem incerta. Conferência/reativação renova o cadastro com auditoria; não concede licença.
- [ ] Encaminhar candidato KITCHEN_UNSERVED para doação: um único lote PENDING_REVIEW, sem peso nos totais de resíduo, sem liberação sanitária automática. Origens BUFFET/PLATE/UNKNOWN bloqueadas nesse encaminhamento do MVP.
- [ ] Conferir download privado, bytes/hash e acesso sem senha negado. Não enviar anexos, responsáveis ou referências internas à plateia/Telegram.
- [ ] Escolher com Ricardo a unidade e o operador real; conferir documentação/enquadramento, segregação e comprovantes com responsável antes de usar MANUAL. Não chamar esse piloto de aprovado antes das evidências.

## Demonstração e apresentação

Sem alterar o deck oficial de dez imagens ou a duração do pitch. Se houver espaço no ensaio, reservar cerca de 20 segundos substituindo uma fala de evolução futura: mostrar o filtro **SIMULATED**, o saldo pendente e um anexo de ensaio, explicando “registramos a sobra, uma pessoa faz a triagem e acompanhamos a destinação por quantidade e documento”. Não anunciar redução de 50%, licença validada, tratamento real ou bot Circular em funcionamento.

## Evoluções deliberadamente pendentes

Não há importação automática da balança, certificação documental/antivírus, licença consultada em base pública, estorno/edição de movimentações concluídas, paginação além dos limites documentados, múltiplas organizações de login, nem lembretes do Circular no Telegram. Para o próximo PR do bot: ferramenta somente leitura + notificações determinísticas de coleta atrasada/recebimento/tratamento pendentes, origem explícita, deduplicação e reconsulta antes de enviar; nunca liberação automática ou anexos públicos. Não reutilizar exemplo de 5 kg como dado real.
