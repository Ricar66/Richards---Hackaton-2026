# MEMÓRIA DO PROJETO — RICHARDS Intelligence

> **Leia isto primeiro.** É o estado completo do projeto: o que é, onde está cada coisa, como rodar, o que foi decidido, o que falta e o que já deu errado.
> Atualizado em **03/11/2026**. Este arquivo **não contém senhas nem chaves**: elas ficam só no `.env` local, que nunca vai para o git.

---

## 1. O que é

**RICHARDS Intelligence** é um protótipo para o **Hackathon Senac Ribeirão Preto, 6 e 7 de novembro de 2026**. O nome homenageia Ellen Swallow Richards. **Nunca chamar o produto de SALVA**, que foi o nome antigo.

A equipe tem 4 pessoas: 2 de desenvolvimento e 2 de IoT. Duas jornadas:

- **A · Água:** sensor de vazão (ESP32 + YF-S201) → API → ocorrência *suspeita* de fluxo contínuo → operador investiga e resolve → BI e PDF.
- **B · Alimentos:** lote de excedente → verificação humana documentada → reserva para instituição → entrega confirmada com nome de quem recebeu → impacto em kg.

Tese do pitch: *"o dado revela o desvio; a inteligência está em descobrir o que aconteceu depois"*. Rastreabilidade honesta, nunca número inventado.

## 2. Onde está tudo

| O quê | Onde |
|---|---|
| Código (máquina de desenvolvimento) | `E:\CraftOps\apps\web\richards-platform`, no HD externo `E:` |
| GitHub (público) | https://github.com/Ricar66/Richards---Hackaton-2026, branch `main` |
| Demo rodando | http://localhost:3000, com o container `web` do `docker compose` |
| Usuário, senha e chave do sensor | Só no `.env` local. Ver a seção 7 |
| Pacote original recebido (V4, intocado) | `Downloads\RICHARDS_PROJETO_INICIO_COMPLETO_V4_2026` (pasta e `.zip`) |
| Plano e prompt mestre | `docs/plano/` (`16_PROMPT_MESTRE.md` traz as regras invioláveis) |
| Registro de cada fase | `docs/FASE_0_BASELINE.md` … `docs/FASE_5_PDF_QA_DEMO.md` |
| Roteiro de palco (cliques e falas) | `docs/ROTEIRO_DEMO.md` |
| Dicionário de dados, MER e DER | `docs/dados/`, explicado em `docs/dados/README.md` |
| Contrato do ESP32 | `docs/CONTRATO_IOT.md` |
| Firmware | `iot/esp32_richards/esp32_richards.ino` + `secrets.h.example` |

## 3. Regras invioláveis (do prompt mestre)

1. **Nada de número inventado.** Dado de demonstração é carimbado como `SIMULATED` no banco, na API, na UI e no PDF.
2. **Litros observados ≠ litros economizados. "Suspeito de vazamento" ≠ vazamento comprovado.**
3. Fluxo persistente é avaliado com limiar e tempo configuráveis por dispositivo (`minFlowLpm`, `continuousSeconds`).
4. Leitura é idempotente por `(deviceId, bootId, sequence)`.
5. No máximo **uma ocorrência ativa (OPEN/ACKNOWLEDGED) por dispositivo e tipo**.
6. Lote só fica **AVAILABLE** com verificação humana documentada e só fica **DELIVERED** com quem recebeu.
7. Toda ação persistente tem autorização, transação e auditoria.
8. Segredo nunca vai para o navegador. Basic Auth e HTTP de laboratório não vão para produção.
9. **Nunca** rodar `prisma migrate reset`, `db push --force-reset`, exclusões amplas ou qualquer comando que apague dados sem autorização expressa.
10. Não inventar logs, builds ou resultados de teste. Relatar como **PASSOU / FALHOU / NÃO EXECUTADO**.
11. Não adicionar dependência sem justificar benefício, tamanho e compatibilidade.
12. Nunca commitar `.env`, `secrets.h` ou credenciais. Não reescrever o app do zero.

## 4. Combinados de trabalho (para quem continuar, inclusive IA)

- **Sempre em português**: respostas, avisos de progresso e documentos.
- O responsável deu **autorização ampla** para avançar sem perguntar a cada passo. Isso **não** vale para apagar dados ou expor segredos.
- Trabalhar e revisar direto, **sem subagentes** (pedido explícito).
- Cada entrega termina com: arquivos alterados e por quê, testes classificados, riscos e próximos passos (P0/P1/P2).
- Commits pequenos no `main`, mensagem em português descrevendo o porquê. O push para o GitHub usa a conta dona do repositório (Ricar66).

## 5. Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · pnpm 10.16.1 · PostgreSQL 16 · Prisma 7.10 (adapter-pg, client gerado em `src/generated/prisma`) · Tailwind 4 · Recharts 2.15 · Zod 4 · pdf-lib · Docker Compose · ESP32 (Arduino).

Dependência só de desenvolvimento: `puppeteer-core` 24.43.1, para o E2E. Usa o Chrome instalado e não baixa navegador.

## 6. Mapa do código

| Pasta | Conteúdo |
|---|---|
| `src/app/(bi)/` | BI nativo: `/`, `/monitoramento`, `/ocorrencias`, `/doacoes`, `/relatorios`, `/dispositivos`, com layout persistente (`BiShell`) |
| `src/app/api/` | APIs: `iot/telemetry`, `analytics/{dashboard,interval,live,overview}`, `occurrences`, `donations`, `recipients`, `reports/summary`, `admin/simulate`, `health` |
| `src/app/intelligence/` | BI V3 antigo em iframe, só **contingência**. Tem o botão "← Voltar ao BI" |
| `src/components/bi/` | Shell, filtros, gráficos, gavetas (ocorrência, intervalo, doação), primitivas e telas em `views/` |
| `src/modules/analytics/` | Filtro na URL (`analytics-filter.ts`), `getDashboard` (agregação no fuso de São Paulo), `getInterval`, `getLive`, `reportFigures` |
| `src/modules/monitoring/` | Ingestão de telemetria, regra de fluxo (`FlowAlertPolicy`), abertura de ocorrência com advisory lock, transições e conectividade |
| `src/modules/donations/` | Fluxo do lote (`DonationWorkflow`) e serviço com guarda otimista + auditoria |
| `src/modules/reports/` | PDF (`buildReportPdf`, 2 páginas A4) sobre o mesmo DTO do BI |
| `src/proxy.ts` | Basic Auth do operador; define o autor (`x-richards-actor`) e descarta o valor vindo do cliente |
| `prisma/` | `schema.prisma`, 3 migrations e `seed.ts` (idempotente, tudo `SIMULATED`) |
| `iot/esp32_richards/` | Firmware: fila de 12, retentativa com a mesma `sequence`, NTP, 401 espera 30 s |
| `scripts/` | `iot-simulator.mjs` (se comporta como o firmware), `e2e/` (jornadas no Chrome), `test-db-prepare.mjs`, `docs/` (geradores do dicionário e dos diagramas) |
| `tests/` | Unitários (`*.test.ts`) e integração no Postgres (`integration/`) |

## 7. Como rodar

```bash
# Demo (build de produção; aplica migrations e seed a cada start)
docker compose up -d --build           # http://localhost:3000 · saúde em /api/health
docker compose down                    # para SEM apagar dados (nunca usar -v)

# Desenvolvimento
pnpm install && pnpm db:generate && pnpm db:deploy && pnpm db:seed
pnpm dev

# Verificação
pnpm typecheck && pnpm lint && pnpm build
pnpm test                              # unitários, sem banco
pnpm test:integration                  # banco richards_test (nome precisa terminar em _test)
pnpm test:e2e                          # Chrome em :3100 no banco de teste; --with-db-outage derruba o banco por segundos

# Simulador do sensor (contingência no palco)
pnpm simulate --scenario leak --samples 14 --interval 4

# Documentação de dados
node scripts/docs/render-diagramas.mjs     # MER/DER → PNG, SVG e PDF (precisa de internet, Mermaid 11.12.0 via CDN)
python scripts/docs/dicionario_de_dados.py # dicionário em Excel (depois abrir no Excel e salvar para gravar as fórmulas)
```

**Acesso e credenciais** ficam no `.env` local, a partir do `.env.example`:
- `RICHARDS_OPERATOR_USER` e `RICHARDS_OPERATOR_PASSWORD`: login do BI (HTTP Basic de laboratório).
- `IOT_DEMO_DEVICE_KEY`: chave do sensor. Precisa ser igual à `RICHARDS_DEVICE_KEY` do `secrets.h` do ESP32.
- `POSTGRES_PASSWORD`, `DATABASE_URL` e `TEST_DATABASE_URL`: banco.

**Para trocar:**
1. Edite o `.env`.
2. Rode `docker compose up -d web`.
3. Se trocou a chave do sensor, rode também `pnpm db:seed`, que regrava só o hash, sem apagar nada. Depois atualize o `secrets.h` e grave o ESP32 de novo.

## 8. Estado por fase

| Fase | Commit | O que entregou |
|---|---|---|
| V3 original | `de7c41f` | Importação do kit V4 como recebido |
| 0 · Baseline | `c61e93c` | Instalação, Prisma, typecheck, lint, build e Docker verdes |
| 1 · Banco e contratos | `659344c` | Dados honestos, telemetria sem condição de corrida, auditoria, migrations versionadas |
| 2 · IoT e ocorrências | `d7809da` | Evidência real da ocorrência, conectividade calculada pelo último contato, simulador igual ao firmware |
| 3 e 4 · BI nativo e doações | `1ca4f63` | BI React com 6 telas, filtros na URL, gráficos sincronizados, mapa de calor e sinal ao vivo; doação com checklist, instituição, recebedor e motivo de cancelamento |
| 5 · PDF, QA e demo | `f999d81`, `f4a1a94` | PDF com os mesmos filtros e números do BI, E2E no repositório, roteiro de palco, favicon |
| Ajustes visuais | `f44dc3f`, `7aa9ba2` | Ponto de status no lugar de bordas coloridas; botão de volta na tela do V3; lint ignora `.e2e/` |
| Modelo de dados | `7cc89d1` | Dicionário em Excel (7 abas), MER (Chen) e DER (pé de galinha), conferidos contra o banco |

As branches `feat/fase-*` existem só na máquina de desenvolvimento e já estão incorporadas ao `main`.

## 9. Testes (últimos resultados reais)

| Verificação | Resultado | Data |
|---|---|---|
| typecheck, lint e build | PASSOU | 03/11/2026 |
| `pnpm test` (unitários) | PASSOU 22/22 | 03/11/2026 |
| `pnpm test:integration` (Postgres real) | PASSOU 37/37 | 03/11/2026 |
| `pnpm test:e2e --with-db-outage` | PASSOU 30/30 | 03/11/2026 (Fase 5) |
| `pnpm test:e2e` (sem queda de banco) | PASSOU 26/26 | 03/11/2026 (depois dos ajustes visuais) |
| Dicionário × banco (colunas, tipos, nulos, padrões, ordem, enums, FKs, índices) | PASSOU, 0 divergências | 03/11/2026 |
| Compilação do firmware | **NÃO EXECUTADO** (download do arduino-cli bloqueado) | — |
| ESP32 físico com a plataforma | **NÃO EXECUTADO** (sem placa) | — |
| Leitor de tela real | **NÃO EXECUTADO** (só teclado e atributos ARIA conferidos) | — |

## 10. Decisões tomadas, e por quê

**Interface e BI**
- **O BI é React nativo; o V3 em iframe virou contingência** (`/intelligence`). O iframe não compartilhava filtros, estado nem acessibilidade.
- **O filtro mora na URL**, para a investigação ser compartilhável. O mesmo objeto alimenta o dashboard, o detalhe de intervalo e o PDF, então os números são iguais por construção.
- **Volume e vazão ficam em gráficos separados**, nunca com dois eixos Y.
- **Intervalo sem leitura aparece como "sem dados"**, nunca zero. A variação contra o período anterior só aparece se o período anterior tiver pelo menos 50% das amostras.
- **Conectividade é calculada pelo último contato** (mais de 120 s sem leitura = sem comunicação). `Device.state` só vale para MAINTENANCE.

**Regras de dados**
- **Uma ocorrência ativa por dispositivo**, garantida por `pg_advisory_xact_lock` + verificação na mesma transação. Não há constraint no banco.
- **Leitura simulada nunca sustenta alerta de leitura real**, nem o contrário: a regra só olha leituras da mesma origem.
- **Mudança de status usa guarda otimista**: atualiza só se o status ainda é o lido; senão responde conflito.
- **Kg entregues contam pela data de entrega** (`receivedAt`), não pela de cadastro.

**Ferramentas e documentação**
- **E2E com `puppeteer-core` em vez de Playwright**: usa o Chrome instalado e não baixa navegador. O Edge headless não funcionou.
- **Diagramas em Mermaid**, para serem editáveis e versionáveis. A versão 11.4.1 desenha seta em linha que deveria ser reta, por isso fixamos a 11.12.0.
- **O detector de design (impeccable) tem duas exceções registradas** em `.impeccable/config.json`:
  - a fonte Plus Jakarta Sans, herdada do V3;
  - a regra de aba lateral (`side-tab`) desligada no `globals.css`, por causa do trilho da linha do tempo.

## 11. Antes da demo (resumo; o passo a passo está em `docs/ROTEIRO_DEMO.md`)

1. `docker compose up -d --build` e conferir que `/api/health` responde `"database":"up"`.
2. **Resolver a ocorrência do seed "Fluxo contínuo fora de horário"** (`richards-oc-01`). Sem isso, o alerta ao vivo não abre, por causa da regra 5.
3. **O histórico do seed envelhece**: ele cobre de 27/10 a 03/11. No dia do evento, use o filtro **30 dias**. Recriar o banco da demo apaga dados e exige autorização.
4. ESP32:
   - `secrets.h` com a mesma chave do `.env`;
   - Wi-Fi do evento;
   - NTP sincronizado;
   - ver `POST 202` na serial.
5. Contingência: `pnpm simulate --scenario leak --samples 14 --interval 4`.

## 12. Pendências

**P0 (antes de 06/11)**
- Equipe de IoT: compilar e gravar o firmware na Arduino IDE e testar o ESP32 físico contra a plataforma.
- Ensaiar o pitch 3 vezes com cronômetro.
- Fazer a preparação da seção 11 na véspera.

**P1**
- A senha de acesso é de laboratório. Não expor a demo na internet aberta; trocar a senha depois do evento.
- A instituição não tem login próprio: quem confirma a entrega é o operador.

**P2 (depois do hackathon)**
- Fase 6, que hoje é só proposta.
- Missões (a tabela `Mission` existe, mas não tem tela nem API).

## 13. Ideias de melhoria (o banco já prevê)

1. **Login por usuário:** a tabela `User` e os papéis (`Role`) já existem. Substitui a senha única e mostra quem fez cada ação.
2. **Painel da instituição:** o papel `RECIPIENT` já existe. A própria instituição confirmaria o recebimento.
3. **Missões:** ocorrência ou lote vira tarefa de inspeção ou coleta com responsável.
4. **Modo projetor:** tela cheia, letras maiores e sem menu, para o palco.

## 14. Armadilhas conhecidas

**Servidor e banco**
- **Porta 3100 ocupada** por `next start` ou `next dev` órfão serve build antigo e a página trava no esqueleto. O `run.mjs` já recusa porta ocupada. Antes de rodar, veja com `Get-NetTCPConnection` (sem `-State`).
- **`next dev` acrescenta um bloco ao `AGENTS.md`.** Já está commitado; não remova.
- **`next dev` no Next 16 bloqueia origem fora de `localhost`.** Por isso o container usa build de produção.
- **O container roda em UTC.** Toda data exibida precisa de `timeZone: "America/Sao_Paulo"`.
- **`--with-db-outage` derruba o container compartilhado do banco** por alguns segundos.

**Testes e ferramentas**
- **`innerText` respeita `text-transform`.** Nos testes, compare texto sem diferenciar maiúsculas.
- **Captura `fullPage` reinicia a animação do Recharts.** O gráfico sai vazio na imagem, mas não é bug.
- **Fontes padrão do pdf-lib só têm WinAnsi.** Por isso existe `safe()` no gerador do PDF.
- **Planilha gerada pelo openpyxl não guarda o resultado das fórmulas.** Abra no Excel e salve. Não há LibreOffice na máquina.
- **Python dentro de heredoc no Bash come barra invertida.** Use um arquivo `.py`.
- **Git Bash converte `/` em caminho do Windows.** Use `MSYS_NO_PATHCONV=1` quando precisar.
