# RICHARDS — Escolas, água e segurança alimentar (07/11/2026)

## Descarga de escola: fluxo suspeito
Sensor dimensionado e calibrado em ramal compatível → fluxo persistente → suspeita para inspeção humana → correção documentada. Sensor de vazão NÃO comprova vazamento. Atenção à sensibilidade: limiar inicial de 1,5 L/min pode não identificar o cenário ilustrativo de 1 L/min, e vazões muito pequenas podem não ser medidas pelo hardware de bancada. Alterar limiar depende de calibração física e taxa de falsos positivos. Exemplo: 1 L/min × 24 h × 30 dias = 43.200 L = 43,2 m³. Com tarifa linear ilustrativa de R$ 10/m³ = R$ 432 de consumo estimado; NÃO economia comprovada. Usar a tarifa efetiva da conta (água/esgoto, faixas, mínimo), associada à unidade. Eficiência precisa de piloto antes/depois.

## Vaso entupido
Não detectável de modo confiável apenas por vazão. Requer inspeção e, se for detectar transbordamento, sensor adicional de nível/umidade. Não anunciar como capacidade do hardware atual.

## Alimentos e legislação — resumo de engenharia
- Lei 15.224/2025, art. 14 e §1º: permite doação sob condições de segurança sanitária e atestação de profissional habilitado nos casos previstos.
- Lei SP 11.575/2003: contempla sobras adequadamente conservadas e distingue restos de consumidores. Buffet exige avaliação contextual, não proibição universal.
- SP: Portaria CVS 5/2013 vigente até 31/01/2027 (CVS 9/2026 prorrogou início da CVS 3/2026 para 01/02/2027).
- Fluxo de produto: PENDING_REVIEW → triagem documentada / profissional responsável → AVAILABLE → instituição ativa RESERVED → DELIVERED com recebimento. Sem liberação automática por sensor.
- Origem de alimento incerta, comida de prato de consumidor e buffet exposto devem ser mantidos em revisão para avaliação; em MVP, bloquear disponibilização até definição do procedimento.
- Validação regulatória final com Vigilância Sanitária municipal e responsável técnico antes de doação real.

Fontes:
- https://www2.camara.leg.br/legin/fed/lei/2025/lei-15224-30-setembro-2025-798048-publicacaooriginal-176570-pl.html
- https://www.al.sp.gov.br/repositorio/legislacao/lei/2003/lei-11575-25.11.2003.html
- https://www.crn3.org.br/noticia/crn-3-destaca-conquista-com-prorrogacao-da-portaria-cvs-no-32026

## 07/11/2026 — Auditoria de ausência de acionamento com evidência
- Telas `/monitoramento` e `/dispositivos`: painel de 72 horas por sensor de vazão, somente `DEVICE`, independente dos filtros de origem.
- Cobertura: pelo menos 85% dos blocos de 10 minutos e 2 ou mais leituras por bloco em média, com comunicação atual `ONLINE`. Sem sinal ou com lacunas nunca é tratado como falta de uso.
- Detecção de amostra de fluxo: limiar exploratório 0,2 L/min (não garante detectar pequenas vazões; exige calibração e validação do Victor). "Fluxo observado" não significa acionamento nem uso humano confirmado.
- Operador precisa declarar **sensor dedicado e calibrado** e **uso esperado no período**. Sem essas declarações, nenhuma sugestão de vistoria baseada em 72h deve ser operacionalizada.
- Quando ambas declarações estiverem presentes e o sistema tiver 72h sem fluxo registrado com cobertura adequada, é possível solicitar uma ocorrência `MANUAL` de inspeção. Backend recomputa a elegibilidade, deduplica pelo mesmo sensor + tipo + origem e grava ator, proveniência `DEVICE`, parâmetros da observação e data na auditoria. Não é diagnóstico automático de entupimento.
- Valor noturno: apenas litros medidos na madrugada × tarifa ilustrativa (com `source=DEVICE`), não custo comprovado de vazamento; comparar faturas e períodos iguais após intervenção para alegar economia.
- Horários escolares, feriados, recesso e ocupação não são inferidos automaticamente: precisam ser configurados ou verificados por pessoa. Extensão futura: cadastro persistente de pontos, escala, calendário escolar, sensibilidade, sensores de nível/transbordamento.
