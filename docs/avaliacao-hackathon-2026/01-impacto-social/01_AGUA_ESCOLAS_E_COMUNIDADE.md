# Água em escolas — impacto social, econômico e ambiental

**Versão documentada:** [RICHARDS develop @ 57cdd0ab](https://github.com/Ricar66/Richards---Hackaton-2026/tree/57cdd0ab40cacecdc68a31c9b3137fdea3478be0), em 07/11/2026. Funcionalidades observadas no código; execução de testes, sensores físicos e resultados comerciais não comprovados por este documento.

## Problema concreto

Uma descarga pode continuar deixando água passar durante noites e fins de semana sem que um gestor perceba. O RICHARDS indica padrões de **fluxo contínuo suspeito**, permitindo que uma equipe identifique o ponto, investigue e documente um reparo; o sensor não confirma sozinho se existe vazamento.

A ausência de vazão também pode importar: em um ponto dedicado que deveria estar em uso, 72h sem fluxo mensurável e **com alta cobertura de dados físicos** podem justificar pedido de vistoria manual. Isso não comprova entupimento; pode haver férias, falta de ocupação, defeito, bloqueio de abastecimento ou sensibilidade insuficiente. Medidor de ramal geral não individualiza cada vaso.

## Cenários de potencial — não são medições realizadas

| Cenário hipotético | Cálculo | Resultado |
|---|---|---|
| 1 litro/min por 24h e 30 dias | 1 × 60 × 24 × 30 | **43.200 L** ou 43,2 m³ |
| Tarifa linear ilustrativa de R$10/m³ | 43,2 × 10 | **R$432** de consumo teórico |
| Comércio deixa de perder 1kg/dia a R$15/kg por 26 dias | 1 × 15 × 26 | **R$390/mês** de perda potencialmente evitável |
| 100 negócios destinam 2kg/dia por 26 dias | 100 × 2 × 26 | **5.200kg** de destinação potencial |

Não assumir que 5.200 kg foram entregues: todos os alimentos teriam de ser apropriados ao consumo, verificados, aceitos e recebidos. A conta de água real pode incluir faixas, esgoto e consumo mínimo.

## Evidências necessárias antes de alegar economia

1. Registrar instalação, localização exata, calibração, limiar e período antes de uma intervenção.
2. Documentar cobertura de leituras, horário escolar e ocupação prevista.
3. Confirmar em inspeção o defeito e o instante do reparo.
4. Comparar consumo antes/depois em condições equivalentes, explicando incerteza.
5. Usar tarifa efetiva da fatura e calcular custos reais, sem atribuir automaticamente toda mudança ao software.
6. Para alimentos, contar **somente kg efetivamente recebidos**, vinculados a lote e instituição.

Beneficiários: escolas e mantenedores, gestores públicos, pequenos negócios, equipes de manutenção, instituições sociais e comunidade. [Cenários CSV](metricas/cenarios_ilustrativos.csv).
