# RICHARDS Intelligence — especificação de BI premium

## Princípio visual
Parece um produto de analytics operacionais, não um template genérico de IA. **Densidade útil + hierarquia + resposta a cliques**. Marca RICHARDS como identidade de trabalho; fundo claro editorial, navegação de alta legibilidade, uma cor principal e cores semânticas de alerta. Nada de gradiente neon em todo card, emojis nos gráficos, glassmorphism gratuito, hero de marketing dentro de tela BI ou animações de números infinitas.

## Páginas e comportamento

### 1. Visão executiva `/overview` [P0]
- Header: "Inteligência de recursos", organização, unidade, intervalo, fonte, exportar.
- Barra de filtros globais sticky; range de datas, seletores de site/device e origem (`DEVICE`, `SIMULATED`, `MANUAL`, `TODAS`).
- KPIs: volume observado em L; alertas ativos; ocorrências resolvidas; entregas confirmadas em kg. Indicadores sempre com período, unidade e fonte.
- Principal visual: gráfico de consumo hídrico por intervalo (área + linha) com brush/zoom, linha de limiar, seleção crosshair; hover com tooltip detalhado.
- Bloco secundário: incidências por severidade/status; mini tabela últimas ocorrências; observabilidade do dispositivo.
- Rodapé de metadados: horário da última atualização, amostras, fonte, versão do relatório.

### 2. Monitoramento `/monitoramento` [P0]
- Série granular de vazão (L/min) e litros por intervalo (L), eixo duplo **se devidamente identificado** ou gráficos separados, para não confundir grandezas.
- Comparação de períodos **somente** se o backend calcular; série atual vs referência claramente legendadas.
- Ação de arrastar intervalo, teclado e botões 24h/7d, tooltip com horário completo e origem.
- Drilldown ao selecionar ponto -> drawer com dispositivo, timestamp, vazão, volume e link para ocorrência correlata.

### 3. Ocorrências `/ocorrencias` [P0]
- Tabela com busca, filtros e paginação; badges discretos severidade/status.
- Drawer com timeline dos eventos, amostras e campo de verificação; ação `acknowledge`, `resolve` ou `dismiss` só autorizada.
- Ao resolver, atualizar KPIs e timeline sem reload global, confirmando via API.

### 4. Alimentos e impacto `/doacoes` [P0]
- Quadro com lotes por estado (pendente, disponível, reservado, entregue), formulário de cadastro e etapas explícitas.
- Indicador principal "Kg entregues confirmados", separado de "Kg disponíveis".
- Campo de verificação por pessoa responsável, sem alegar que o sensor prova segurança alimentar.

### 5. Relatórios `/relatorios` [P0]
- Filtros iguais ao dashboard, preview tabular, export PDF com status de geração, fonte e hora.

### 6. Dispositivos `/dispositivos` [P1]
- Lista com estado ONLINE/OFFLINE (criterioso), último contato, faixa/calibração e firmware.

## Padrões de interatividade
- Uma mudança de filtro global deve atualizar todos os cards/tabelas/gráficos relacionados; mostrar loading skeleton leve e stale state.
- Toda interação que altera dados exibe feedback e tratamento de erro; não alterar o estado apenas localmente e fingir persistência.
- URL deve conter filtros (`?from=...&to=...&siteId=...&source=DEVICE`), tornando a investigação compartilhável.
- Clique no gráfico abre evidência real; se ponto não tem ocorrência, deve dizer isso claramente.
- Layout denso mas respirável: tabela com 40-52px de linha, gráficos >=280px de altura desktop, 4 KPIs em linha em 1440px, área útil de análise dominante.
- Chart overlays discretos (bands de atenção, line reference), tooltip com números formatados, legenda acessível.
- Animar **transições de estado** (drawer 150–220ms, KPIs 200–350ms, linha ao aparecer) sem mover todo o layout; respeitar `prefers-reduced-motion`.
- Paleta de status reservada: verde para ação concluída, âmbar para atenção, vermelho apenas condição crítica, cinza para neutro. Não depender só da cor.
- Autoatualização configurável (ex. 15s por polling no hackathon), com indicador de última atualização. Não anunciar streaming em tempo real se for polling.

## Design tokens sugeridos (ajustáveis, não vinculados a marca definitiva)
```css
:root {
  --canvas: #F5F7F9;
  --surface: #FFFFFF;
  --sidebar: #121B24;
  --ink: #14212B;
  --muted: #667582;
  --border: #E4E9EC;
  --accent: #177E73;
  --accent-soft: #E5F4F1;
  --warning: #BD7D20;
  --danger: #C74944;
  --success: #16806B;
  --radius-card: 14px;
}
```
Typography: Inter, Geist ou equivalente legível; números tabulares; cabeçalhos com hierarquia explícita. Espaçamentos por escala de 4/8px. UI com foco em leitura, não só estética.

## Componentes React alvo
`AppShell`, `GlobalFilters`, `KpiTile`, `SourceProvenance`, `WaterTimeseries`, `FlowTimeseries`, `IncidentBand`, `EvidenceDrawer`, `OccurrenceTimeline`, `StatusDistribution`, `DonationPipeline`, `DeviceHealth`, `GenerateReportButton`, `EmptyState`, `ErrorBoundary`, `Skeleton`.

## Fonte de dados
- Hooks/client components consomem DTOs tipados; Server Components podem obter base inicial.
- Agregação SQL no servidor; não transferir todas as leituras para o navegador.
- `no-store` ou revalidate adequado; cache com chave incluindo organização e filtros.
- Dados demo de `demo-overview.ts` apenas com identificador `SIMULATED`. Sem valores fake em produção.
- **Migrar `intelligence-v3-frame.tsx` (iframe HTML) para React nativo**. A prévia HTML é referência de interação, não base de UI final.

## Critérios visuais de qualidade
1. Em resolução 1440x900, título, 4 KPIs, filtros, gráfico principal e pelo menos parte da tabela visíveis sem rolar indefinidamente.
2. Em 375px, filtros acessíveis e nenhum componente horizontal espremido; tabela pode rolar horizontalmente.
3. Tooltip e drawer em qualquer ponto de gráfico.
4. Comparação coerente com filtro e contexto de organização.
5. Com backend fora do ar, exibir erro honesto, não trocar automaticamente por simulação sem aviso.
6. `Tab`, `Enter`, `Escape` e leitura por screen reader funcionam em drawers e filtros.
7. Testar com dados vazios, múltiplas séries, série com gaps, números grandes, intervalos curtos e fontes mistas.

## Erros a evitar que dão “cara de IA”
Cartões infinitos com cantos de 24px, gradientes em todos os blocos, ícones grandes sem função, tooltips genéricos sem unidades, números gigantes inventados, áreas vazias, repetição do slogan em cada seção, linhas sem eixo legível, botões que não fazem nada, âncoras que não filtram e animações que atrapalham investigações.
