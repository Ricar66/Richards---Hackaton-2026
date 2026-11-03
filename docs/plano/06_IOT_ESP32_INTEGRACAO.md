# IoT — briefing operacional de hardware + firmware

## Entrega de IoT 1 (físico)
- Montar bancada **fechada e segura**, com reservatório, pequena bomba de baixa tensão, mangueiras, sensor de fluxo, fonte e organização de cabos.
- Verificar compatibilidade hidráulica: diâmetro, pressão, material, vedação, fluxo mínimo/máximo do sensor (consultar datasheet de **lote exato**).
- Verificar compatibilidade elétrica: ESP32 GPIO 3,3V; nível lógico do sensor não pode exceder isso; usar conversão de nível quando necessário.
- Calibrar com volume conhecido: medir pulsos para 0,5L, 1L e 2L (quando seguro); repetir 3 vezes por ponto; estimar `pulsesPerLiter` e erro relativo.
- Registrar fotos, esquema das ligações, volume conhecido, resultados e limitações.
- Fazer checklist de segurança: água distante de placas/tomadas, proteção de cabo, circuito sem rede elétrica exposta e bombeamento sem transbordamento.

## Entrega de IoT 2 (firmware)
- Captura por interrupção (`pulseISR`); contador lido com seção crítica; amostrar a cada ~15s.
- Fórmulas: `deltaLiters = pulses / calibratedPulsesPerLiter`, `flowLpm = deltaLiters * 60000 / elapsedMs`.
- Incluir `deviceCode`, `bootId`, `sequence`, horário NTP UTC; mesma amostra e `sequence` em todas as retentativas.
- Fila curta para Wi-Fi intermitente e logs na serial; não fabricar timestamps se NTP falhar.
- Se `202` aceito, retirar da fila; se `401` ou erro persistente de contrato, informar explicitamente no log; em `503`, manter para tentar reenviar respeitando janela de horário.
- Detectar perdas de amostragem: registrar `DROP`/contagem de descartes no serial e, futuramente, telemetria de saúde.

## Limites conhecidos / gaps reais a discutir
- O modelo YF-S201 **não é um detector universal de microvazamentos**. Faixa comercial declarada geralmente próxima de 1–30 L/min, dependendo do lote/fabricante. Escolher vazão demonstrável no laboratório.
- `minFlowLpm` inicial no schema é 1,5 L/min e `continuousSeconds` 30s; com intervalo de 15s, para 30s de observação contínua normalmente são necessárias três amostras; testar a regra com timestamps reais.
- A política atual tolera saltos de até 45s entre leituras. Se quedas ou filas ocorrerem, avaliar a continuidade de forma mais robusta (amostras `durationMs` e gaps), sem inferir consumo não medido.
- API rejeita timestamps com diferença de ±5 minutos. Após indisponibilidade de rede longa, amostras antigas podem ser descartadas. Para produção, estabelecer política documentada de ingestão tardia, sem abrir alertas retroativos incorretos.
- A regra pode confundir uso normal prolongado com fluxo anormal. Para operação real, aplicar **horário esperado, padrão de consumo, verificação humana** e metodologia de calibração.
- Não controlar válvula remotamente nem cortar fornecimento na versão do hackathon.

## Contrato de rede
- Endereço local do PC acessível pelo ESP32, por exemplo `http://IP-DO-PC:3001/api/iot/telemetry` no Compose específico de bancada, apenas em Wi-Fi isolado.
- Header `x-device-key` único por dispositivo; armazenar hash SHA-256 da chave no banco. Chave em `secrets.h` ignorado pelo git.
- Header `x-richards-simulator:true` exclusivo do simulador com `DEMO_MODE=true`; o firmware real **não** envia isso.
- Aceitação/duplicata pela composição `deviceId + bootId + sequence`, persistida com constraint UNIQUE.
- Não enviar senha em texto puro por rede aberta; HTTP somente bancada isolada. TLS com verificação de certificado para produção.

## Protocolo mínimo demonstrável
```json
{"deviceCode":"RICHARDS-FLOW-001","bootId":"esp32-9fc40a","sequence":12,"flowLpm":2.4,"deltaLiters":0.6,"capturedAt":"2026-11-07T13:15:00Z"}
```
Amostra demonstrativa, **não** leitura real. Backend define `source=DEVICE` quando a chave é válida e a origem não é marcada simulada em modo demo.

## Plano de testes físicos e de integração
| Teste | Procedimento | Esperado |
|---|---|---|
| IOT-01 | Iniciar sem fluxo | zero aproximado, sem alerta |
| IOT-02 | Vazão calibrada por 1min | leitura dentro do erro medido e registrado |
| IOT-03 | Fluxo persistente > limiar | ocorrência única, verificação pendente |
| IOT-04 | Parar e retomar | janela interrompida, sem falso histórico contínuo |
| IOT-05 | Desconectar Wi-Fi | logs, fila, sem duplicação depois |
| IOT-06 | Reiniciar ESP32 | novo bootId, sequência reinicia sem colisão |
| IOT-07 | Enviar sequência repetida | `duplicate:true`, não soma |
| IOT-08 | Chave inválida | 401, sem gravar |
| IOT-09 | Banco indisponível | 503/erro registrável, sem afirmar leitura aceita |
| IOT-10 | NTP indisponível | não fabricar timestamp |
| IOT-11 | Exceder fila | descarte identificado, sem corrigir volume inventado |

## Plano B do palco
Se a placa não conectar, demonstrar dados de `scripts/iot-simulator.mjs` com `source=SIMULATED` evidente na tela e mencionar a falha. Isso evita uma apresentação interrompida, mantendo a integridade do pitch.
