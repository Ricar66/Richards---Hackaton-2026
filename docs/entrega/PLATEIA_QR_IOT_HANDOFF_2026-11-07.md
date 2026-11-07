# Handoff 07/11/2026 — IoT + Experiência QR Code da plateia

> **Estado:** implementação versionada SOMENTE em develop. A main continua estável e é a branch do Coolify.
> **Regra operacional:** antes de liberar main, executar build, testes e ensaio de 70 espectadores na VPS; NÃO atribuir resultado PASSOU a testes que não foram executados.

## Objetivo

A partir do feedback de Victor: MQTT chegava ao terminal, a vazão aparecia no BI, mas temperatura e peso não estavam visíveis no dashboard de monitoramento. A célula HX711 informada suporta nominalmente 5 kg de carga total; limiares de 6/6,2 kg são impraticáveis. Ricardo pediu também um QR para 50 a 70 visitantes escanearem e acompanharem os sensores simultaneamente em seus telefones, sem fornecer login do operador.

## Arquitetura implementada

- **Ponte física ESP32 → broker Mosquitto → processo de ponte (pnpm mqtt) → casos de uso + PostgreSQL.** JSON original do Victor permanece o mesmo: dispositivo_id, VAZAO, TEMP, UMIDADE, PESO, com bootId + sequence opcionais. Nenhuma mudança necessária no contrato JSON.
- **Roteamento MQTT:** src/iot/mqtt-payload.ts (agora mínimo de balança PADRÃO 1,5 kg por 6s), src/iot/mqtt-ingestion.ts (sem reescrever regra de ingestão), src/modules/monitoring/domain/scale-surplus-detector.ts (sem mudança; um lote por carga, só rearma abaixo da metade do gatilho, e pendente bloqueia outro).
- **VPS/Coolify:** docker-compose.vps.yml injeta MQTT_SCALE_MIN_KG da variável VPS_MQTT_SCALE_MIN_KG com fallback 1.5 e MQTT_SCALE_STABLE_SECONDS fallback 6 na ponte. Não são variáveis do container web.
- **BI:** src/components/bi/live-sensors.tsx reutiliza o SSE já estabelecido pelo LiveStreamProvider (não cria EventSource extra); injeta temperatura, umidade e peso no Centro de Controle, Monitoramento e Dispositivos. CSS em src/app/globals.css. O status sempre carimba origem e expira leituras antigas.
- **Público:** /plateia carrega src/components/plateia/plateia-live.tsx e src/app/plateia/plateia.css: tela responsiva sem navegação administrativa, 4 leituras, origem real/simulada, sinal de conectividade, último lote da balança aguardando verificação. Não traz dados pessoais, segredos ou ações de mutação.
- **Stream público:** GET /api/plateia/stream, implementação em src/app/api/plateia/stream/route.ts. É uma whitelist de tipos por src/modules/audience/public-feed.ts: reading.created → vazão; sensor.live → temperatura/umidade/peso; donation.created origin=scale → só peso do lote e rótulo. Não encaminha payload original, UUID, operador, notas, destinatário, identificação interna ou configurações sensíveis. A rota filtra orgId do evento ANTES da projeção, e jamais serializa orgId. É pública apenas para GET e HEAD, liberados explicitamente no src/proxy.ts. O /api/live/stream administrativo continua Basic Auth.
- **Fan-out:** LiveEventHub mantém um único pg.Client com LISTEN por processo. Cada espectador usa um SSE leve, sem SELECT periódico por visitante. No máximo 110 streams da plateia POR PROCESSO, separados dos 40 streams do operador. Um cache volátil de até 24 leituras por tipo/dispositivo e por no máximo 2min ajuda quem entrou depois; no celular só exibir leitura dos últimos 35s (não chamar leitura velha de atual). Cliente com backpressure excessivo é desconectado, podendo reconectar. Heartbeat a cada 15s.
- **Convite:** /convite fica sob Basic Auth no layout do BI. Exibe o SVG em /qr-plateia.svg e o link público. O SVG já foi gerado OFFLINE para http://187.77.229.205:8090/plateia, sem token e sem serviço de terceiros. Script para regenerar: scripts/entrega/gerar_qr_plateia.py.
- **Limitações declaradas:** temperatura e peso continuam eventos efêmeros (persisted:false); não são tabelas históricas do PostgreSQL, e atualizar página aguarda próxima amostra. O sensor físico, o broker, a rede pública e os 70 celulares AINDA precisam ser verificados. 110 é limite de código, NÃO certificado de capacidade. Sem teste físico não anunciar 'medição real validada'.

## Entradas e URLs

- Página do visitante: http://187.77.229.205:8090/plateia
- QR projetável: /convite (com autenticação do operador)
- SVG público (não possui segredo): /qr-plateia.svg
- SSE público: /api/plateia/stream (apenas GET; Content-Type text/event-stream)
- Sala de palco existente: /ao-vivo (com autenticação do operador)
- BI: /, /monitoramento, /dispositivos (com autenticação)
- Broker: MQTT_TOPIC e MQTT_DEVICE_ALIASES precisam coincidir com o dispositivo e ACL; ver docs/CONTRATO_IOT.md e docs/DEPLOY_VPS_TETRIA.md.

## Regerar QR ao mudar o host

Se a apresentação migrar para DNS/HTTPS ou trocar de IP/porta:
1. Atualizar a constante PUBLIC_URL de src/app/(bi)/convite/page.tsx.
2. No ambiente local, instalar a dependência SOMENTE para geração do ativo: python -m pip install qrcode.
3. Executar: python scripts/entrega/gerar_qr_plateia.py --url https://HOST/plateia.
4. Conferir o QR com câmera de dois celulares e validar a URL. Versionar public/qr-plateia.svg junto com a URL da página.
5. NÃO gerar QR com credenciais, querystring de admin, x-device-key ou token.

## Plano de ensaio final P0

1. Git fetch e confirmar develop e main. Não modificar main automaticamente.
2. pnpm install --frozen-lockfile; pnpm db:generate; pnpm typecheck; pnpm lint; pnpm test; pnpm test:integration (só richards_test); pnpm build. Registrar saídas reais. Não executar migrate reset nem db push --force-reset.
3. Subir cópia de homologação com VPS ou Docker local. Confirmar /convite com senha, /plateia sem senha, /api/plateia/stream sem senha e /api/live/stream NEGADO sem senha. Testar rede 4G e Wi-Fi do auditório: a porta 8090 pode ser bloqueada. Se bloqueada, configurar domínio HTTPS por reverse proxy, regenerar QR.
4. Na ponte, conferir status de conexão com Mosquitto e tópico do ESP32, e comparar payload recebido com o Device cadastrado. Filtro MQTT_REQUIRE_DEVICE_TOPIC da VPS exige tópico terminado em /dispositivo_id. Ver logs de rejeição e carta morta, nunca colar senhas em evidências.
5. Victor: primeiro calibrar HX711, descontar tara e confirmar faixa útil com pesos conhecidos de 0,5kg, 1kg e 1,5kg (se todo o conjunto suportar). 5kg é CAPACIDADE NOMINAL, não limiar obrigatório. Nada acima da carga útil permitida; a estrutura apoiada sobre célula também pesa. Corrigir firmware se houver gatilho de 6/6,2kg no código dele; firmware MQTT ainda não está versionado aqui.
6. Acompanhar no BI e na /plateia amostras DHT11, HX711, vazão, origem física/simulada. Aumentar peso estável acima de 1,5kg por 6s; conferir UMA criação PENDING_REVIEW, sem salto para AVAILABLE. Descarregar e repetir; com lote pendente não duplicar. Sem amostra, o visual deve mostrar sem dado recente.
7. Testar 70 conexões pelo comando de carga abaixo de FORA da VPS, junto com carga MQTT real/simulada carimbada. Acompanhar CPU/RAM e proxy Next/reverse proxy; resultados e tempos ficam em evidências. A capacidade final não se infere do número de código.

## Comando de ensaio de audiência

    node scripts/plateia-carga.mjs http://IP-DA-HOMOLOGACAO:PORTA/api/plateia/stream 70 25

A saída registra quantos dos 70 receberam HTTP 200, pelo menos um status, quantos frames de amostra chegaram, P95 de abertura, recusas e erros. Com sensores parados, framesSample=0 é normal; não representa falha do stream. **Para testar distribuições de leitura, publicar dados durante o ensaio**. Confirmar que as conexões são encerradas após aborto e que a CPU volta ao normal. Repetir para 50 e 70, mais 70 celulares físicos se disponíveis. Instrumentação do servidor: docker stats, contagem de sockets e logs; não fotografar segredos.

## Critérios de aceite e observações

| Item | Esperado | Estado em 07/11 |
|---|---|---|
| Código da plateia versionado em develop | SIM | IMPLEMENTADO, não validado em runtime |
| QR gerado localmente e URL pública documentada | SIM | IMPLEMENTADO, leitura por celular NÃO EXECUTADA |
| Limite de peso de 1,5kg configurado (software) | SIM | IMPLEMENTADO, calibração física NÃO EXECUTADA |
| Temperatura, umidade e peso visíveis no BI | SIM | IMPLEMENTADO, sem build/browser nesta sessão |
| Testes TypeScript, lint, unitários, integração e build | 0 erros | NÃO EXECUTADO nesta sessão |
| Pico de 70 conexões SSE na VPS real | 70/70 sem 503 nem desconexões anormais | NÃO EXECUTADO |
| Ensaio físico ESP32 → broker → BD → BI → plateia | leitura mesma origem e lote criado uma vez | NÃO EXECUTADO |
| Publicar na main / redeploy do Coolify | SOMENTE após aceite P0 | NÃO EXECUTADO |

## Riscos residuais e próximos passos para Claude

P0: conferir o fluxo físico de ponta a ponta, permissões de rede, conectividade MQTT e limite do peso; executar testes e carga com evidências. NÃO aprovar main sem isso. Em caso de falha, corrigir na develop e repetir os testes.

P1: persistir temperatura/umidade/peso com migração e DTO de histórico SOMENTE após decisão de produto e ensaio; hoje os eventos são explicitamente EFÊMEROS. Não confundir último lote registrado com impacto/entrega confirmada.

P1: se a VPS não aguentar 70 SSE com Next/porta 8090, usar proxy com suporte a stream e, se necessário, agregar fan-out em serviço dedicado. NÃO ocultar 503 nem afirmar a capacidade sem benchmark.

P1: colocar o QR em slide final/projetor; testes com rede do evento. HTTP puro na VPS e MQTT 1883 sem TLS são riscos da bancada, não prática adequada de produção. Recomenda-se HTTPS para o público e TLS/autenticação forte no MQTT depois do evento.

P2: ranking/engajamento opcional apenas com consentimento e sem coletar dados pessoais desnecessários. Evitar alterar a narrativa de verificação humana para prometer 'IA comprovou desperdício'.

## Arquivos revisados

- src/modules/audience/public-feed.ts
- src/app/api/plateia/stream/route.ts
- src/app/plateia/page.tsx e plateia.css
- src/components/plateia/plateia-live.tsx
- src/app/(bi)/convite/page.tsx
- public/qr-plateia.svg
- scripts/entrega/gerar_qr_plateia.py e scripts/plateia-carga.mjs
- src/components/bi/live-sensors.tsx, views/control-center.tsx, views/monitoring.tsx, views/devices.tsx, src/app/globals.css
- src/proxy.ts, tests/proxy.test.ts, tests/plateia.test.ts
- src/iot/mqtt-payload.ts, docker-compose.vps.yml, .env.example, tests/mqtt.test.ts

**Claude:** leia este documento ANTES de qualquer nova edição sobre IoT/plateia. Seguir AGENTS.md e MEMORIA.md e preservar a separação develop/main. Todos os registros de testes físicos anteriores permanecem pendentes até serem efetivamente executados.
