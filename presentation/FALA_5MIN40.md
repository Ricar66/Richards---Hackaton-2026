# RICHARDS — fala de palco com 10 imagens oficiais

Meta: **5min40 incluindo 2min de demonstração**. Duração ainda não aferida em ensaio humano. Os quatro papéis abaixo devem ser atribuídos antes de apresentar. Ricardo opera o BI; Victor opera a bancada. Os outros dois integrantes dividem narrativa e alimentos/impacto.

| Tempo | Imagem / ação | Pessoa |
|---|---|---|
| 00:00–00:35 | 01 capa, 02 problema | Integrante 3, narrativa |
| 00:35–01:05 | 03 nome, 04 solução | Integrante 3 |
| 01:05–01:40 | 05 água e bancada | Victor, IoT |
| 01:40–02:40 | Sala ao vivo e ocorrência | Ricardo no BI, Victor na bancada |
| 02:40–03:20 | 06 alimentos, depois Doações | Integrante 4, Ricardo opera |
| 03:20–03:40 | 07 plataforma, depois PDF real | Ricardo |
| 03:40–04:20 | 08 diferencial | Ricardo |
| 04:20–05:00 | 09 impacto e piloto | Integrante 4 |
| 05:00–05:40 | 10 fechamento | Integrante 3 |

## 00:00–00:35 · Problema
“Quanto custa perceber tarde demais? Uma torneira pode continuar aberta sem investigação. Um excedente pode perder a oportunidade de chegar a uma instituição. Queremos reduzir o tempo entre o sinal e a ação. O RICHARDS organiza esse caminho e registra o que aconteceu.”

## 00:35–01:05 · Nome e solução
“O nome homenageia Ellen Swallow Richards e seu trabalho com água, ambiente e alimentação. Essa inspiração aparece na proposta: usar observações para melhorar decisões. A plataforma recebe a leitura, aplica uma regra configurável e oferece uma investigação com histórico e relatório. As imagens são conceituais; os números desenhados nelas não são resultados do projeto.”

## 01:05–01:40 · Victor apresenta o hardware
“Esta é nossa bancada. Vamos identificar o sensor conectado, o canal usado e o que foi efetivamente calibrado. O ESP32 envia as leituras para a plataforma. Fluxo persistente acima do limiar gera uma suspeita para investigar. Um pico sozinho não basta.”

**Antes de falar:** consultar o registro físico. Se não houver evidência de funcionamento, dizer: “A integração física permanece pendente. Vamos demonstrar o software com a bancada virtual, identificada como SIMULADO.” Potenciômetro é simulação de vazão.

## 01:40–02:40 · Ricardo e Victor demonstram água
Telão em `/ao-vivo`, sensor e origem visíveis. Victor inicia o fluxo conforme a regra configurada, com antecedência combinada no ensaio. Ricardo abre a ocorrência, mostra a evidência, assume a investigação e resolve apenas após a verificação, com nota correspondente ao que observou.

“A velocidade do desenho acompanha a vazão recebida. O anel mostra os segundos confirmados pela regra. Agora temos uma ocorrência suspeita. Uma pessoa assume, verifica e registra a intervenção. O desenho é esquemático, não uma reprodução da instalação.”

Se a ocorrência não surgir no tempo previsto, não alterar a regra no palco. Usar evidência de ensaio já registrada e identificá-la como gravação, ou seguir o plano B do roteiro operacional.

## 02:40–03:20 · Integrante 4 apresenta alimentos
“A pesagem ou o cadastro inicia um lote aguardando verificação humana. O operador registra essa verificação, reserva para a instituição e documenta quem recebeu. Apenas a entrega confirmada entra no indicador de quilos entregues.”

Ricardo mostra os estados no BI. **Não confirmar uma entrega real só para subir o KPI.** Demonstrar uma entrega efetiva autorizada ou um lote SIMULATED no ambiente de teste, sempre identificado. O destinatário não tem login próprio no MVP.

## 03:20–03:40 · Ricardo mostra o relatório
“O painel usa os registros do banco. Este PDF usa o mesmo recorte, os mesmos filtros e identifica a origem. Sem dados, a plataforma informa a ausência.”

Mostrar o PDF gerado pela aplicação. A imagem 07 é uma ilustração do conceito, não uma captura nem evidência de impacto.

## 03:40–04:20 · Diferencial
“Nosso diferencial proposto é acompanhar a leitura até a ação registrada. A mesma plataforma conecta monitoramento, investigação e doações. Hoje usamos regras configuráveis. IA preditiva é uma possibilidade futura, que depende de histórico confiável, eventos rotulados e comparação com a regra atual.”

## 04:20–05:00 · Impacto e piloto
“Queremos medir tempo de resposta, falsos alertas e quilos efetivamente entregues. Volume monitorado não representa economia. Para comprovar redução de desperdício, precisamos de um piloto com condições comparáveis, calibração e acompanhamento. Também precisamos validar instalação, manutenção e custos antes de prometer retorno financeiro.”

## 05:00–05:40 · Encerramento
“O RICHARDS torna visível o sinal e organiza a responsabilidade por agir. O próximo passo é validar a bancada e o uso em uma operação acompanhada. Estamos apresentando um protótipo, com suas evidências e limites. Perceber antes. Agir melhor. Comprovar resultados. Obrigado!”

## Ensaio
- Ensaiar três vezes e registrar duração real, transições de fala e atraso do alerta.
- Marco de corte: 03:40 encerra a demo. Se atrasar, reduzir a explicação do diferencial.
- Plano B: parar a ponte de vazão antes da bancada virtual; declarar SIMULAÇÃO e mostrar o selo. Ver `ROTEIRO_PALCO.md`.
- Não contar hardware, projetor ou impacto como aprovados antes dos registros reais.
