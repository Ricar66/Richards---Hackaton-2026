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

## Canal MQTT (bancada da equipe de IoT, PR #3)

A bancada do Victor publica as leituras num broker MQTT (Mosquitto, por exemplo). A ponte `pnpm mqtt` assina o tópico e entrega cada mensagem, em ordem, **aos mesmos casos de uso do HTTP**. Ela não tem regra própria de gravação:

| Sensor | O que a plataforma faz | Regra |
|---|---|---|
| `VAZAO` (L/min) | Grava `TelemetryReading` e avalia a `FlowAlertPolicy` do dispositivo | `minFlowLpm` e `continuousSeconds` do Device (regra 3); uma ocorrência ativa por dispositivo e tipo (regra 5) |
| `TEMP` / `UMIDADE` (DHT11) | Abre `TEMPERATURE_EXCURSION` (MEDIUM) quando a temperatura fica **acima** do limite de forma sustentada | Limite e tempo em `MQTT_TEMP_LIMIT_C` (28 °C) e `MQTT_TEMP_SECONDS` (30 s); pico isolado não alerta; regra 5 |
| `PESO` (HX711) | Cria lote de doação **`PENDING_REVIEW`** quando o peso fica estável no mínimo | `MQTT_SCALE_MIN_KG` (5 kg) por `MQTT_SCALE_STABLE_SECONDS` (6 s); só fica disponível com verificação humana (regra 6) |

Payload que o firmware publica (exemplo de formato, não medição real):

```json
{ "dispositivo_id": "hortifruti_01", "PESO": 5.2, "VAZAO": 3.1, "TEMP": 26.4, "UMIDADE": 61 }
```

- Cada sensor é opcional, mas pelo menos um entre `VAZAO`, `PESO` e `TEMP` precisa vir. Faixa fora do esperado, texto no lugar de número ou JSON quebrado: a mensagem é **descartada** e registrada no log.
- **`dispositivo_id` precisa existir como `Device.code`**, ou ser mapeado em `MQTT_DEVICE_ALIASES` (ex.: `hortifruti_01=RICHARDS-FLOW-001`). Id desconhecido é descartado. A leitura **nunca** é atribuída a outro sensor.
- **Origem:** sensor que não mede o fenômeno real na bancada é gravado como `SIMULATED`. O padrão é `MQTT_SIMULATED_SENSORS="VAZAO"`, porque a vazão vem de um potenciômetro. Com o YF-S201 ligado, use `MQTT_SIMULATED_SENSORS=""` e a vazão passa a sair como `DEVICE`. Leitura simulada nunca sustenta alerta de leitura real.
- **Horário:** `capturedAt` é a hora em que a ponte recebeu a mensagem. O volume do intervalo é `vazão × tempo desde a leitura anterior`. Na primeira leitura, ou depois de mais de 45 s sem mensagem, usa-se o intervalo declarado do firmware (`MQTT_SAMPLE_SECONDS`, padrão 2 s).
- **Idempotência:** sem `bootId`/`sequence` no payload, a ponte numera as leituras na própria sessão (`bootId = mqtt-xxxxxxxx`). Com o QoS 0 do ESP32 não há reenvio, mas uma mensagem repetida pelo broker contaria duas vezes. Para idempotência igual à do HTTP, o firmware pode mandar `"bootId"` e `"sequence"` (os dois juntos): a repetição volta como duplicata e não soma volume.
- **Balança:** o peso do lote é a **menor** leitura do trecho estável, arredondada para baixo em 0,1 kg, para nunca superestimar. Depois de criar um lote, a balança só gera outro quando é esvaziada (peso abaixo da metade do mínimo). Cada balança mantém no máximo **um** lote aguardando verificação. O autor fica na auditoria (`dispositivo:<código>`, `deviceCode`).
- **Conectividade:** a ponte só atualiza `lastSeenAt`. Não grava `ONLINE`, e `MAINTENANCE` continua sendo decisão humana.
- **Banco fora:** a entrega já foi confirmada ao broker, então a leitura se perde. Isso fica registrado no log (`Falha ao gravar`), e nada é reconstruído depois.

### Como rodar na bancada

```bash
# 1. Broker na rede ISOLADA da bancada (exemplo com Docker; prefira usuário e senha):
docker run -d --name richards-mqtt -p 1883:1883 eclipse-mosquitto:2 mosquitto -c /mosquitto-no-auth.conf
#    No Git Bash, prefixe com MSYS_NO_PATHCONV=1 (senão o caminho vira C:/Program Files/Git/...).
# 2. .env: MQTT_BROKER_URL, MQTT_TOPIC, MQTT_DEVICE_ALIASES e MQTT_SIMULATED_SENSORS (ver .env.example).
# 3. Ponte (processo separado do site, usa o DATABASE_URL do .env):
pnpm mqtt
```

O log mostra cada mensagem (`vazão seq N gravada [SIMULATED]`, `OCORRÊNCIA ... aberta`, `LOTE de X kg criado`) e o motivo de cada descarte. **O tópico padrão é `richards/comercio/telemetria`.** Se o firmware ainda publicar no tópico antigo, ajuste o firmware ou defina `MQTT_TOPIC` no `.env`.

**Segurança:** a confiança do canal é o broker. Sem `MQTT_USERNAME`/`MQTT_PASSWORD`, qualquer equipamento da rede publica leituras, e a ponte avisa isso na partida. Use só em rede de bancada isolada. Em produção: broker com TLS, usuário por dispositivo e ACL por tópico.
