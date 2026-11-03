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