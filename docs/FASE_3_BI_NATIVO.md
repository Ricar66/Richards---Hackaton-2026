# Fase 3 — BI nativo, filtros na URL e investigação

**Data:** 03/11/2026. **Branch:** `feat/fase-3-bi-nativo`. **Base:** Fase 2 (`docs/FASE_2_IOT_OCORRENCIAS.md`).

## Resultado

| Verificação | Resultado |
|---|---|
| `pnpm typecheck`, `pnpm lint`, `pnpm build` | PASSOU (lint sem avisos) |
| `pnpm test` (unitários) | PASSOU 22/22 (6 novos de filtro/fuso, 1 novo de doação) |
| `pnpm test:integration` (Postgres real, `richards_test`) | PASSOU 37/37 (5 novos de dashboard: T40–T44) |
| `pnpm test:e2e --with-db-outage` (Chrome headless, instância isolada :3100 + banco de teste) | PASSOU 30/30; resultado final da rodada em `docs/FASE_5_PDF_QA_DEMO.md` |
| Responsividade 375 / 768 / 1440 nas 6 telas | PASSOU: nenhuma tela com rolagem horizontal |
| Paleta de estados (daltonismo) | PASSOU no validador da skill dataviz: ΔE ≥ 21 entre vizinhas, contraste ≥ 3:1 |

## O que mudou

### O V3 saiu do iframe
O BI agora é React nativo, com seis telas (`src/app/(bi)/`) e um shell persistente (`src/components/bi/shell.tsx`):

| Rota | Tela |
|---|---|
| `/` | Centro de controle |
| `/monitoramento` | Monitoramento hídrico |
| `/ocorrencias` | Central de ocorrências |
| `/doacoes` | Doações & impacto (Fase 4) |
| `/relatorios` | Relatórios (Fase 5) |
| `/dispositivos` | Dispositivos IoT |

- A identidade do V3 foi mantida: navegação escura, canvas claro, verde-petróleo e Plus Jakarta Sans (agora empacotada no build via `next/font`, junto com a Inter).
- O BI V3 em iframe segue em `/intelligence` como **contingência** para o dia da apresentação. A rota da V2 (`/operacao`) redireciona para `/`.
- Saíram: `workspace-v2.tsx`, `charts.tsx`, o drawer antigo e as rotas `[section]`.

### Um filtro, um serviço
- `analytics-filter.ts` (domínio puro):
  - aceita `range=24h|7d|30d` ou `from`/`to` (até 92 dias);
  - aceita `siteId`, `deviceId` e `source`;
  - agrega por 15 min, 1 h ou 1 dia, alinhando os intervalos no **fuso de São Paulo**;
  - o fim no futuro vira "agora";
  - ids inválidos são recusados antes de qualquer consulta (`INVALID_FILTER`).
- `get-dashboard.ts`: tudo agregado no PostgreSQL, a partir do mesmo filtro que a URL, a API e o PDF usam.
  - Intervalo sem leitura = `null` (lacuna no gráfico), nunca 0.
  - Período sem leitura = "sem dados" no KPI.
  - O intervalo em andamento vem marcado como parcial.
  - A linha fixa de "referência 120 L" do V2 saiu (era ilustrativa).
- Comparação com o período anterior só aparece com cobertura parecida (`previousSamples`). Hoje o seed tem 7 dias, então "7 dias anteriores" mostra **"sem base de comparação"** em vez de "+4.895%".

### Interações
- **Filtros globais na URL**: a investigação pode ser compartilhada (botão "copiar link"). Trocar o filtro mantém o quadro anterior esmaecido, sem piscar esqueleto.
- **Gráfico de volume** (`charts.tsx`):
  - tooltip com valor, leituras, vazão máxima e ocorrências do intervalo;
  - régua de zoom (brush);
  - marcadores de ocorrência por severidade, que abrem a ocorrência;
  - **clique em qualquer ponto** abre a gaveta do intervalo (`/api/analytics/interval`), com as leituras e as ocorrências ligadas *por registro* (abertura ou janela de evidência). Sem ligação, ela diz isso.
- **Volume e vazão separados** em `/monitoramento`: dois gráficos sincronizados, nunca dois eixos no mesmo gráfico. O de vazão tem a linha do limiar da regra e faixas das janelas de evidência.
- **Mapa de calor** dia × hora (Brasília). A faixa da madrugada fica destacada; célula sem leitura aparece hachurada, não clara.
- **Sinal ao vivo**:
  - `/api/analytics/live` é consultado a cada 5 s;
  - um indicador no topo mostra "Sinal do sensor/simulado · X L/min · há N s" ou "Sem sinal novo";
  - quando surge ocorrência nova com a tela aberta, aparece o aviso "Nova ocorrência · Investigar".
  - O texto diz "consulta a cada 5 s · não é streaming".
- **Gaveta da ocorrência**:
  - gráfico da evidência (janela da regra × depois da abertura × limiar);
  - timeline com autor;
  - ACK, resolver e descartar com nota;
  - o id vai para a URL (`?oc=`).
- **Tabela de ocorrências**: busca, chips de estado com contagem, severidade, ordenação e paginação.
- **Acessibilidade**:
  - toda gaveta tem `role="dialog"`, Escape fecha e o foco volta para quem abriu;
  - botão "Ver tabela" nos gráficos, para nenhum valor ficar só no tooltip;
  - link "pular para o conteúdo";
  - `prefers-reduced-motion` respeitado;
  - estados nunca só por cor.

### Honestidade dos dados na tela
- Carimbo **DADOS SIMULADOS / DADOS MISTOS / SEM LEITURAS** em toda tela com leituras não reais.
- Origem em cada tag de ocorrência e de lote.
- Rodapé com o horário, a contagem de leituras e "volume observado não é economia · ocorrência não é vazamento confirmado".
- Banco fora do ar:
  - o polling para;
  - aparece a faixa "números parados";
  - o indicador mostra "Servidor indisponível";
  - recarregar mostra o erro honesto dentro do shell (`(bi)/error.tsx`).

## Arquivos e justificativa
- `src/modules/analytics/domain/analytics-filter.ts` e `dashboard.ts`: contrato do filtro e do DTO (domínio puro, testável).
- `src/modules/analytics/application/get-dashboard.ts`, `get-interval.ts` e `get-live.ts`: as agregações no banco.
- `src/app/api/analytics/{dashboard,interval,live}/route.ts`: as rotas, com 422 / 503 honestos.
- `src/app/(bi)/*`:
  - `layout.tsx` (shell);
  - as seis telas;
  - `load.ts`, que manda o filtro inválido para um aviso amigável e o banco fora para o error boundary;
  - `loading.tsx` e `error.tsx`.
- `src/components/bi/*`:
  - `shell.tsx`, `filters.tsx`, `charts.tsx` e `primitives.tsx`;
  - as gavetas de ocorrência e de intervalo;
  - `hooks.ts`, com o polling e o relógio compartilhado sem problema de hidratação;
  - `labels.ts`, com a paleta validada;
  - as telas, em `views/`.
- `src/lib/format.ts`: formatos de data e hora no fuso fixo, "há N s" e duração.
- `src/app/globals.css`: o sistema visual novo (tokens em `:root`, responsivo em 1240/960/640 px, impressão).
- `tests/analytics-filter.test.ts` e `tests/integration/dashboard.test.ts`: os testes novos.

## Riscos e próximos passos
- **P0, o seed é horário**: em "24 h" com intervalos de 15 min, a maioria dos intervalos fica sem leitura (cobertura de 23%). Com o ESP32 ou o simulador enviando a cada 15 s, a série fica contínua. Na demo, comece em **7 dias**.
- **P1, gráfico durante o polling**: o gráfico reanima ao receber dados novos. Sem impacto funcional; dá para desligar a animação depois da primeira carga.
- **P1, multiunidade**: o filtro de unidade só aparece com mais de uma unidade. O tenant segue fixo (`DEMO_ORG_ID`).
- **P2, retenção**: não há endpoint `/api/occurrences` paginado no servidor. A tabela pagina no navegador até 300 ocorrências do recorte, o que é suficiente para o hackathon.
