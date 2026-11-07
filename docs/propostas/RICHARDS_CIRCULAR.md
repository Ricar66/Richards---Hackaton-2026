# RICHARDS Circular — proposta de evolução

**Estado: conceito futuro, não implementado.** Ricardo confirmou que os 5 kg/dia são um exemplo ilustrativo. Esta proposta não altera o pitch oficial de 10 imagens, não cria KPI, integração com operador de resíduos, classificação automática ou destino comprovado no aplicativo.

## Recomendação de produto

Para o hackathon, concluir e demonstrar o ciclo existente de sensores, investigação e ação; mostrar Circular como próximo passo, com fronteira clara entre demonstração e roadmap. A proposta é rastrear o material até uma destinação documentada, sem substituir avaliação sanitária ou ambiental por uma resposta da IA.

Três frentes complementares: prevenir perdas; recuperar alimentos aptos à doação; rastrear o tratamento do resíduo restante. A prioridade não é criar mais um painel com percentuais: é conseguir explicar de onde veio cada quantidade e qual documento sustenta o resultado.

## Primeiro incremento futuro

1. Registrar lote de sobra/resíduo, massa, data, origem e responsável. Distinguir preparo/cozinha, buffet exposto, restos de prato e origem desconhecida. Origem desconhecida permanece pendente de classificação.
2. Triagem humana: alimento apto pode seguir o fluxo de doação existente; material não apto vai para avaliação de destinação. Sensor/IA não liberam alimento nem escolhem automaticamente tratamento.
3. Propor rota compatível com material e operador: compostagem, biodigestão/tratamento orgânico ou disposição de rejeito após avaliação. Verificar aceitação do material e requisitos sanitários, ambientais e locais aplicáveis. Não propor alimentação animal como saída padrão.
4. Registrar coleta, pesagem, operador e documento de recebimento/destinação/tratamento, distinguindo o que cada documento comprova. Coleta não é prova automática de tratamento.
5. Após conferência humana da evidência, contabilizar apenas a quantidade correspondente e a etapa efetivamente comprovada. Manter pendências, recusas e trilha de auditoria.

Antes de IA recomendar compras/produção é necessário registrar histórico estruturado de sobras e contexto de produção. A telemetria atual de peso/temperatura é efêmera, e lote de doação não equivale a histórico de resíduo gerado. Não afirmar que essa análise já existe.

## Cenário para explicar à banca — exclusivamente ilustrativo

| Premissa/cálculo | Quantidade |
|---|---:|
| Descarte hipotético diário | 5 kg |
| Operação hipotética | 26 dias/mês |
| Linha de base ilustrativa: 5 × 26 | 130 kg/mês |
| Mesma premissa por 12 meses | 1.560 kg/ano |
| Hipótese de redução de 50% | 65 kg/mês evitados no cenário |
| Resíduo restante no cenário | 65 kg/mês a avaliar para destinação |
| Destinação real comprovada por este exemplo | Nenhuma |

Os 65 kg evitados e os 65 kg restantes pertencem a categorias diferentes. Não somá-los como “130 kg tratados”, nem registrar hipótese no BI como redução ou tratamento real. Nem todo resíduo restante será necessariamente aceito para compostagem/biodigestão.

## Indicadores futuros e integridade

- Manter separados: estimativa de prevenção, kg doados com entrega confirmada, resíduo gerado, kg coletados, kg recebidos pelo operador, kg com tratamento comprovado e rejeitos.
- Quantidade evitada depende de comparação consistente com linha de base e contexto produtivo, não de uma pesagem isolada.
- Não contar o mesmo material como doado e como resíduo destinado. Lotes divididos precisam de alocação de massa e vínculo entre registros, sem apagar o histórico original.
- Só definir índice de circularidade depois de fixar período, unidade, escopo, denominador e evidências elegíveis. Prevenção estimada não integra silenciosamente um denominador de resíduos efetivamente gerados.
- Não converter kg em refeições, CO₂ evitado, composto ou energia sem método, fatores e evidências adequados.

## Base normativa consultada em 07/11/2026

A PNRS, Lei 12.305/2010, art. 9º, estabelece prioridade de não geração e redução, seguidas das demais formas de aproveitamento/tratamento e da disposição adequada dos rejeitos. Isso orienta o produto; não autoriza qualquer destino automaticamente.

A Lei 15.224/2025, art. 14, abrange alimentos in natura ou preparados sob condições de segurança e normas sanitárias. O §2º prevê, na forma de regulamento, compostagem agrícola ou biomassa para geração de energia para alimentos sem condições apropriadas ao consumo humano. Não é autorização irrestrita para tratar qualquer resíduo em qualquer instalação. Requisitos locais, material aceito e habilitação aplicável do operador precisam ser verificados antes de uso real.

A restrição atual do MVP a disponibilizar buffet exposto é uma escolha cautelosa do produto, não declaração de proibição universal de doação de comida preparada. Preservar a triagem existente.

Fontes primárias:
- https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2010/lei/l12305.htm
- https://www2.camara.leg.br/legin/fed/lei/2010/lei-12305-2-agosto-2010-607598-normaatualizada-pl.html
- https://www2.camara.leg.br/legin/fed/lei/2025/lei-15224-30-setembro-2025-798048-publicacaooriginal-176570-pl.html

## Como mostrar agora

No encerramento ou nas perguntas da banca, apresentar como evolução futura: “Depois de prevenir perdas e recuperar alimentos aptos, queremos rastrear também a destinação do resíduo restante, com operador e comprovação.” O cenário dos 5 kg explica a oportunidade; não é resultado do piloto. Manter a apresentação principal dentro de 5min40 e distinguir explicitamente o que a plataforma já executa.
