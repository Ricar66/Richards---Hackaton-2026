# Fase 5 — PDF, QA e demonstração

**Data:** 03/11/2026. **Branch:** `feat/fase-5-pdf-qa-demo`. **Base:** Fases 3 e 4.

## Resultado

| Verificação | Resultado |
|---|---|
| `pnpm typecheck`, `pnpm lint`, `pnpm build` | PASSOU (lint sem avisos) |
| `pnpm test` (unitários) | PASSOU 22/22 |
| `pnpm test:integration` | PASSOU 37/37 |
| T47: PDF imprime **as mesmas strings** dos 6 números da prévia do BI para o mesmo filtro | PASSOU |
| T48: recorte simulado carimbado; período sem leitura mostra "sem dados", não "0 L" | PASSOU |
| T49: rota do PDF com filtro inválido → 422; válido → A4 retrato de 2 páginas, `richards-relatorio-AAAA-MM-DD.pdf` (data de Brasília) | PASSOU |
| `pnpm test:e2e --with-db-outage` (jornadas A, B e C, responsividade, banco fora) | PASSOU 30/30 |
| PDF aberto no visualizador do Chrome (2 páginas, sem texto cortado nos números) | PASSOU (conferido em captura) |
| Firmware compilado para ESP32 | **NÃO EXECUTADO** (download do toolchain bloqueado nesta sessão; ver Fase 2) |
| ESP32 físico | **NÃO EXECUTADO** (sem placa) |
| Leitor de tela real (NVDA/VoiceOver) | **NÃO EXECUTADO**: foram verificados `role`/`aria`, foco e teclado, não um leitor de tela |

## PDF (`src/modules/reports/application/build-report-pdf.ts`)
- **Fonte dos números**: o PDF é montado a partir do **mesmo `DashboardDTO`** do BI (`getDashboard` + filtro da URL). Os números-resumo vêm de `reportFigures()`, a mesma função que preenche a prévia em `/relatorios`.
- **Página 1**:
  - período, recorte e o carimbo de origem (DADOS DE DEMONSTRAÇÃO / MISTOS / DISPOSITIVO / SEM LEITURAS);
  - os 6 indicadores;
  - o gráfico de barras por intervalo (lacuna sem barra, intervalo em andamento claro, ponto vermelho onde abriu ocorrência);
  - os dispositivos com último contato e leituras;
  - a nota metodológica.
- **Página 2**:
  - as ocorrências (ID, severidade, estado, abertura, resolução, origem);
  - as entregas confirmadas, com instituição e **quem recebeu**;
  - o fluxo atual dos lotes;
  - proveniência e limites.
- **Rodapé**: versão do layout (`RICHARDS-R2`), data e "Página X de 2".
- **Segurança**:
  - o nome de usuário da Basic Auth **não** é impresso ("operador autenticado");
  - texto fora do WinAnsi é trocado por equivalente legível em vez de quebrar a geração;
  - campos longos são truncados com "…".
- **Na tela `/relatorios`**: prévia em formato de folha, conferência "BI × PDF" e botão "Gerar PDF deste recorte" com estado (gerando / nome, hora e tamanho / erro legível).

## E2E no repositório (`pnpm test:e2e`)
- `scripts/e2e/run.mjs`:
  - exige `pnpm build`;
  - recusa banco sem sufixo `_test` e porta ocupada;
  - limpa e semeia o `richards_test`;
  - sobe `next start` em :3100 apontado para ele;
  - roda `scripts/e2e/journeys.mjs`;
  - derruba a instância;
  - salva as capturas em `.e2e/` (ignorado no Git).
- `--with-db-outage` para o container `db` por alguns segundos, para provar o erro honesto. É opcional, porque o banco de dev compartilha o container.
- **Dependência nova: `puppeteer-core@24.43.1` (dev).**
  - Por quê: as jornadas precisam rodar em navegador real e a equipe precisa repetir isso antes do pitch.
  - Tamanho: ~11 MB em `node_modules`, **sem baixar navegador**; usa o Chrome ou o Edge instalado (`CHROME_PATH` para outro).
  - Alternativa descartada: Playwright, que baixa os próprios navegadores (centenas de MB).

## Matriz de QA executada

| Item | Como | Resultado |
|---|---|---|
| Filtros mudam todos os números, ficam na URL e são compartilháveis | E2E A2 | PASSOU |
| Recorte sem leitura mostra "sem dados", nunca zero | T40, T48, E2E A2 | PASSOU |
| Teclado: Enter abre a gaveta, Escape fecha, foco volta | E2E A3 | PASSOU |
| Ação persiste e o KPI muda sem recarregar | E2E A4, B5 | PASSOU |
| ESP32 (simulador com o mesmo protocolo) → regra → aviso na tela em ≤ 5 s | E2E A5 | PASSOU |
| Clique no gráfico → leituras + ocorrência ligada por registro | E2E A6, T44 | PASSOU |
| Doação ponta a ponta com declarações obrigatórias | E2E B1–B5, T45 | PASSOU |
| PDF = BI | T47, E2E C1 | PASSOU |
| 375 / 768 / 1440 px sem rolagem horizontal (6 telas) | E2E R | PASSOU |
| Banco cai com a tela aberta / recarregar sem banco / banco volta | E2E E1–E3, T25 | PASSOU |
| Nenhum erro de JavaScript durante as jornadas | E2E | PASSOU |

## Roteiro de apresentação
Ver `docs/ROTEIRO_DEMO.md`: preparação, cliques exatos, falas por integrante e planos de contingência.

## Riscos e próximos passos
- **P0, firmware**: compilar e gravar o ESP32 na Arduino IDE (equipe de IoT) e rodar o roteiro com a placa real **antes** do dia 6. Até lá, a demonstração de sensor real **não está validada**.
- **P0, ensaio**: ensaiar 3 vezes com cronômetro (`docs/plano/13_PITCH_JORNADA_DEMO.md`).
- **P1, Basic Auth de laboratório**: aceitável na rede do evento, nunca em internet aberta (regra 8). Sessão real e RBAC ficam para a Fase 6.
- **P2, PDF com muitas ocorrências**: lista as 14 primeiras e indica quantas faltam (a lista completa fica no BI).
