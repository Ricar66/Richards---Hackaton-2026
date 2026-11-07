# Auditoria incremental de entrega — 06/11/2026

## Base confirmada no GitHub

- develop: `7666ec03c3f8edf05ef17835c0a17c0854b68414`.
- main: `477b2ca87c7a6f4f987a4b76999db5e390c9c85b`.
- Trabalho exclusivamente em develop. Nenhuma mudança em main, VPS, dados ou migrações.
- Contexto recuperado do chat “Ideia para o hackathon” e confrontado com os arquivos versionados. Resultados históricos não foram contabilizados como execução desta revisão.

## Diagnóstico e correções

1. A prévia original foi gerada com 213 arquivos. CRC passou, extração em pasta nova passou e 212 hashes conferiram. SHA256 da prévia original: `eb42f0d71368ceeae2a91cab65c7918feca1f68d4eb08ea3395c298200d455fe`.
2. O roteiro oficial ainda seguia os 14 SVGs. Agora segue as 10 imagens Full HD, quatro papéis e janela de demo de dois minutos, com meta total de 5min40. Ensaio humano ainda não executado.
3. Corrigidas referências ao seed fictício e à instituição operando um login inexistente. Não encenar entrega real para elevar KPI.
4. Gerador reforçado: valida formato PDF/PPTX, exige 10 slides PPTX, evidências não vazias no modo final, bloqueia caminhos Windows/inseguros, produz hash externo e preserva documentação relativa do código. Verificador independente confere cobertura exata do manifesto, CRC, hashes e extração. Templates `.env.example` e `secrets.h.example` são exemplos, não credenciais preenchidas.
5. Sala: botões acessíveis de pausa/3D/diagnóstico e modo efetivo visível, incluindo motivo de fallback. Nenhuma alteração em shaders, iluminação, geometria, regra, ingestão ou banco.
6. IoT: modelos vazios para calibração, telemetria, defeitos e organização das evidências. Firmware MQTT e diagrama físico continuam aguardando Victor.

## Revisão das telas por código

| Rota | Resultado da leitura | Validação visual interativa nesta sessão |
|---|---|---|
| `/` | KPIs e proveniência no DTO, filtros por URL, fila e gêmeo esquemático | NÃO EXECUTADA |
| `/monitoramento` | Volume/vazão separados, limiar e tabela de leituras | NÃO EXECUTADA |
| `/ocorrencias` | Busca, estados, origem, paginação e investigação | NÃO EXECUTADA |
| `/doacoes` | Fluxo com verificação humana, reserva e recebimento | NÃO EXECUTADA |
| `/dispositivos` | Último contato, regra e calibração configurada, sem firmware presumido | NÃO EXECUTADA |
| `/relatorios` | Prévia e PDF ligados ao mesmo serviço e filtro | NÃO EXECUTADA |
| `/ao-vivo` | SVG padrão, 3D sob demanda, pausa e controle de desempenho preservados | Bloqueada ao iniciar Chromium |

A cena usa materiais físicos, ambiente gerado localmente, shader de água guiado pela vazão, DPR limitado e fallback por desempenho. Não foi possível medir FPS/GPU nesta sessão. O teste antigo em GPU Intel permanece evidência histórica, não validação dos controles novos.

## Execuções desta revisão

| Verificação | Estado e evidência |
|---|---|
| Instalação congelada com pnpm 10.16.1 | PASSOU; lockfile sem alteração |
| Prisma generate | PASSOU |
| Build produção | PASSOU, Next 16.4.4 |
| Typecheck e lint | PASSOU |
| Unitários da base | PASSOU 112/112 via `node --import tsx --test tests/*.test.ts` |
| Controles da Sala (renderização React no servidor) | PASSOU 2/2; ausência de banco/atalhos e fallback de movimento reduzido |
| Empacotamento | PASSOU 6/6 via unittest Python |
| PDF/PPTX | 10 páginas/slides, proporção 16:9; estrutura e renderizações conferidas. Artes identificadas como conceituais. Não abertos no PowerPoint nativo |
| Chromium interativo | NÃO EXECUTADO: processo falha em `socket()`, EPERM; script `scripts/e2e/entrega-smoke.mjs` preparado |
| Integração PostgreSQL / Docker / broker | NÃO EXECUTADO: Docker e Postgres não disponíveis neste ambiente |
| Firmware compilado, ESP32 físico, calibração, projetor | NÃO EXECUTADO; aguardando equipamento/evidências |

O comando padrão `pnpm test` encontrou EPERM no pipe IPC do lançador tsx. A mesma suíte foi executada com o loader `node --import tsx`, sem alterar as regras do projeto. A primeira tentativa de instalação com o pnpm 11 do ambiente foi substituída pela versão 10.16.1 fixada no projeto.

## Fechamento ainda necessário

P0: receber firmware/diagrama/evidências do Victor, executar integração e E2E no ambiente da equipe, testar controles e enquadramento no projetor, ensaiar quatro pessoas e revisar os exports. Depois de aprovado, promover develop para main mediante autorização e gerar `--final` com os materiais aprovados. A prévia entregue não representa aprovação física nem versão implantada.

P1: instalação do ZIP em máquina limpa, revisão de todas as evidências para remover credenciais/dados pessoais e riscos HTTP/MQTT já registrados. Nenhuma mudança de infraestrutura nesta revisão.
