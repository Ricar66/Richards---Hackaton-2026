# Publicação do RICHARDS na VPS da Tétria

> **No ar desde 06/11/2026, por IP: http://187.77.229.205:8090.**
> Decisão do Ricardo no mesmo dia: "não vamos usar subdomínio, iremos fazer por IP mesmo".
> O primeiro roteiro (Cloudflare Tunnel + Access em `richards.tetriabrasil.com.br`) ficou como alternativa no fim deste arquivo.

## Auditoria de segurança (06/11, tarde) e plano de HTTPS — AGUARDA AUTORIZAÇÃO

Nada abaixo foi aplicado na VPS, no Coolify, no DNS ou na Cloudflare. O levantamento foi só de leitura.

### Achados

| # | Gravidade | Achado | Evidência |
|---|---|---|---|
| S1 | **P0** | Basic Auth em **http**: a senha do operador trafega legível na rede (Wi-Fi do evento) | `http://187.77.229.205:8090`, sem TLS |
| S2 | P1 | A porta 8090 publicada pelo Docker fica aberta para a internet inteira (passa por cima do `ufw`) | `ss -ltnp`; teste externo |
| S3 | P1 | O "Simular alerta" (`/api/admin/simulate`, `DEMO_MODE=true`) fica acessível a quem tiver a senha | Atrás do Basic Auth; os registros saem carimbados SIMULATED |
| S4 | P2 | O Coolify entrega o `.env` do recurso a todos os serviços: o banco também recebe a senha do operador | Verificação independente (S5/P3) |
| S5 | P2 | O web roda como root no contêiner | Falta `USER node` no Dockerfile |
| OK | — | PostgreSQL sem porta no host, `scram-sha-256`, só na rede do recurso; segredos fora do git, dos logs e dos bundles; vizinhos intactos | Verificação independente 12/12 |

**Por que não sslip.io:** o proxy do Coolify já tem Let's Encrypt (desafio HTTP na porta 80), mas `sslip.io`, `nip.io` e `traefik.me` não estão na Public Suffix List (conferido em 06/11). O limite de 50 certificados por semana fica dividido com o mundo todo e falha com frequência. Não serve para dia de evento.

### Opção A (recomendada): Cloudflare Tunnel + Access em `richards.tetriabrasil.com.br`

- **TLS:** de ponta a ponta até a Cloudflare.
- **Login por e-mail (One-time PIN)** antes de chegar ao app.
- **8090 fechada para a internet.**
- **Precisa do Haroldo**, uns 15 min:
  1. **Access:** aplicação self-hosted para o hostname, política **Allow** com os e-mails da equipe e da banca, sessão de 24 h, sem Bypass.
  2. **Túnel `tetriabrasil`:** rota pública `richards.tetriabrasil.com.br` → `http://127.0.0.1:8090`, sem `httpHostHeader` e **sem tocar na regra final** (Elora). O CNAME fica proxied.
- **Depois (Ricardo ou eu, com autorização):** no recurso `richards-demo`, `VPS_BIND_ADDR=127.0.0.1` + **Redeploy**. A 8090 passa a ouvir só no loopback.

### Opção B (sem o Haroldo): quick tunnel da Cloudflare

- **O que dá:** HTTPS com URL `https://<aleatória>.trycloudflare.com`. Não usa conta, DNS nem o túnel da Elora. O controle de acesso continua sendo o Basic Auth, agora **dentro do TLS**.
- **Limites:** a URL muda a cada reinício, não há garantia de disponibilidade (é para teste) e não há login por e-mail.
- **Passos na VPS** (o `cloudflared` 2026.8.3 já está lá):

```bash
systemd-run --unit=richards-quick-tunnel /usr/local/bin/cloudflared --no-autoupdate tunnel --url http://127.0.0.1:8090
journalctl -u richards-quick-tunnel -n 50 | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com'
```

- **Depois:** `VPS_BIND_ADDR=127.0.0.1` + Redeploy, como na opção A.

### Testes de aceite (antes de anunciar a URL)

| Teste | Esperado |
|---|---|
| `curl -sI https://<host>/api/health` | 200, `"database":"up"` (opção A: 302 para o Access) |
| `curl -sI https://<host>/` sem senha | 401 (opção B) / 302 para o Access (opção A) |
| Navegador com a senha da VPS | BI ao vivo; `/ao-vivo` em "Ao vivo" (o SSE atravessa o túnel) |
| De fora: `curl -m 5 http://187.77.229.205:8090/` | Recusado ou timeout |
| `https://elora.tetriabrasil.com.br/api/health` | 200 (vizinha intacta) |

### Rollback (sem apagar dados)

1. No recurso `richards-demo`, `VPS_BIND_ADDR=0.0.0.0` (ou apague a variável) + Redeploy: volta o acesso direto por IP.
2. Opção B: `systemctl stop richards-quick-tunnel`. Opção A: Haroldo remove a rota e a aplicação do Access.
3. O volume `richards_vps_pgdata` não é tocado em nenhum caminho.

## Como está no ar

| Item | Valor |
|---|---|
| Endereço | `http://187.77.229.205:8090` (BI em `/`, Sala ao vivo em `/ao-vivo`, saúde em `/api/health`) |
| Coolify | projeto **RICHARDS** (`vejbym56yieujkya75vn36in`) · ambiente **demo** (`zummmht1qmzi6sv4eiblwywj`) · recurso **richards-demo** (`hgqhwyshnq0r3fqwrevyae4l`) |
| Código | repositório público `Ricar66/Richards---Hackaton-2026`, branch congelada **`deploy/vps-hackathon`**, compose `/docker-compose.vps.yml` |
| Deploy automático | **Desligado.** A VPS não segue o `main`; publicar de novo é Redeploy manual no Coolify |
| Outras opções do recurso | "Inject Build Args to Dockerfile" e "Connect to Predefined Network" desligados; valores das variáveis ocultos nos logs; nenhum domínio no proxy |
| Banco | `richards-db` (Postgres 16) só na rede do compose, volume `richards_vps_pgdata`. **Só dados reais desde 06/11** (`docs/DADOS_REAIS.md`); backup antes da limpeza em `/root/.richards-deploy/backups/` |
| Broker MQTT | `richards-mqtt` na porta **1883** (pública), com senha e ACL, mais a ponte `richards-ponte`. Ver "Broker MQTT da bancada" abaixo |
| Variáveis | `VPS_POSTGRES_PASSWORD`, `VPS_OPERATOR_USER` (`equipe`), `VPS_OPERATOR_PASSWORD`, `VPS_IOT_DEVICE_KEY`, `VPS_MQTT_BRIDGE_PASSWORD`, `VPS_MQTT_DEVICE_USER` (`hortifruti_01`) e `VPS_MQTT_DEVICE_PASSWORD`, só de execução |
| Credenciais | Geradas na VPS (`openssl rand -hex`), em `/root/.richards-deploy/credenciais.env` (600). Cópia local em `.env.vps.local`, fora do git. Guardar no Passbolt |

## Riscos aceitos (acesso por IP)

- **A senha do Basic Auth trafega em texto puro (http).** Quem estiver na mesma rede, como o Wi-Fi do evento, consegue ler. Mitigação: a senha é própria da VPS (24 caracteres aleatórios, nunca a de laboratório do notebook), o usuário é neutro e o banco só tem dados SIMULATED. Trocar a senha e desmontar até 08/11.
- **A porta publicada pelo Docker passa por cima do `ufw`**, que só libera 22, 80 e 443. Por isso a 8090 abre sem regra nova, como a `:3000` do NewCraft.
  - A proteção real das portas administrativas é a cadeia `DOCKER-USER` → `CODECRAFT-ADMIN`, que derruba 8000, 6001, 6002 e 8080 vindas de fora.
  - Qualquer porta nova em `0.0.0.0` fica pública na hora.
- A rota de telemetria (`/api/iot/telemetry`) aceita POST de qualquer origem com a chave do dispositivo. A chave da VPS é aleatória e diferente da do notebook. **Não ligar o ESP32 na VPS durante o evento:** o firmware HTTP não tem TLS.
- Não há limite de tentativas no Basic Auth. Com 96 bits de senha aleatória, tentar por força bruta não é viável.

## Broker MQTT da bancada (06/11, noite; autorizado pelo Ricardo)

O Victor manda os dados dos sensores da bancada dele para a VPS desde a noite de 06/11, para o histórico de 07/11 nascer do sensor. A ideia veio do PR #4, incorporada sem as partes inseguras: Postgres exposto, broker anônimo e Grafana `latest` com admin padrão.

- **`richards-mqtt`:**
  - imagem própria (`mosquitto/`): Mosquitto 2.1.2 travado por digest;
  - `allow_anonymous false`;
  - senha e ACL geradas na partida a partir das variáveis.
- **ACL:**
  - o usuário do dispositivo (`hortifruti_01`, igual ao `dispositivo_id` do firmware) só **escreve** no próprio tópico, `richards/comercio/telemetria/hortifruti_01`;
  - a ponte roda com `MQTT_REQUIRE_DEVICE_TOPIC=true` e confere que o `dispositivo_id` do JSON é o do tópico: um equipamento não fala em nome de outro (achado da revisão de segurança automática);
  - a ponte só **lê**;
  - anônimo e senha errada são recusados.
- **`richards-ponte`:** o mesmo build do site rodando `pnpm mqtt`, que grava pelos casos de uso do HTTP, com fila, retentativa e carta morta no volume `richards_vps_mqtt`.
- **Origem:** a vazão vem do potenciômetro, então é **SIMULATED** (`VPS_MQTT_SIMULATED_SENSORS=VAZAO`). Temperatura (DHT11) e balança (HX711) entram como dado real.
- **Segredos:** `9-mqtt-segredos.sh` gera e grava, sem imprimir:
  - `VPS_MQTT_BRIDGE_PASSWORD`;
  - `VPS_MQTT_DEVICE_USER`;
  - `VPS_MQTT_DEVICE_PASSWORD`.

  A cópia local fica em `.env.vps.local`, fora do git. O Victor recebe a senha do dispositivo **em mensagem privada**, nunca no grupo.

**O que o firmware do Victor precisa:**

| Campo | Valor |
|---|---|
| Broker | `187.77.229.205`, porta `1883` (sem TLS) |
| Usuário | `hortifruti_01` |
| Senha | a de `VPS_MQTT_DEVICE_PASSWORD` (privada) |
| Tópico | **`richards/comercio/telemetria/hortifruti_01`** (só esse: o compartilhado é recusado pelo broker) |
| Payload | `{"dispositivo_id":"hortifruti_01","VAZAO":2.4,"TEMP":26.1,"UMIDADE":60,"PESO":0.0}` |
| Publicação | QoS 0 ou 1, **sem `retain`** (mensagem retida é ignorada pela ponte) |

**Riscos aceitos até 08/11:**
- MQTT sem TLS: a senha do dispositivo trafega aberta.
- A 1883 publicada pelo Docker passa por cima do `ufw`.

Mitigações: a senha é própria e aleatória, a ACL é por usuário e não há acesso anônimo. Na desmontagem, troque as senhas.

**Testes de aceite** (`teste-acl-broker.mjs`, sem gravar dado):
- anônimo recusado;
- senha errada recusada;
- dispositivo publica só no próprio tópico;
- não publica no compartilhado nem em nome de outro sensor;
- não lê;
- a ponte não escreve.

**Desligar só o broker, sem apagar dados:** `VPS_MQTT_BIND_ADDR=127.0.0.1` no Coolify e Redeploy (a 1883 sai da internet). Para tirar de vez, volte o compose ao commit anterior na branch de deploy e faça Redeploy.

## Como foi criado (sem token da API)

A sessão de 06/11 não criou token da API do Coolify. O recurso foi criado pelos modelos internos do Coolify, executados com `php` dentro do contêiner `coolify`, repetindo o caminho de `ApplicationsController::create_application` para um repositório público:

1. `Project::create` (team 0) e `environments()->create(['name' => 'demo'])`.
2. `new Application` com `source` = "Public GitHub" (`GithubApp` 0), o destino único do servidor `localhost` e as opções acima.
3. As 4 variáveis com `is_runtime = true` e `is_buildtime = false`.
4. `LoadComposeFile`, depois `queue_application_deployment(...)`. O deploy aparece normalmente na lista do recurso no painel.

Os segredos vão para dentro do contêiner num arquivo temporário com permissão 600, apagado no fim. Nenhum valor passa pelo terminal nem pelo log.

**Antes de escolher a porta, confira ao vivo** com `ss -ltnp`. Em 06/11 a `127.0.0.1:18082` do primeiro roteiro já era do `woodpecker-server` (CI).

## Operação

- **Publicar uma versão nova:** atualize a branch `deploy/vps-hackathon` (`git branch -f deploy/vps-hackathon main` e push, sem forçar) e clique em **Redeploy** no recurso. O banco e os dados continuam no volume.
- **Só dados reais:**
  - depois do Redeploy, `ETAPA=limpar` do `8-dados-reais.sh` roda `pnpm dados:limpar-simulados --apagar --confirmar` no contêiner `web`, com backup antes (`ETAPA=antes`);
  - a instituição real: `docker exec <web> pnpm instituicao:cadastrar --nome "..." --cidade "..."`.
- **Liberar o palco na VPS:** sem o seed fictício, não há mais a `richards-oc-01`. Ocorrência REAL ativa se resolve pelo BI, com nota.
- **Login menos de 1 h antes de apresentar**, com a aba já aberta. O navegador guarda o Basic Auth até ser fechado.

## Checklist pós-deploy (06/11/2026)

Registrar cada item como PASSOU, FALHOU ou NÃO EXECUTADO.

| # | Verificação | Esperado | Resultado |
|---|---|---|---|
| 1 | Deploy no Coolify | `finished`; `web` e `richards-db` healthy | PASSOU: `tp17dqtcbljhqizfee28fyus`, de 11:11 a 11:14 UTC; `web` healthy 27 s depois de subir |
| 2 | `ss -ltnp` na VPS | `0.0.0.0:8090` do docker-proxy; banco sem porta no host | PASSOU |
| 3 | `GET /api/health` de fora | 200 com `"database":"up"` | PASSOU (pela rede da Tracbel) |
| 4 | `GET /` sem senha | 401 com `WWW-Authenticate: Basic` | PASSOU (de dentro da VPS e de fora) |
| 5 | `GET /` com a senha da VPS | 200 | PASSOU; `/ao-vivo` e `/api/live/snapshot` também 200 |
| 6 | `GET /api/live/stream` com a senha | `text/event-stream`, `no-cache, no-transform` | PASSOU; `hello` com `"listening":true` |
| 7 | Liberar o palco | `richards-oc-01` DISMISSED | PASSOU: OPEN → DISMISSED pela API, com nota |
| 8 | Vizinhos | `https://elora.tetriabrasil.com.br/api/health` OK; woodpecker na 18082 intocado | PASSOU: 200 e 200 |

### Verificação independente (06/11/2026, dois verificadores separados)

**Jornada no Chrome contra a VPS: PASSOU 7/7.**
- BI e Sala chegam ao estado ao vivo.
- Um "Simular alerta" (POST `/api/admin/simulate`) apareceu na Sala e no BI antes da própria resposta HTTP: o `NOTIFY` sai no COMMIT. Em seguida foi encerrado como DISMISSED, com nota.
- PDF com `X-Report-Provenance: SIMULATED`.
- 0 erros de JavaScript em 7 telas; sem senha, 401.

**Exposição e segredos: PASSOU 12/12.**
- De fora, só a 8090 abre; 5432, 18080, 18081, 18082, 9010 e 20241 dão timeout.
- Banco sem porta no host. Web e banco só na rede do recurso, sem rota do Traefik.
- Os 4 segredos não aparecem: logs do deploy, git (histórico completo), bundles do Next, labels e temporários (0 ocorrências).
- Vizinhos intactos. Nenhum token novo no Coolify.

**Pendências para depois do evento (P3):**
- O Coolify entrega o `.env` do recurso a todos os serviços, então o banco também recebe a senha do operador e a chave do sensor.
- O web roda como root no contêiner: falta `USER node` no Dockerfile.
- O recurso segue o topo da branch `deploy/vps-hackathon`: confira o commit antes de cada Redeploy.

## Desmontagem (até 08/11)

- No Coolify, **Stop** no recurso `richards-demo`. A porta 8090 fecha junto.
- Trocar as senhas ou apagar o `/root/.richards-deploy/credenciais.env` e a cópia local `.env.vps.local`.
- Apagar o recurso, o volume `richards_vps_pgdata` e o projeto RICHARDS **só com autorização expressa** (regra 9).

## Alternativa não usada: Cloudflare Tunnel + Access (padrão da Elora)

Para voltar a esse modelo:

1. No `docker-compose.vps.yml`, troque a porta por `"127.0.0.1:<porta livre>:3000"`. A 18082 está ocupada.
2. Peça ao Haroldo:
   - a aplicação no Cloudflare Access (política Allow com os e-mails da equipe, sem Bypass);
   - a rota no túnel para a porta local, sem `httpHostHeader` (quebra a proteção CSRF do `src/proxy.ts`) e sem tocar na regra final, que é da Elora;
   - o CNAME proxied.
3. Redeploy.

O heartbeat de 15 s do `/api/live/stream` fica abaixo do corte de ociosidade de 100 s da Cloudflare. O `no-transform` impede a compressão de segurar os eventos.
