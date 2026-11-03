# RICHARDS Intelligence — Sistema Visual V2

## Objetivo
Substituir o dashboard genérico da primeira versão por uma sala de controle operacional que comunique confiança, clareza e capacidade de ação. Estética de BI SaaS moderno; dados sem excesso de ornamentos.

## Decisões visuais
- Sidebar escura #101E25 com marca RICHARDS e hierarquia de módulos.
- Área de trabalho clara #F6F8FA, com cartões brancos, tipografia forte e linhas discretas.
- Verde #14A77B como cor primária e gradiente de abertura para a narrativa de transformação.
- Laranja para demandas de atenção, azul para análise, verde para itens concluídos.
- Indicadores sempre com a unidade, período e qualificação sobre a origem do dado.
- Gráficos com eixos claros, comparativo de referência e nota de que volume observado não é economia.
- Operação drill-down: do gráfico e da tabela ao detalhe da ocorrência, suas evidências e intervenção.
- Tabelas com status, localização de origem e data do evento.
- Responsividade a partir de 760 px e organização de KPIs em duas colunas nos celulares.

## Diferença entre prévia e a aplicação
- `preview/dashboard-preview.html`: protótipo 100% independente de servidor, com dados FICTÍCIOS e interações locais (não persistidas).
- `src/components/workspace-v2.tsx`: interface conectada aos endpoints existentes do Next.js. Não apresenta as ações locais da prévia como se fossem registros persistidos.
- `src/app/globals.css`: estilos do sistema visual utilizados na aplicação Next.
- `public/richards-visual-v2.html`: mesma prévia, servida pelo Next em `/richards-visual-v2.html` para comparação.

## Fluxos incluídos no Next
1. Painel de indicadores extraídos de `OverviewDTO` e gráficos do Recharts.
2. Monitoramento com série temporal e inventário de dispositivos.
3. Central de ocorrências com modal lateral e registro de intervenção via API.
4. Doações com cadastro, avanço de status e confirmação, incluindo verificação humana.
5. Relatório operacional gerado em `/api/reports/summary`.

## Pendências para a V3
- Filtros de período/unidades aplicados no servidor (na V2, Next mostra apenas 7 dias e unidade atual, sem controles falsos).
- Alertas push/realtime via SSE ou WebSocket; atualmente os indicadores atualizam por polling a cada 15 segundos.
- Criar autenticação robusta, RBAC por unidade e auditoria com usuário real antes de produção.
- Melhorias de acessibilidade por avaliação com usuários reais, não apenas inspeção visual.
- Testes integrados de build, Docker, banco e ESP32, ainda não executados no ambiente atual.

## Apresentação
A prévia é um protótipo visual e seus números são fictícios, não resultados já conquistados pelo projeto RICHARDS. Ela deve ser usada para discutir interface, navegação e a sequência do pitch.
