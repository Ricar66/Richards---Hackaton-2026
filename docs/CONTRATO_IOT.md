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

| HTTP | Significado | O que o firmware/simulador faz (Fase 2) |
|---|---|---|
| 202 | Aceito; `duplicate` e `alerted` indicam o resultado | retira da fila |
| 400 | JSON malformado (`INVALID_JSON`) | **descarta** (reenviar não resolve) e loga |
| 401 | Chave ausente ou incorreta (`DEVICE_KEY_REQUIRED`, `NOT_AUTHORIZED`) | mantém, loga orientação e espera 30 s (o simulador encerra) |
| 422 | Faixa inválida (`VALIDATION_ERROR`) ou horário fora de ±5 min (`CLOCK_SKEW`) | **descarta** e loga |
| 503 / sem conexão | Banco indisponível (`DATABASE_UNAVAILABLE`) ou rede | mantém e reenvia **a mesma leitura, com a mesma sequence**, em 5 s |

As retransmissões com o mesmo `(deviceId, bootId, sequence)` recebem `duplicate: true` sem somar volume, inclusive quando chegam ao mesmo tempo: a constraint UNIQUE decide (`INSERT … ON CONFLICT DO NOTHING`).

**Política de horário (decisão da Fase 2):** fica a tolerância de ±5 min. A fila do firmware guarda 12 leituras (cerca de 3 min a 15 s), então tudo que ela consegue segurar chega dentro da tolerância. Queda de rede mais longa perde as leituras mais antigas, e o firmware loga `DROP` com o total descartado. Nada é reconstruído nem estimado. Ingestão tardia (horas depois) exigiria marcar a leitura como atrasada e não avaliar alerta retroativo; isso fica fora do MVP.

**Conectividade:** o painel calcula o estado pelo último contato (`lastSeenAt`): ONLINE até 120 s sem leitura, depois OFFLINE; NEVER_SEEN se nunca chegou pacote; MAINTENANCE só por decisão humana no banco. A telemetria não grava mais `state`.

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

### Simulador de bancada (`pnpm simulate`)

Ele se comporta como o firmware: fila de 12, retentativa com a mesma `sequence` e a mesma tabela de status acima. Ele lê `IOT_DEMO_DEVICE_KEY` do `.env` e `RICHARDS_URL` do ambiente (padrão `http://localhost:3000`).

```bash
pnpm simulate                                              # leak: 7 amostras a cada 10 s, abre UMA ocorrência
pnpm simulate --scenario normal --samples 12               # usos curtos: nenhuma ocorrência
pnpm simulate --scenario low                               # contínuo abaixo de 1,5 L/min: nenhuma ocorrência
pnpm simulate --interval 5 --samples 8 --duplicate-rate 0.3 --drop-rate 0.2   # repetição e falha de rede injetadas
pnpm simulate --boot-id reinicio-1                         # simula reboot (novo bootId, sequence volta a 0)
```

O resumo final informa aceitas, duplicatas, retentativas, descartes e a ocorrência associada; o código de saída é 0 se a fila zerou. **Uma ocorrência de fluxo ativa bloqueia uma nova** (regra 5): resolva a anterior antes de demonstrar outra.

## Conexão do ESP32 com Docker

O Compose principal usa `127.0.0.1:3000` e não atende um ESP32 na rede. Para uma apresentação em LAN **isolada**, execute `docker compose -f docker-compose.yml -f compose.iot-lab.yml up --build`, abra a porta 3001 no firewall do computador **somente para o IP do dispositivo**, e configure `RICHARDS_API_URL=http://IP-DO-NOTEBOOK:3001/api/iot/telemetry`. **Tráfego em HTTP revela a chave na rede; use apenas bancada isolada.** Para operar fora do laboratório, implemente HTTPS com validação de certificado.
