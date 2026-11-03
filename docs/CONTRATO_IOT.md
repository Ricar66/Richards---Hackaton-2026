# Contrato de integração ESP32 ↔ Next.js

## Endpoint

`POST /api/iot/telemetry`

Headers: `Content-Type: application/json` e `x-device-key: <segredo-unico>` (sem HTTP Basic nesta rota).

Payload:

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

A data acima é **exemplo de formato**, não leitura real. Utilize `UTC ISO 8601`, com relógio sincronizado via NTP.

## Respostas

| HTTP | Significado |
|---|---|
| 202 | Aceito, `duplicate` e `alerted` indicam resultado |
| 401 | Chave ausente/incorreta |
| 422 | JSON inválido, faixas inválidas ou horário fora de ±5 min |
| 503 | Banco indisponível |

As retransmissões com mesmo `(deviceId, bootId, sequence)` recebem `duplicate: true`, sem somar o volume novamente.

## Cálculo do ESP32

- Contar pulsos por interrupção durante intervalo de 15s.
- `deltaLiters = pulsos / pulsosPorLitroCalibrados`.
- `flowLpm = deltaLiters × (60000 / intervaloEmMs)`.
- Enviar dado acumulado do intervalo, **não** contador total de boot.
- Não enviar dados falsos como `DEVICE`: o servidor marca a origem pelo canal de autenticação.

## Testes de integração

1. Desligar sensor → `flowLpm≈0` e sem alerta.
2. Fluxo acima do limiar por >=30s no cenário de teste → ocorrência `OPEN`.
3. Fluxo reduzido entre leituras → reinicia contagem.
4. Reenviar pacote igual → `duplicate=true` sem duplicidade.
5. Chave inválida → 401.
6. Desconectar Wi-Fi → fila curta e tentativa de retomar.
7. Reiniciar ESP32 → novo `bootId` e nova sequência.
8. Desligar PostgreSQL → 503 sem afirmar entrega da medição.

## Proteção elétrica e rede

**Não aplicar 5V diretamente em GPIO ESP32 3,3V.** Consulte o datasheet do conjunto e aplique divisor de tensão/level shifter quando necessário. Separe bomba hidráulica e alimentação da placa, isole umidade, utilize baixa tensão e suporte da equipe IoT. Em produção, exigir HTTPS com certificado CA validado. Redes de hotspot isoladas são melhores para a apresentação; nunca transportar uma chave por HTTP na internet.

Para script simulador, envie `x-richards-simulator: true`; o servidor respeita esse marcador **apenas** em `DEMO_MODE=true`, garantindo que a origem apareça como `SIMULATED`.

## Conexão do ESP32 com Docker

O Compose principal usa `127.0.0.1:3000` e não atende um ESP32 na rede. Para uma apresentação em LAN **isolada**, execute `docker compose -f docker-compose.yml -f compose.iot-lab.yml up --build`, abra a porta 3001 no firewall do computador **somente para o IP do dispositivo**, e configure `RICHARDS_API_URL=http://IP-DO-NOTEBOOK:3001/api/iot/telemetry`. **Tráfego em HTTP revela a chave na rede; use apenas bancada isolada.** Para operar fora do laboratório, implemente HTTPS com validação de certificado.
