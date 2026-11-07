# Contrato IoT atual — vazão de água

Firmware HTTP existente: iot/esp32_richards/esp32_richards.ino. Firmware MQTT atualizado, diagrama e evidências precisam ser conferidos com Victor. Nenhuma calibração/teste físico novo é inferido desta mudança.

## HTTP

POST /api/iot/telemetry, Content-Type application/json e x-device-key da chave cadastrada. API confere hash, cadastro FLOW e desvio de relógio.

```json
{"deviceCode":"RICHARDS-FLOW-001","bootId":"esp32-boot-001","sequence":1,"flowLpm":2.4,"deltaLiters":0.08,"capturedAt":"2026-11-07T15:00:00.000Z"}
```

Captura deve usar a hora real, dentro da tolerância da API; não copiar a data do exemplo. deltaLiters corresponde ao intervalo, não ao total acumulado da sessão. Dispositivo/bootId/sequence identificam retransmissão. Simulador autorizado mantém origem SIMULATED.

## MQTT

Tópico de exemplo richards/comercio/telemetria/agua_01. Broker exige credenciais e ACL; MQTT_REQUIRE_DEVICE_TOPIC=true confere identidade do tópico. MQTT_DEVICE_ALIASES="agua_01=RICHARDS-FLOW-001".

```json
{"dispositivo_id":"agua_01","VAZAO":2.4,"bootId":"esp32-boot-001","sequence":1}
```

VAZAO é obrigatória, numérica finita, 0–1000 L/min (faixa de contrato, não precisão comprovada). bootId e sequence vêm juntos; prefixo mqtt- é reservado à ponte. Sem esses campos, sequência sintética não reconhece toda retransmissão de firmware. Campos adicionais antigos são descartados. Não publicar outras grandezas no firmware atualizado.

Hora de chegada é fixada na preparação e preservada no retry. Volume é estimado por vazão × intervalo entre chegadas; primeira amostra/lacuna usa MQTT_SAMPLE_SECONDS. Isso não equivale ao totalizador físico de pulsos. A ponte mantém fila em memória e carta morta; reinício pode perder o que ainda estava em memória. ACK do broker ocorre na chegada, antes do commit. Retry é idempotente; carta morta exige revisão, sem replay cego.

MQTT_SIMULATED_SENSORS=VAZAO para potenciômetro. Vazio apenas com medidor físico; DEVICE não aprova calibração. Configurações antigas de outros fenômenos não participam da ingestão atual. Firmware HTTP sem TLS permanece apenas em laboratório isolado, sem conexão à VPS pública.

## Evidências

Uma identidade é um medidor em ponto físico conhecido. Não criar sensores fictícios para preencher a planta. Conferir pinagem, alimentação, proteção elétrica, direção do fluxo e referência de volume com a equipe IoT. Registrar firmware/commit, diagrama, fotos sem credenciais, pulsos por litro, erro por ensaio e telemetria correlacionada com tela. Sem evidência, ensaio físico permanece pendente. O QR mostra apenas código, hora, origem e vazão; o mapa e a investigação são privados.
