# Handoff para Claude — IoT + plateia QR (07/11/2026)

**Status:** código integrado na branch **develop**; main/VPS estável **não foi alterada** nesta entrega. Nada aqui equivale a validação do sensor físico ou a benchmark da VPS.

## O pedido e a solução

Victor informou: vazão aparece no site, peso e temperatura aparecem no payload do terminal mas não no BI; a célula de carga disponível é de **5 kg**, portanto o limiar de ~6 kg não é utilizável. O usuário pediu também QR Code projetado para a banca, com cerca de **50–70 smartphones simultaneamente** acompanhando leituras reais, sem compartilhar a senha do painel, e documentação para continuidade no Claude.

### Rotas

- **`/plateia` — PÚBLICA.** Landing mobile de somente leitura com vazão (L/min), temperatura (°C), umidade (% UR), peso (kg), origem `DEVICE`/`SIMULATED` e último lote da balança aguardando verificação. Leituras somem após 35 segundos, nunca aparecem como dados atuais indefinidamente.
- **`/api/plateia/stream` — PÚBLICA, GET SSE.** PostgreSQL LISTEN/NOTIFY via **mesmo `LiveEventHub`** do BI, um ouvinte PostgreSQL por processo Next; até 110 espectadores SSE por processo, limite explícito para a apresentação de 70 + reconexões. Eventos **projetados por whitelist**, NUNCA o payload bruto dos eventos internos (sem orgId, IDs privados, pessoa que recebeu, notas, operadores).
- **`/convite` — PRIVADA (Basic Auth do operador).** Tela para projetar QR Code e link. QR gerado offline em `public/qr-plateia.svg`, utilitário `scripts/entrega/gerar_qr_plateia.py`.
- **`/api/live/stream` — PRIVADA.** Stream do BI existente continua com limite próprio de 40, sem novos espectadores misturados. Demais APIs de escrita e relatórios permanecem autenticadas; proxy possui whitelist pública de *caminhos exatos*, não prefixes.

### Arquivos principais

- `src/modules/audience/public-feed.ts`: contratos de saída da plateia, exaustivos e sanitizados; **nunca** repassar um `LiveEvent` inteiro para visitantes.
- `src/app/api/plateia/stream/route.ts`: SSE por espectador, conexão única do hub ao Postgres, heartbeat 15s, memória efêmera curta apenas para reconexões; **não consulta Prisma por espectador**.
- `src/components/plateia/plateia-live.tsx`, `src/app/plateia/plateia.css`, `src/app/plateia/page.tsx`: experiência mobile responsiva.
- `src/components/bi/live-sensors.tsx`: tiles DHT11/HX711 no BI (Centro, Monitoramento, Dispositivos); reutiliza EventSource de `LiveStreamProvider`, sem abrir streams extras; **`sensor.live` não é série persistida**.
- `src/proxy.ts`, `tests/proxy.test.ts`, `tests/plateia.test.ts`: whitelist e testes anti-vazamento.
- `src/iot/mqtt-payload.ts`: `MQTT_SCALE_MIN_KG` padrão agora **1.5 kg**; `MQTT_SCALE_STABLE_SECONDS` 6 segundos; é gatilho de negócio, não especificação do hardware. Nunca pesar acima da capacidade TOTAL da célula (incluindo caixa/tara). Conferir calibração do HX711 e ruído com Victor.
- `docker-compose.vps.yml`: variável opcional `VPS_MQTT_SCALE_MIN_KG` passada à ponte; confirmar no Coolify se já existe override. Não commitar segredos.
- `public/qr-plateia.png`: cópia rasterizada adicional, não usada pelo convite. O QR oficial do convite é SVG.

## URL oficial do QR

A URL atualmente embutida é **`http://187.77.229.205:8090/plateia`**, conforme deploy existente da VPS, ainda apontando à `main` anterior. O código novo só aparece lá após merge/redeploy AUTORIZADO de main. A porta 8090 sobre HTTP é uma limitação de laboratório; validar no **4G de vários celulares** e Wi-Fi do evento. Não colocar qualquer segredo no QR.

Para trocar a URL, execute:

```bash
python -m pip install qrcode
python scripts/entrega/gerar_qr_plateia.py --url "https://HOST/plateia"
```

Atualize também `PUBLIC_URL` em `src/app/(bi)/convite/page.tsx` no mesmo commit e revise a whitelist se trocar a mídia oficial.

## Critérios de aceite — não inferir PASSOU

1. **Teste de código**: `pnpm install --frozen-lockfile && pnpm db:generate && pnpm typecheck && pnpm lint && pnpm test && pnpm build` na máquina com dependências; integração PostgreSQL somente no banco de TESTES, não no banco público.
2. **Contrato IoT**: Victor confirma ESP32 `dispositivo_id=hortifruti_01`, tópico `richards/comercio/telemetria/hortifruti_01` (ACL da VPS exige sufixo), aliases, bridge conectada. Sem leitura persistida de DHT11/HX711, SSE só enquanto o processo está recebendo. Dados simulados identificados como `SIMULATED`; vazão do potenciômetro é simulação.
3. **Célula de 5 kg**: aferir tara/calibração com três cargas conhecidas, observar no terminal e nas telas. Com gatilho 1,5 kg, seis segundos contínuos **efetivamente estáveis no detector**, criar apenas um lote `PENDING_REVIEW`; esvaziar para rearmar. O lote não é entrega e depende de revisão humana.
4. **Permissões**: sem credencial, GET `/plateia` e `/api/plateia/stream` devem abrir; GET `/`, `/convite`, `/api/live/stream`, `/api/donations` devem pedir Basic Auth. Nunca expor token em navegador/QR.
5. **70 smartphones**: começar local/teste; depois (com autorização da equipe) rodar `node scripts/plateia-carga.mjs --url http://HOST:PORT/plateia --clients 70 --seconds 20`. Teste confirma abertura simultânea dos SSE com status `listening=true`. **A capacidade real da VPS não está verificada só porque o limite é 110**; avaliar latências, conexões 200/503, CPU, memória, browser real e se os pacotes chegam. Não apontar o teste à VPS sem aprovação operacional.

### Procedimento de handoff e publicação

- Trabalhar **exclusivamente na develop**, confirmar HEAD antes de qualquer alteração: há edições de várias pessoas/ferramentas.
- `main` é estável e o Coolify **não** faz autodeploy. Depois de typecheck + lint + testes + físico + carga, abrir PR de `develop` → `main`; só merge com aprovação.
- Depois de merge/redeploy, validar `/api/health`, QR em 4G, SSE de 70 aparelhos, entrada do payload real e log de ponte MQTT.
- Se houver falha, manter main anterior e desligar a página pública revertendo o merge/redeploy; nada de apagar banco para corrigir.

### Riscos / escopo não entregue

- Tensão do sinal e alimentação do ESP32 (GPIO 3,3 V), tara e capacidade física não são testáveis pelo GitHub.
- DHT11 e HX711 ainda não são séries persistidas: ao entrar depois de uma leitura, só se verá o próximo evento. Para histórico confiável, planejar migrations e retenção separadamente.
- `EventSource`/SSE não é garantia de entrega exatamente uma vez; reconnect recebe estado recente de memória do **processo** por até dois minutos, não replay global entre instâncias.
- 70 conexões não foram comprovadas em produção. Não declarar PASSOU sem script e testes reais.
- HTTP e MQTT sem TLS na VPS não são aceitáveis como arquitetura de produção; restringir/encerrar acesso após o evento e rotacionar senhas.

**Status dos testes nesta execução:** QR PNG gerado/decodificado localmente (**PASSOU**); testes TypeScript, build, Postgres, hardware e carga na VPS (**NÃO EXECUTADOS** nesta sessão por falta de ambiente com dependências/rede/ESP32). Não inventar logs.
