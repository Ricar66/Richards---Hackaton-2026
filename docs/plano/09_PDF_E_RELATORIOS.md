# Relatório PDF — especificação, dados e aceite

## Finalidade
Entregar um relatório executivo que transforma dashboard em evidência. PDF deve usar **mesmo serviço de analytics** que compõe gráficos; não duplicar queries inconsistentes.

## Capa/resumo
Título: “RICHARDS Intelligence — Relatório de recursos e impacto”; organização/unidade; intervalo; gerado em `America/Sao_Paulo` com data/hora; versão do relatório; carimbo `DADOS DE DEMONSTRAÇÃO` se houver valores simulados ou indicação `DADOS MISTOS` se ambos.

## Página 1 — Monitoramento
- KPI de litros monitorados (L), incidentes ativos, resolvidos, tempo de resposta com definição.
- Série de litros por intervalo, eixo rotulado, legenda de fonte.
- Tabela de dispositivos e qualidade dos dados: último contato, nº de amostras, período observado.
- Nota metodológica: sensor registra fluxo; não prova desperdício, vazamento ou economia.

## Página 2 — Ocorrências e doações
- Ocorrências recentes: ID, severidade, status, início, resposta, ação e origem.
- Doações: lote, entidade, peso, status, data de entrega; contar kg apenas `DELIVERED`.
- Proveniência, limitações e quem gerou o relatório (se autenticado).
- Fontes de contexto público, se citadas, devem aparecer como referências externas e claramente separadas dos dados operacionais.

## Exportação
- Endpoint GET `/api/reports/summary?from=&to=&siteId=&source=`.
- Checagem de RBAC e tenant, períodos máximos, sanitização de textos.
- Arquivo A4 paisagem ou retrato coerente, 2 páginas no MVP; footer com página e nome.
- Nome de arquivo `richards-relatorio-AAAA-MM-DD.pdf`.
- PDF não pode trazer zero sem indicar “sem dados”; usar `—` quando não aplicável.
- Identificar se dados vieram de sensores, entrada manual ou simulador.

## Critério de aceite
Compare um período no dashboard e no PDF: mesmos litros, ocorrências e kg; teste fonte `DEVICE` vs `SIMULATED`; PDF abre em Chrome e leitor comum; sem texto cortado, valores ou datas truncados; sem rótulo “economizados” por padrão.
