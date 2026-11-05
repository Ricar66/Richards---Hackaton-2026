# Handoff IoT — Victor × Plataforma RICHARDS

## Contrato que NÃO pode mudar isoladamente

POST `/api/iot/telemetry` — `Content-Type: application/json`, `x-device-key` no header.

```json
{
  "deviceCode": "RICHARDS-FLOW-001",
  "bootId": "esp32-a1b2c3d4",
  "sequence": 17,
  "flowLpm": 2.5,
  "deltaLiters": 0.625,
  "capturedAt": "2026-11-07T13:15:00Z"
}
```

Esse JSON é exemplo de contrato, **não medição real**. Enviar horário UTC/NTP. `deltaLiters` mede somente o intervalo de 15s, não o volume acumulado da inicialização. Credencial única fora do Git. A origem `DEVICE` ou `SIMULATED` é atribuída pelo servidor.

## Canal MQTT da bancada (PR #3, mesclado em 04/11)

A ponte `pnpm mqtt` aceita o JSON que o firmware já publica (`dispositivo_id`, `PESO`, `VAZAO`, `TEMP`, `UMIDADE`) e grava pelos mesmos casos de uso do HTTP. **O que mudou em relação ao PR:**

- **Tópico padrão:** `richards/comercio/telemetria` (o nome antigo do produto não aparece mais). Troque no firmware ou defina `MQTT_TOPIC` no `.env`.
- **`dispositivo_id`:** precisa ser `RICHARDS-FLOW-001` ou estar mapeado em `MQTT_DEVICE_ALIASES="hortifruti_01=RICHARDS-FLOW-001"`. Id desconhecido é descartado (não cai mais no primeiro sensor do banco).
- **Vazão:** alerta pela regra do dispositivo (≥ 1,5 L/min por 30 s), não por 8 L/min numa leitura só. Com potenciômetro, a leitura sai **SIMULATED** (`MQTT_SIMULATED_SENSORS="VAZAO"`). Com o YF-S201 ligado, use `""`.
- **Temperatura:** alerta quando fica acima de 28 °C por 30 s seguidos (pico isolado não alerta).
- **Balança:** a partir de 5 kg estáveis por 6 s cria lote **aguardando verificação** (não mais "disponível"). Só cria outro depois de esvaziar a balança, e há no máximo um lote pendente por balança.
- **Missões** não são criadas por enquanto: não há tela para elas (P2).
- **Opcional, recomendado:** mandar `"bootId"` (aleatório a cada boot) e `"sequence"` (contador) no JSON deixa a retransmissão idempotente como no HTTP.
- **Falta no repositório:** o `.ino` do firmware MQTT. Suba em `iot/esp32_richards_mqtt/`, com um `secrets.h.example` e sem senha.

Teste de bancada MQTT:

- [ ] Broker na rede isolada; `pnpm mqtt` mostra `Ouvindo richards/comercio/telemetria`.
- [ ] Log mostra `vazão seq N gravada` a cada mensagem, e o BI mostra o sinal ao vivo.
- [ ] Vazão acima de 1,5 L/min por 30 s abre UMA ocorrência; zerar a vazão não abre.
- [ ] Aquecer o DHT11 acima de 28 °C por 30 s abre UMA ocorrência de temperatura.
- [ ] 5 kg na balança criam UM lote "aguardando verificação"; tirar e pôr de novo, com o lote ainda pendente, não cria outro.

## Checklist de ensaio conjunto

- [ ] Montagem hidráulica de baixa tensão, sem vazamentos na bancada e fora de áreas molhadas elétricas.
- [ ] Adaptar sinal de sensor de 5V ao GPIO ESP32 de 3,3V quando necessário; validar com datasheet.
- [ ] Calibrar sensor em três medições; registrar pulsos/litro, volume conhecido e erro observado.
- [ ] Sincronizar NTP; `bootId` único por boot; `sequence` incremental.
- [ ] Verificar 10 envios válidos consecutivos, todos com HTTP 202.
- [ ] Testar duplicata de `(deviceId, bootId, sequence)` sem volume duplicado.
- [ ] Testar chave inválida 401, payload inválido 422, indisponibilidade 503/retry.
- [ ] Testar vazão persistente por 30s acima do limiar **de laboratório**, com abertura de UMA ocorrência.
- [ ] Confirmar que `flowLpm` perto de zero não gera ocorrência.
- [ ] Abrir no BI a mesma amostra originada pelo dispositivo.
- [ ] Rodar contingência `pnpm simulate` e conferir selo SIMULATED.
- [ ] Gravar vídeo curtíssimo de contingência (tela + bancada + origem) sem fingir execução em tempo real.

## Rede de apresentação

O Compose principal publica a web apenas em `127.0.0.1:3000`. Na LAN isolada, usar `docker compose -f docker-compose.yml -f compose.iot-lab.yml up --build` e porta 3001 restrita ao IP do ESP32. HTTP expõe a chave: **somente bancada isolada**, jamais internet pública. Para produção: HTTPS com validação de certificado.

**Critério de aceite final:** sensor real → API → banco → ocorrência → ação no BI, com captura de tela, log do 202 e calibração documentados. Sem esse ensaio, comunicar a demo como simulada.

**Referência:** `docs/CONTRATO_IOT.md` e `docs/plano/06_IOT_ESP32_INTEGRACAO.md`.