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

O resumo final informa aceitas, duplicatas, retentativas, descartes e a ocorrência associada; o código de saída é 0 se a fila zerou. **Uma ocorrência de fluxo ativa da mesma origem bloqueia uma nova** (regra 5, por dispositivo, tipo e origem): resolva a anterior antes de demonstrar outra. Uma simulada não bloqueia a do sensor real.

## Conexão do ESP32 com Docker

O Compose principal usa `127.0.0.1:3000` e não atende um ESP32 na rede. Para uma apresentação em LAN **isolada**, execute `docker compose -f docker-compose.yml -f compose.iot-lab.yml up --build`, abra a porta 3001 no firewall do computador **somente para o IP do dispositivo**, e configure `RICHARDS_API_URL=http://IP-DO-NOTEBOOK:3001/api/iot/telemetry`. **Tráfego em HTTP revela a chave na rede; use apenas bancada isolada.** Para operar fora do laboratório, implemente HTTPS com validação de certificado.

## Canal MQTT (bancada da equipe de IoT, PR #3)

A bancada do Victor publica as leituras num broker MQTT (Mosquitto, por exemplo). A ponte `pnpm mqtt` assina o tópico e entrega cada mensagem, em ordem, **aos mesmos casos de uso do HTTP**. Ela não tem regra própria de gravação:

| Sensor | O que a plataforma faz | Regra |
|---|---|---|
| `VAZAO` (L/min) | Grava `TelemetryReading` e avalia a `FlowAlertPolicy` do dispositivo | `minFlowLpm` e `continuousSeconds` do Device (regra 3); uma ocorrência ativa por dispositivo, tipo e origem (regra 5) |
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
- **Idempotência:** sem `bootId`/`sequence` no payload, a ponte numera as leituras na própria sessão (`bootId = mqtt-xxxxxxxx`). Com o QoS 0 do ESP32 não há reenvio, mas uma mensagem repetida pelo broker contaria duas vezes. Para idempotência igual à do HTTP, o firmware pode mandar `"bootId"` e `"sequence"` (os dois juntos): a repetição volta como duplicata e não soma volume. O prefixo `mqtt-` no `bootId` é reservado à ponte e é recusado.
- **Balança:** o peso do lote é a **menor** leitura do trecho estável, arredondada para baixo em 0,1 kg, para nunca superestimar. Depois de criar um lote, a balança só gera outro quando é esvaziada (peso abaixo da metade do mínimo). Cada balança mantém no máximo **um** lote aguardando verificação. O autor fica na auditoria (`dispositivo:<código>`, `deviceCode`).
- **Conectividade:** a ponte só atualiza `lastSeenAt`. Não grava `ONLINE`, e `MAINTENANCE` continua sendo decisão humana.
- **Banco fora (auditoria final e revisão adversarial, 06/11).** O MQTT.js confirma ao broker (PUBACK) **na chegada**, e a ponte grava por uma **fila própria em memória**, uma mensagem por vez, na ordem de chegada.
  - **Por que não confirmar só depois de gravar?** Essa foi a 1ª versão. Ela segurava o laço de pacotes do MQTT.js, e com ele a resposta ao ping. Com o banco fora por 30 a 90 s, o keepalive derrubava a conexão, e o que estava represado se perdia sem aviso. A versão atual foi testada com broker real (B5): keepalive de 2 s, banco fora por 9 s, 4 mensagens, 0 queda, 4 gravadas.
  - **Hora de chegada.** A hora da leitura é a da **chegada** na ponte, carimbada antes da fila. A retentativa grava a MESMA leitura: mesma hora e mesma sequência. A hora nunca é "atualizada" para o momento em que o banco voltou, nem quando o banco já estava fora na chegada. O volume usa o intervalo real entre chegadas.
  - **Retentativa.** Com o banco recusando, a ponte insiste com espera crescente (0,5 s até 15 s). O prazo é de relógio (`MQTT_RETRY_BUDGET_SECONDS`, padrão 120 s), e cada tentativa tem teto de 30 s, então uma consulta pendurada não prende a fila.
  - **Carta morta** (`MQTT_DEAD_LETTER`, padrão `.mqtt-dead-letter.ndjson`). Recebe a mensagem nestes casos:
    - prazo esgotado;
    - erro permanente (valor fora de faixa, chave violada, consulta malformada): vai na hora, sem esperar o prazo;
    - fila cheia (`MQTT_QUEUE_MAX`, padrão 2000);
    - ponte encerrada com mensagens esperando.

    Cada linha traz hora de chegada, tópico, conteúdo, motivo, erro e `partial`, isto é, o que já foi gravado: vazão com `bootId`/`sequence`, contato, temperatura e lote. "PARCIALMENTE gravada" no log quer dizer que só o resto falta.
    - **Tentativa atrasada:** uma consulta que estoura o teto continua rodando, porque não dá para cancelá-la. A tentativa seguinte espera por ela, e nunca rodam duas ao mesmo tempo. Se ela ainda corria no fim do prazo, a linha leva `attemptStillRunning: true` e o log diz "SITUAÇÃO INCERTA": confira no banco antes de reprocessar.
    - Reprocessar é decisão humana.
  - **Mensagem retida** no broker (`retain`) é **ignorada**: é uma leitura velha, reentregue a cada assinatura.
  - **Curinga** em `MQTT_TOPIC` (`+`/`#`) é aceito como filtro compartilhado. Não combina com `MQTT_REQUIRE_DEVICE_TOPIC=true`, e a ponte recusa subir assim.
  - Testes: `tests/integration/mqtt-confiabilidade.test.ts` (M3.1–M3.11) e `pnpm test:mqtt-broker` (Mosquitto real em porta isolada, B1–B6).

### Garantias e riscos residuais da ponte

| Situação | O que acontece |
|---|---|
| Banco cai com a ponte de pé | A conexão com o broker continua; as mensagens esperam na fila com a hora de chegada e são gravadas quando o banco volta, ou vão para a carta morta passado o prazo. Cada uma termina gravada, recusada (com log) ou na carta morta |
| Erro permanente, fila cheia ou ponte encerrada (Ctrl+C) | Carta morta, com o motivo e o que já foi gravado (`partial`) |
| Firmware manda `bootId` + `sequence` | Idempotente como no HTTP: repetição é duplicata, não soma volume |
| Firmware **sem** `bootId`/`sequence` (o atual) | A ponte numera na sessão. Uma reentrega do broker (QoS 1 com PUBACK perdido) contaria duas vezes; não há como deduplicar sem o par do firmware |
| Ponte desligada ou reiniciando | **Sessão limpa de propósito.** O JSON não traz horário (a hora é a da chegada na ponte), então mensagens represadas no broker chegariam juntas, minutos depois, carimbadas como "agora". Publicado com a ponte fora não é gravado: sem amostra, sem linha. Mensagem retida é ignorada pelo mesmo motivo |
| **Processo da ponte morre** (kill -9, queda de energia) com mensagens na fila | **Elas se perdem**: já foram confirmadas ao broker e a fila vive na memória. É o risco residual aceito; o log mostra as tentativas e o tamanho da fila ao cair a conexão |
| ESP32 → broker em QoS 0 (PubSubClient) | Sem reenvio no Wi-Fi: perda possível antes de chegar ao broker |
| **Não prometido** | Entrega exatamente uma vez, ou pelo menos uma vez, de ponta a ponta |

**Para chegar a "pelo menos uma vez" de ponta a ponta (P1, depois do evento):**
- o firmware manda `bootId`, `sequence` e o horário NTP da leitura;
- publica em QoS 1;
- a ponte passa a usar sessão persistente e o horário do dispositivo.

**Restrição por dispositivo:**
- A ponte assina também `<tópico>/<dispositivo_id>`. Por esse tópico, o `dispositivo_id` do JSON tem de ser o do tópico, senão a mensagem é recusada.
- Com `MQTT_REQUIRE_DEVICE_TOPIC=true`, o tópico compartilhado deixa de ser aceito.
- Com a ACL do Mosquitto abaixo e um usuário por dispositivo (usuário = `dispositivo_id`), um equipamento só publica como ele mesmo:

```text
# mosquitto: password_file + acl_file
user richards-ponte
topic read richards/comercio/telemetria/#
pattern write richards/comercio/telemetria/%u
```

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

**Segurança:** diferente do HTTP, o MQTT não leva chave por dispositivo. A confiança do canal é o broker: quem consegue publicar no tópico pode se passar por qualquer `Device` da organização da demo. Por isso a ponte **fecha por padrão**:

- sem `MQTT_USERNAME` **e** `MQTT_PASSWORD`, ela só sobe com `DEMO_MODE="true"` (bancada) e avisa na partida;
- fora disso, recusa iniciar.

A ponte também só alimenta dispositivos da organização da bancada. Use só em rede de bancada isolada. Em produção:

- broker com TLS;
- usuário por dispositivo;
- ACL por tópico, ligando o tópico ao código do dispositivo;
- ou HMAC com a chave do dispositivo no payload.

## Bancada virtual (contingência de palco)

Se a bancada física falhar (placa, Wi-Fi, broker ou sensor), `pnpm bancada` move **vazão, temperatura/umidade e peso** sem placa e sem broker. Ela monta o mesmo JSON do firmware MQTT e o entrega, no próprio processo, à **mesma ingestão da ponte** (`MqttIngestion`). As regras são as reais: vazão pelo Device (1,5 L/min por 30 s), temperatura acima de 28 °C por 30 s, balança com 5 kg estáveis por 6 s, uma ocorrência ativa por tipo (regra 5) e lote só `PENDING_REVIEW` (regra 6). **Nenhuma regra é encurtada para caber na fala.**

**Honestidade, garantida no código:**

- Os três sensores são gravados como **`SIMULATED`**, qualquer que seja o `MQTT_SIMULATED_SENSORS`. A bancada virtual não mede nada.
- A evidência e a auditoria levam `channel: "bancada-virtual"`. A timeline da ocorrência diz "leituras SIMULADAS (bancada virtual)", e o autor é `simulador:<código>`.
- As leituras saem numa sessão própria (`bootId = bancada-<horário>`, sequência própria). Os cenários são determinísticos: oscilação por seno, nada aleatório, e o ensaio se repete igual.
- O `capturedAt` é o instante agendado de cada leitura, a cada 2 s, como a hora de medição do HTTP. Ele nunca fica no futuro, e se o envio atrasar mais de 1 s vale a hora real.
- O comando recusa rodar sem `DEMO_MODE="true"`, mostra o nome do banco na abertura (nunca a URL) e roda **uma instância por banco**, por trava de sessão no PostgreSQL.
- Ctrl+C libera a trava e fecha o banco. Banco fora: a leitura é registrada como perdida e nada é reconstruído depois.
- Ela só precisa do banco do `.env` (o Postgres do `docker compose` em `127.0.0.1:5432`). Não depende do site.

### Antes de subir no palco

```bash
pnpm palco:checar          # SÓ LEITURA; sai com código 1 se houver FALHA
pnpm bancada --preparar    # mostra o que vai encerrar e pede "SIM" (ou --confirmar, sem terminal interativo)
```

O `palco:checar` mostra:

- `DEMO_MODE` e o nome do banco;
- a regra do dispositivo e os marcos que ela produz no cenário `palco`;
- as ocorrências ativas por tipo, indicando quais **bloqueiam** a bancada pela regra 5: só as SIMULADAS do dispositivo (a bancada grava SIMULATED). A `richards-oc-01` do seed bloqueia. Uma ocorrência REAL ativa aparece como AVISO: ela não bloqueia a bancada e não é tocada pela preparação;
- o lote da balança aguardando verificação;
- se existe pelo menos um lote `RESERVED` para a entrega do roteiro;
- a data da última leitura do seed (envelhecido: use o filtro **30 dias**);
- leitura do sensor real no último minuto;
- **vazão de outra fonte** no dispositivo nos últimos 10 s (ponte `pnpm mqtt`, ESP32 pelo HTTP ou `pnpm simulate`), de qualquer origem. No `pnpm palco:checar --sensores VAZAO` isso é **FALHA**, com a idade da leitura mais nova (o `palco:checar` é uma fotografia: se você acabou de parar a ponte, espere 10 s e rode de novo). No `palco:checar` sem `--sensores` é AVISO, porque o pré-voo também serve para a bancada física. O `pnpm bancada` com VAZAO (o padrão simula os três) espera até 6 s e só recusa o palco se chegar leitura nova nesse tempo;
- a trava de outra bancada **neste** banco (uma trava em outro banco do mesmo servidor não conta);
- outra bancada rodando, os processos `run-mqtt`/`run-bancada-virtual` desta máquina, e o `/api/health` do site com o desvio de relógio.

O `--preparar` passa para **DISMISSED** cada ocorrência **SIMULADA** ativa de fluxo ou temperatura do dispositivo, pelo `OccurrenceService`, com:

- a nota "Cenário simulado encerrado na preparação do palco";
- o autor `preparacao:<usuário do Windows>`.

Ele também **cancela** o lote SIMULADO da balança pendente, com o motivo "lote de ensaio encerrado na preparação do palco". Tudo fica auditado e **nada é apagado**. Registros REAIS (ocorrência ou lote com origem DEVICE) nunca são tocados para facilitar a demonstração: se forem de ensaio, uma pessoa os resolve pelo BI, com nota. Ocorrências de outros tipos (ex.: `DEVICE_OFFLINE`) também não são tocadas.

**O cenário `palco` recusa começar** se houver ocorrência SIMULADA ativa dos tipos que ele vai disparar ou lote SIMULADO da balança pendente, e sugere o `--preparar`.

### No palco

```bash
pnpm bancada --cenario palco --inicio-em 5
```

Deixe o comando já digitado no terminal. A primeira leitura sai 5 s depois do Enter, e os sensores ficam parados por 20 s antes de a vazão subir. **Para a vazão subir às 02:10 da fala, dê Enter às 01:45.** Se você parou a ponte menos de 10 s antes do Enter, o comando ainda confere por até 6 s se chega leitura dela antes da contagem: pare a ponte pelo menos 10 s antes, ou dê Enter 6 s mais cedo. Ao trocar para a Sala, diga em voz alta: **"SIMULAÇÃO"**. Os selos mostram SIMULADO.

| T | Leitura (a cada 2 s) | O que acontece | Quem faz o quê |
|---|---|---|---|
| −20 a 0 | Vazão 0 · 24,6 °C, ~60% · 0,0 kg | Painéis com sinal, nenhuma ocorrência | Troca para a Sala e diz "SIMULAÇÃO" |
| 0 | Vazão 2,4 L/min | A regra de fluxo começa a contar (o log mostra `regra de fluxo N/30 s`, decidido pela regra) | "A regra não dispara com um pico: espera fluxo contínuo" |
| +8 a +22 | Temperatura sobe até 29,6 °C; a 1ª acima de 28 °C sai em T+18 | | |
| **+30** | | **UNUSUAL_FLOW** aberta (HIGH), SIMULATED | Abre a gaveta → **Assumir investigação**. "Suspeita não é vazamento comprovado" |
| ao Assumir (limite T+55) | Vazão 0 | A vazão fecha na leitura seguinte | |
| **+48** | 29 a 30 °C | **TEMPERATURE_EXCURSION** aberta (MEDIUM): 30 s acima de 28 °C | "É um indício a verificar, não uma perda; o DHT11 tem ±2 °C" |
| 15 s depois (limite T+75) | Esfria até 25 °C | A 1ª leitura do resfriamento já fica abaixo de 28 °C | |
| ao Resolver (limite T+70) | 3,1 kg → 6,06 → ~6,12 kg | Caixa na balança | Nota de resolução **honesta**: "Simulação: fluxo encerrado na bancada virtual" (nunca "registro fechado") |
| **caixa + 8 s** | | **Lote de 6,0 kg `PENDING_REVIEW`** (menor leitura estável, arredondada para baixo, depois de 6 s estável) | "A balança não decide que é doável: uma pessoa decide" |
| +100 a +160 | Tudo parado | Fim, com o resumo no terminal | Segue para Doações (lote Reservado → Confirmar entrega) e Relatórios |

**É reativo:** o comando lê no banco (só leitura, a cada 1 s e antes de cada leitura) o status das ocorrências que abriu.

- **Assumir** a de fluxo fecha a vazão.
- **Resolver** ou **descartar** a de fluxo põe a caixa na balança.
- **Resolver ou descartar direto, sem Assumir**, pode cair no meio da gravação de uma leitura ainda acima do limiar. Aí a regra abre outra ocorrência do mesmo tipo (a regra 5 permite: a anterior já não está ativa). O log mostra `OCORRÊNCIA de fluxo REABERTA (<id>)`. A bancada mantém a do roteiro, trata o fluxo como encerrado (fecha a vazão e põe a caixa) e lista a reaberta no resumo final. Descarte a reaberta no BI. Com a temperatura é igual: a reaberta faz esfriar. Para evitar, siga o roteiro: **Assumir** primeiro.
- **Tratar** a de temperatura a esfria.

Se ninguém mexer no BI, ele segue sozinho pelos limites da tabela, e sem reação o lote sai em T+78. A abertura do comando imprime os marcos esperados **calculados com as regras configuradas**, rodando o cenário nas próprias políticas de domínio. Se alguém mudou a regra do Device ou as variáveis `MQTT_*`, os horários impressos mudam junto, e o comando avisa se algo deixou de disparar.

**O que dizer, e o que não dizer:**

- Diga "SIMULAÇÃO" ao começar.
- Não diga "tempo real" nem "em menos de 1 s" sem ter medido no ensaio.
- Litros observados não são litros economizados, e fluxo suspeito não é vazamento comprovado.
- O lote só fica disponível depois da verificação humana.

### Outros cenários (ensaio)

| `--cenario` | O que faz | Resultado esperado |
|---|---|---|
| `ocioso` | Sensores parados até Ctrl+C | Painéis com sinal, nada abre |
| `vazao` | 2,4 L/min a partir de T0, fecha ao Assumir (limite T+45) | UNUSUAL_FLOW em T+30 |
| `pico` | 3 L/min por 10 s, 5 vezes, com 10 s fechada entre eles | **Nada abre**: responde a "e se for só lavar a mão?" |
| `calor` | Temperatura sobe a partir de T0 | TEMPERATURE_EXCURSION em T+40 |
| `carga` | Caixa de ~6,1 kg em T0, retirada em T+30 | Lote de 6,0 kg `PENDING_REVIEW` em T+8 |

Outras opções:

- `--sensores VAZAO,TEMP,PESO`: escolhe o que a bancada virtual simula (padrão: os três). Com a ponte ligada, só **TEMP** e/ou **PESO** podem ser simulados à parte (veja abaixo). A vazão, não.
- `--dispositivo`: padrão `RICHARDS-FLOW-001`; os apelidos de `MQTT_DEVICE_ALIASES` valem.
- `--ajuda`: lista as opções.

**Bancada física e virtual juntas:** as duas usam o mesmo dispositivo, mas a regra 5 é por origem: uma ocorrência SIMULADA ativa não bloqueia a do sensor real, e o contrário também não. Duas reais ativas do mesmo tipo continuam impossíveis.

**A ponte não descarta um sensor só.** Enquanto o ESP32 publica, `pnpm mqtt` grava a vazão dele (o potenciômetro, como SIMULATED pelo padrão `MQTT_SIMULATED_SENSORS="VAZAO"`) no mesmo dispositivo. A regra de fluxo lê o histórico da mesma origem sem separar sessão, então os zeros da ponte intercalados com os 2,4 L/min da bancada cortam o fluxo contínuo e a UNUSUAL_FLOW nunca abre. Por isso:

- **Se a vazão física falhou:** pare a ponte (Ctrl+C no `pnpm mqtt`) e rode a bancada virtual com os **três** sensores (o padrão). Também serve só `--sensores VAZAO`, desde que a ponte esteja **parada** (ou que o firmware tenha deixado de mandar a vazão).
- **Se só a temperatura ou a balança falhou:** a ponte pode continuar, e a bancada simula só esse sensor (`--sensores TEMP` ou `--sensores PESO`).
- O `pnpm bancada` com VAZAO confere a vazão de outra sessão no dispositivo. Se houver leitura dela nos últimos 10 s, ele mostra a idade da mais nova e espera até 6 s. **Recusa o palco só se chegar leitura nova nessa espera**, porque então a ponte (ou o firmware) ainda está gravando ("Pare a ponte pnpm mqtt ou desligue a vazão no firmware"). Leituras de uma ponte que acabou de parar não recusam: elas ficam antes da primeira leitura da sessão e o palco começa depois da espera. A espera conta as leituras novas no banco e não compara relógios. Confira antes com `pnpm palco:checar --sensores VAZAO`.

## Canal ao vivo (SSE) para as telas

Toda gravação que muda o que as telas mostram avisa o navegador sem consulta periódica. O caminho é: `NOTIFY` no PostgreSQL (canal `richards_events`), depois o hub do servidor (`src/modules/realtime/infrastructure/event-hub.ts`, um `LISTEN` por processo), depois `GET /api/live/stream` (Server-Sent Events) e por fim o `EventSource` do navegador (`src/lib/live-client.ts`).

**Garantias:**

- O `NOTIFY` sai **dentro da mesma transação** da gravação. O PostgreSQL só o entrega no `COMMIT`, então rollback, conflito ou erro não avisam nada.
- O stream e o snapshot passam pela mesma Basic Auth do BI (`src/proxy.ts`).
- O evento leva o **mínimo** para a tela decidir se refaz a busca. Os números (KPIs, somas, contagens) sempre vêm do servidor, nunca do evento somado no navegador.
- Não viajam:
  - nome de quem recebeu a doação;
  - quem verificou o lote;
  - notas;
  - o usuário do operador, que é metade da credencial Basic. O autor sai como `operador`, e o banco e a auditoria guardam o autor completo.
- Payload acima de 7500 bytes vira `resync`, e a tela busca de novo.
- `sensor.live` (temperatura, umidade e peso da bancada) é **efêmero** (`persisted: false`). Ainda não tem série no banco, então nunca entra em KPI.

**Quadros do SSE:**

| Quadro | Quando | Conteúdo |
|---|---|---|
| `hello` | Ao abrir e a cada volta da escuta do banco | `{ serverTime, listening }`. A tela refaz o snapshot, porque o que passou com a escuta fora não é reenviado |
| `heartbeat` | A cada 15 s, e na hora em que a escuta do banco cai | `{ serverTime, listening }` |
| `live` | Cada evento da organização | `LiveEvent` versionado (`src/modules/realtime/domain/live-event.ts`) |

**Eventos (`type`):**

- `reading.created`: leitura gravada, com origem, canal (`http`, `mqtt` ou `bancada-virtual`) e o **progresso da regra decidido pelo servidor**. A tela nunca interpola entre leituras.
- `occurrence.opened` e `occurrence.status`. Os dois levam a origem (`source`), para a mudança de estado de registro SIMULATED também sair carimbada (regra 1). O autor sai mascarado.
- `donation.created` (manual ou balança) e `donation.status`. O `donation.status` leva a origem e só o nome da instituição.
- No `sensor.live`, a balança traz a fase decidida pela ponte:
  - `idle`, `stabilizing`, `triggered` e `disarmed`;
  - **`blocked`**, quando a pesagem estável não virou lote porque já há lote desta balança aguardando verificação. O evento leva `pendingLotId` e a Sala diz "já existe lote desta balança aguardando verificação · nada novo criado".
- `sensor.live`, `message.rejected` (só o motivo, nunca o conteúdo) e `resync`.

**Cabeçalhos:**

- `Cache-Control: no-cache, no-transform`. Sem o `no-transform`, a compressão do `next start` segura os eventos.
- `X-Accel-Buffering: no`.
- O primeiro pedaço sai imediatamente (`retry: 3000` + `hello`).
- Limite de 40 streams por processo; acima disso responde 503 e a tela passa para a consulta periódica.

**Sem stream:**

- No BI, o sinal da pílula do topo consulta a cada 5 s e os painéis, a cada 15 s.
- A pílula diz o estado real: Ao vivo, Reconectando…, Consulta a cada 5 s, ou Servidor indisponível · números parados.
- Com o stream ao vivo, ainda há uma busca de segurança: 30 s para o sinal e 60 s para os painéis.
- A Sala ao vivo (`/ao-vivo`) consulta o snapshot (`GET /api/live/snapshot`) a cada 5 s.
- Atrás de um proxy (Cloudflare Tunnel, Traefik), confira se o proxy não guarda a resposta em buffer. O heartbeat de 15 s mantém a conexão viva.
