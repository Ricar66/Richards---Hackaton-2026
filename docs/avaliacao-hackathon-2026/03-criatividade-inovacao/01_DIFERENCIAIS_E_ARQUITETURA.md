# Diferenciais de integração — do sensor à ação

**Versão documentada:** [RICHARDS develop @ 57cdd0ab](https://github.com/Ricar66/Richards---Hackaton-2026/tree/57cdd0ab40cacecdc68a31c9b3137fdea3478be0), em 07/11/2026. Funcionalidades observadas no código; execução de testes, sensores físicos e resultados comerciais não comprovados por este documento.

O diferencial não é alegar um medidor inédito nem uma IA capaz de descobrir automaticamente a causa de todo defeito. É reunir **telemetria, regras verificáveis, investigação humana, rastreabilidade e acompanhamento de resultados** em uma jornada só.

## Água

ESP32 + sensor calibrado → ingestão HTTP/MQTT → leituras com fonte DEVICE → regra de fluxo contínuo → ocorrência suspeita → verificação técnica → resolução documentada → BI e PDF.

Para a análise de falta de uso, o painel cruza **somente DEVICE** por 72 horas, frescor da leitura e cobertura mínima de 85% dos blocos de 10 minutos. Sem sinal atual ou com lacunas, não infere inatividade. Quando não há fluxo mensurável, a vistoria só é solicitada após declaração de sensor dedicado/calibrado e uso esperado, sempre como ocorrência **MANUAL**.

O limiar exploratório de 0,2 L/min **não** comprova sensibilidade do equipamento real; a equipe precisa ensaiar fisicamente, sobretudo microvazamentos.

## Alimentos

Lote cadastrado → PENDING_REVIEW → origem, conservação e checklist humano → verificador identificado e cargo/habilitação declarado → AVAILABLE → reserva com instituição ativa → entrega confirmada → contabilização de kg entregues.

A validação sanitária ocorre também no servidor; o software não certifica a qualidade. O bloqueio de buffet exposto é política conservadora do MVP, não vedação legal universal.

## Telas para evidências

/monitoramento, /dispositivos, /ocorrencias, /doacoes e centro de controle. Capturas reais devem exibir claramente a origem DEVICE/SIMULATED/MANUAL. Não usar arte gerada como se fosse captura do aplicativo.
