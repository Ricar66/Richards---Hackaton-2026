## ESTADO ATUAL — 07/11/2026, noite (depois do pitch): rumo ao Empreenda 2027

**Leia isto antes das seções abaixo; elas são o histórico.**

- **Escopo voltou ao modelo anterior (decisão do Ricardo, 07/11):** água, temperatura, balança e doações exatamente como estavam até `29cb92f`.
  - A mudança para só água (PR #11, `feat/water-flow-mapping`) foi desfeita, menos o mapa.
  - O PR #10 (Circular) segue fechado; a proposta está em `docs/propostas/RICHARDS_CIRCULAR.md`.
- **Mapa hidráulico mantido** (`/mapa`, item "Mapa hidráulico" no menu):
  - modelos de casa, comércio ou prédio em construção;
  - vistas 3D (padrão), planta e perspectiva;
  - um medidor FLOW por ponto, da mesma unidade, com versão auditada e bloqueio entre abas.
  - **Migração:** `20261107190000_water_map` é aditiva e só cria `HydraulicMap`.
  - **Cena 3D:** `src/components/water-map/three/map-scene.ts`, no padrão do gêmeo da Sala:
    - sob demanda, com volta à perspectiva vetorial se faltar WebGL2, a GPU for por software, o contexto se perder ou o orçamento estourar;
    - só anima o ramal do ponto com medidor e leitura recente acima de zero;
    - pausa e "reduzir movimento" congelam.
- **VPS desmontada (07/11, 19h40):**
  - o recurso `richards-demo` e o projeto RICHARDS foram apagados no Coolify (`DeleteResourceJob`, sem limpeza geral de imagens);
  - saíram contêineres, volumes do banco e do broker, redes e `/root/.richards-deploy`;
  - as portas 8090 e 1883 estão livres;
  - os 35 contêineres dos outros projetos não foram tocados.
  - **Backups:** os 7 dumps (inclusive o final, `richards-vps-antes-final-desmontagem-20261107T223918Z.dump`) estão em `E:\CraftOps\backups\richards\vps-final\`, com SHA256 conferido.
  - **Pendências do Ricardo:** revogar o token do `@Richardshack_bot` no BotFather e conferir o gasto da chave OpenAI.
  - **URLs mortas:** o QR (`public/qr-plateia.svg`) e o `/convite` ainda apontam para `http://187.77.229.205:8090/plateia`, que não existe mais. Regerar quando houver um endereço novo.
- **Vídeos do pitch:** ficou só o RICHARDS v1, de 06/11 à noite (`reels-gpt6-astra/media/richards`, `public/richards/{app,120,180}`, `out/richards/{120,180}`). O v2 e o v3 foram para a Lixeira do Windows.
- **Banco local do notebook:** em 07/11 às 17:23 recebeu por engano 25 leituras SIMULATED e 1 UNUSUAL_FLOW SIMULATED aberta. A bancada da versão só água ignorava `--ajuda`; a bancada restaurada trata as opções corretamente. Limpeza: `pnpm dados:limpar-simulados --apagar`, com backup antes e só com autorização.
- **Próximo passo:** preparar o RICHARDS para o Empreenda Senac 2027.
  - **Estratégia, regras e fontes:** [`docs/empreenda/ESTRATEGIA_EMPREENDA_2027.md`](docs/empreenda/ESTRATEGIA_EMPREENDA_2027.md).
  - **Tese:** o registro de temperatura (RDC 216, item 4.8.18) é a garantia sanitária que torna o excedente doável (Lei 15.224/2025, art. 14, §1º), e a água entra no mesmo kit.
  - **Riscos de elegibilidade:** matrícula no Senac SP na mesma categoria; "ideia ainda não implementada". Confirmar com a Comissão Organizadora.
- **Diferenciais em construção na develop** (escolha do Ricardo em 07/11: os quatro). Ordem: base → Passaporte do Alimento (QR) → Loja em 3D ao vivo → Placar de impacto → Relatório de 1 clique.
  - **Fase 1 (base) feita, `/frio` "Cadeia do frio":**
    - `ColdEquipment` (geladeira, freezer, câmara fria, balcão quente, ambiente) e série `TemperatureReading`, migração aditiva `20261108120000_cold_chain`.
    - Faixas na letra da RDC 216 (< 5 °C, ≤ −18 °C, > 60 °C) em `src/modules/cold-chain/domain/cold-chain.ts`. Limite próprio só aperta a norma.
    - A ponte MQTT grava 1 leitura por minuto por equipamento (`MQTT_TEMP_PERSIST_SECONDS`) e toda virada de faixa, de forma idempotente.
    - Tempo na faixa conta só o período com dado; buraco nunca é "na faixa".
    - O seed cadastra "Estoque · bancada (DHT11)" como AMBIENTE até 28 °C: o DHT11 mede a sala, não uma geladeira.
  - **Fase 2 feita (08/11), Passaporte do Alimento:** página PÚBLICA `/p/<token>`, aberta pelo QR da etiqueta do lote.
    - **Dados:** migração aditiva `20261108130000_food_passport`. O lote ganha `passportToken` (128 bits, hex, nasce com o lote) e `originEquipmentId` (declarado na triagem). Lote antigo: botão "Emitir passaporte" na gaveta (auditado `PASSPORT_ISSUED`).
    - **Triagem:** a gaveta exige o equipamento de origem (ou "não estava em equipamento monitorado") e mostra a temperatura dele desde 24 h antes da pesagem ANTES do checklist. O que o responsável viu vai para a auditoria (`coldEvidence`), calculado no servidor.
    - **Página pública:** veredito em uma linha, carimbos da jornada, temperatura do equipamento (24 h antes da pesagem até a entrega/cancelamento ou agora, teto de 7 dias), triagem com checklist e Lei 15.224, art. 14, §1º, destino. Cancelado diz "não distribua nem consuma".
    - **Privacidade (testada com mutação):** nunca saem quem recebeu, notas, motivo do cancelamento, operador, ids e o nome completo de quem atestou (só "Paula M."). Cargo/habilitação sai como foi escrito (a gaveta avisa).
    - **Honestidade do gráfico:** eixo = janela inteira, linha quebra em buraco (> 10 min), fora da faixa pela regra da norma; "% na faixa" só fica verde com cobertura ≥ 80% e sem excursão. Lote simulado usa só série simulada.
    - **Proxy:** libera só `^/p/[a-f0-9]{32}$` em GET/HEAD. Gaveta, QR (`/api/donations/[id]/passport-qr`), etiqueta (`/etiqueta/[id]`) e APIs seguem privados.
    - **QR:** `uqr` 0.1.3 (MIT, zero dependências, só no servidor). Endereço: `RICHARDS_PUBLIC_URL` ou o host de quem abriu o BI; localhost gera aviso, porque celular não abre.
    - **Validado:** unitários 179/179, integração 130/130, E2E 38/38 (B6 abre sem senha num contexto anônimo, B7), ensaio visual 10/10 em 390 e 1280. **NÃO EXECUTADO:** celular físico lendo a etiqueta impressa e impressora de etiqueta real.
  - **Fase 3, parte A feita (08/11), maquete 3D realista no `/mapa`** (pedido do Ricardo: "água em vários pontos, em 3D realista, casa, prédio…"):
    - **Planta humanizada em metros:** piso de madeira, porcelanato, azulejo, grama, paver e concreto (texturas geradas em código), paredes cortadas na altura do peito com portas, móveis por tipo de cômodo e louças por tipo de ponto.
    - **Quatro modelos:** Casa (12 × 7,6 m, 9 pontos); Comércio (mercadinho com padaria, 18 × 11,4 m, com lavatório exclusivo de mãos no preparo); **Prédio** (novo: térreo, 3 andares × 2 aptos, cobertura com caixa d'água e **um hidrômetro por apartamento**); Obra (lajes, betoneira, lava-rodas).
    - **Campos novos na planta (opcionais; plantas salvas continuam válidas):** `rooms[].type`, `rooms[].floor`, `nodes[].fixture`, `nodes[].floor`; tipo `BUILDING`. Sem migração (a planta é JSON).
    - **Código:** domínio em `src/modules/water-map/domain/layout.ts`; planejador PURO e testado em `src/components/water-map/three/site-plan.ts` (portas, paredes, poses, canos, móveis); construtor three em `three/map-scene.ts`; rótulos sem encavalar em `label-layout.ts`.
    - **Regras mantidas:** água só corre (no cano e saindo da torneira) com medidor vinculado e leitura recente > 0; pausa e reduzir movimento congelam; sombra calculada uma vez; desenha sob demanda; orçamento de quadro → volta à perspectiva 2D.
    - **Navegação:** arrastar gira, Ctrl + roda aproxima (a roda sozinha rola a página), botões +/−/vista inicial; no toque, "Explorar 3D" liga o giro. Prédio: "Prédio inteiro" (andares separados a 4,4 m) ou um pavimento; a planta 2D também filtra por pavimento ("↕ prumada").
    - **Armadilha:** `PCFSoftShadowMap` foi REMOVIDO no three 0.186 (vira `PCFShadowMap` com aviso). Use `PCFShadowMap` + `shadow.radius`.
    - **Validado:** unitários 191/191, integração 130/130, E2E 38/38, ensaio na GPU Intel 15/15 (4 modelos, água correndo com bancada SIMULADA a 57–59 fps, p95 16,8 ms, pausa, reduzir movimento, giro, celular 390, 0 erros). **NÃO EXECUTADO:** projetor, celular físico e aparelhos sem GPU dedicada além deste notebook.
    - **Banco local do notebook (08/11):** aplicadas as migrações aditivas pendentes (assistant_telegram, water_map, cold_chain, food_passport), com backup antes em `E:\CraftOps\backups\richards\notebook-antes-maquete-20261108T143748Z.dump`.
    - **Próximo (parte B):** equipamentos de frio na maquete do comércio, coloridos pela situação na RDC 216, com o registro de 30 dias ao clicar.

## Atualização 07/11/2026 — plateia QR + IoT (develop, NÃO main)
Leia ANTES de atuar: docs/entrega/PLATEIA_QR_IOT_HANDOFF_2026-11-07.md.
- /plateia e /api/plateia/stream são públicos e SOMENTE leitura; /convite é protegido. Nunca enviar eventos privados brutos.
- 70 visitantes é alvo de teste, não capacidade comprovada. Limite de código: 110 SSE por processo. Ensaio: scripts/plateia-carga.mjs.
- Gatilho balança MQTT: 1,5 kg por 6s, célula nominal 5 kg, calibrar/tarar carga TOTAL.
- Temperatura/umidade/peso no BI e plateia são eventos EFÊMEROS, sem histórico. Lotes só PENDING_REVIEW.
- QR SVG contém a URL http://187.77.229.205:8090/plateia; ao trocar host regerar SVG e editar convite no mesmo commit.
- Nenhum build, teste físico ou carga de 70 clientes foi validado nesta sessão; main intacta.

# MEMÓRIA DO PROJETO — RICHARDS Intelligence

> **Leia isto primeiro.** É o estado completo do projeto: o que é, onde está cada coisa, como rodar, o que foi decidido, o que falta e o que já deu errado.
> Atualizado em **06/11/2026**. Este arquivo **não contém senhas nem chaves**: elas ficam só no `.env` local, que nunca vai para o git.

---

## 1. O que é

**RICHARDS Intelligence** é um protótipo para o **Hackathon Senac Ribeirão Preto, 6 e 7 de novembro de 2026**. O nome homenageia Ellen Swallow Richards. **Nunca chamar o produto de SALVA**, que foi o nome antigo.

A equipe tem 4 pessoas: 2 de desenvolvimento e 2 de IoT. O Victor cuida do ESP32 e da bancada. Duas jornadas:

- **A · Água:** sensor de vazão (ESP32 + YF-S201) → API → ocorrência *suspeita* de fluxo contínuo → operador investiga e resolve → BI e PDF.
- **Bancada MQTT do Victor (PR #3):** um ESP32 com vazão (potenciômetro), DHT11 e balança HX711 publica num broker. A ponte `pnpm mqtt` grava pelos mesmos casos de uso do HTTP: fluxo, temperatura e lote de doação aguardando verificação.
- **B · Alimentos:** lote de excedente → verificação humana documentada → reserva para instituição → entrega confirmada com nome de quem recebeu → impacto em kg.

Tese do pitch: *"o dado revela o desvio; a inteligência está em descobrir o que aconteceu depois"*. Rastreabilidade honesta, nunca número inventado.

## 2. Onde está tudo

| O quê | Onde |
|---|---|
| Código (máquina de desenvolvimento) | `E:\CraftOps\apps\web\richards-platform`, no HD externo `E:` |
| GitHub (público) | https://github.com/Ricar66/Richards---Hackaton-2026, branch `main` |
| Demo rodando | http://localhost:3000, com o container `web` do `docker compose`. **Só dados reais desde 06/11**: sem histórico fictício, o BI começa em "sem dados" e se enche com o ESP32 |
| Só dados reais (limpeza, instituição, volta atrás) | `docs/DADOS_REAIS.md`. Backups antes da limpeza: notebook em `E:\CraftOps\backups\richards\`, VPS em `/root/.richards-deploy/backups/` (modo 600) |
| Usuário, senha e chave do sensor | Só no `.env` local. Ver a seção 7 |
| Pacote original recebido (V4, intocado) | `Downloads\RICHARDS_PROJETO_INICIO_COMPLETO_V4_2026` (pasta e `.zip`) |
| Plano e prompt mestre | `docs/plano/` (`16_PROMPT_MESTRE.md` traz as regras invioláveis) |
| Registro de cada fase | `docs/FASE_0_BASELINE.md` … `docs/FASE_5_PDF_QA_DEMO.md` |
| Roteiro de palco (cliques e falas) | `docs/ROTEIRO_DEMO.md` |
| Kit de pitch | `presentation/imagens/`: 10 imagens oficiais 1920×1080. Fala de 5min40 e roteiro alinhados às 10 imagens e a quatro integrantes. Os 14 SVGs e `render_slides.py` são históricos, não usar para gerar o pitch oficial |
| Dicionário de dados, MER e DER | `docs/dados/`, explicado em `docs/dados/README.md` |
| Contrato do ESP32 | `docs/CONTRATO_IOT.md` |
| Firmware | `iot/esp32_richards/esp32_richards.ino` + `secrets.h.example` (HTTP). O firmware MQTT do Victor **ainda não está no repositório** |
| Ponte MQTT | `src/iot/` (`pnpm mqtt`); contrato em `docs/CONTRATO_IOT.md`, seção "Canal MQTT" |
| Sala ao vivo (telão) | `http://localhost:3000/ao-vivo` (tecla F = tela cheia). Roteiro em `docs/ROTEIRO_DEMO.md`, seção "Sala ao vivo" |
| Bancada virtual (contingência de palco) | `pnpm bancada` / `pnpm palco:checar`; contrato em `docs/CONTRATO_IOT.md`, seção "Bancada virtual" |
| Canal ao vivo (SSE) | `docs/CONTRATO_IOT.md`, seção "Canal ao vivo (SSE) para as telas" |
| Broker MQTT na VPS (bancada do Victor) | `187.77.229.205:1883`, usuário `hortifruti_01`, senha só em `.env.vps.local`/VPS (mandar ao Victor no privado). Senha + ACL, sem anônimo, sem TLS até 08/11 (risco aceito pelo Ricardo). Ver `docs/DEPLOY_VPS_TETRIA.md`, "Broker MQTT da bancada" |
| Demo na VPS da Tétria | **No ar desde 06/11 por IP: http://187.77.229.205:8090** (decisão do Ricardo: sem subdomínio nem Cloudflare). Coolify: projeto RICHARDS, ambiente `demo`, recurso `richards-demo`, branch `main` (desde 06/11 à noite; a `deploy/vps-hackathon` foi removida), auto deploy desligado. Credenciais da VPS em `.env.vps.local` (fora do git). Roteiro e checklist em `docs/DEPLOY_VPS_TETRIA.md` |

## 3. Regras invioláveis (do prompt mestre)

1. **Nada de número inventado.** Dado de demonstração é carimbado como `SIMULATED` no banco, na API, na UI e no PDF.
2. **Litros observados ≠ litros economizados. "Suspeito de vazamento" ≠ vazamento comprovado.**
3. Fluxo persistente é avaliado com limiar e tempo configuráveis por dispositivo (`minFlowLpm`, `continuousSeconds`).
4. Leitura é idempotente por `(deviceId, bootId, sequence)`.
5. No máximo **uma ocorrência ativa (OPEN/ACKNOWLEDGED) por dispositivo, tipo e origem**: nunca duas reais ativas no mesmo sensor e tipo, e uma simulada nunca bloqueia a real (nem o contrário). Refinado em 06/11 na auditoria final, como a FlowAlertPolicy, que já não mistura origem.
6. Lote só fica **AVAILABLE** com verificação humana documentada e só fica **DELIVERED** com quem recebeu.
7. Toda ação persistente tem autorização, transação e auditoria.
8. Segredo nunca vai para o navegador. Basic Auth e HTTP de laboratório não vão para produção.
9. **Nunca** rodar `prisma migrate reset`, `db push --force-reset`, exclusões amplas ou qualquer comando que apague dados sem autorização expressa.
10. Não inventar logs, builds ou resultados de teste. Relatar como **PASSOU / FALHOU / NÃO EXECUTADO**.
11. Não adicionar dependência sem justificar benefício, tamanho e compatibilidade.
12. Nunca commitar `.env`, `secrets.h` ou credenciais. Não reescrever o app do zero.

## 4. Combinados de trabalho (para quem continuar, inclusive IA)

- **Sempre em português**: respostas, avisos de progresso e documentos.
- O responsável deu **autorização ampla** para avançar sem perguntar a cada passo. Isso **não** vale para apagar dados ou expor segredos.
- Trabalhar e revisar direto, **sem subagentes** (pedido explícito).
- Cada entrega termina com: arquivos alterados e por quê, testes classificados, riscos e próximos passos (P0/P1/P2).
- **Duas branches desde 06/11:** `develop` (integração: todo trabalho e todo PR entram aqui) e `main` (estável: é o que a VPS publica e o que o GitHub mostra). O `main` só recebe a `develop` já testada. As branches antigas de pitch viraram as tags `arquivo/feat-pitch-*`; a `deploy/vps-hackathon` foi removida, e o Coolify lê o `main`.
- Commits pequenos na `develop`, mensagem em português descrevendo o porquê. O push para o GitHub usa a conta dona do repositório (Ricar66).
- Mais de uma pessoa ou ferramenta envia para o GitHub (o kit de pitch chegou assim). **Sempre fazer `git fetch` antes de enviar** e pôr o trabalho local por cima, com rebase ou merge. **Nunca forçar o push.**

## 5. Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · pnpm 10.16.1 · PostgreSQL 16 · Prisma 7.10 (adapter-pg, client gerado em `src/generated/prisma`) · Tailwind 4 · Recharts 2.15 · Zod 4 · pdf-lib · Docker Compose · ESP32 (Arduino).

Dependência só de desenvolvimento: `puppeteer-core` 24.43.1, para o E2E. Usa o Chrome instalado e não baixa navegador.

`mqtt` 5.16.1 (MIT, cerca de 2 MB, 32 pacotes): cliente MQTT da ponte da bancada. Roda só no processo `pnpm mqtt` e não entra no bundle do Next.

`three` 0.186.1 (MIT, zero dependências, versão exata) + `@types/three` 0.186.0 (desenvolvimento): gêmeo 3D opcional da Sala ao vivo.
- **Peso:** pedaço sob demanda de 137,6 KB gzip, que só é baixado com o 3D ligado. As rotas do BI e o primeiro quadro da Sala ganham 0 KB (medido no build).
- **Fica fora de propósito**, pela pesquisa de 06/11 (`docs/plano` não muda; o raciocínio está na seção 10):
  - React Three Fiber e drei: +115 a 150 KB, React fixo abaixo de 19.4 e uso de CDN escondido;
  - pós-processamento e bloom: cerca de 14 ms por quadro na GPU integrada;
  - Motion, GSAP, NumberFlow, Lottie, Rive e Spline.

## 6. Mapa do código

| Pasta | Conteúdo |
|---|---|
| `src/app/(bi)/` | BI nativo: `/`, `/monitoramento`, `/ocorrencias`, `/doacoes`, `/relatorios`, `/dispositivos`, com layout persistente (`BiShell`) e o provider do stream (`LiveStreamProvider`) por fora |
| `src/app/(palco)/` | Sala ao vivo (`/ao-vivo`), sem o BiShell, com CSS próprio escopado em `.stage` (`stage.css`) |
| `src/app/api/` | APIs: `iot/telemetry`, `analytics/{dashboard,interval,live,overview}`, `occurrences`, `donations`, `recipients`, `reports/summary`, `admin/simulate`, `health`, `live/stream` (SSE), `live/snapshot` (Sala) |
| `src/modules/realtime/` | Contrato do evento ao vivo (`domain/live-event.ts`, versionado), `public-actor.ts` (autor mascarado), hub LISTEN/NOTIFY (`infrastructure/event-hub.ts`) e `notifyLive`/`notifyLiveSafe` |
| `src/components/stage/` | Componentes da Sala: lógica pura (`stage-logic.ts`: água, alarme, dígitos e cadeia de reserva do 3D), redutor (`stage-model.ts`), gêmeo do cano (`pipe-twin.tsx` SVG; `twin-slot.tsx` decide SVG × 3D; `pipe-twin-3d.tsx` + `three/pipe-scene.ts` three imperativo; `twin-boundary.tsx`), `digits.tsx`, anel da regra, sensores, feed com FLIP, viagem do pacote |
| `src/components/bi/page-transition.tsx` | `<ViewTransition>` do React 19.3: deslize entre telas e crossfade na troca de filtro |
| `src/lib/use-flip.ts` | FLIP próprio (WAAPI) para listas |
| `src/lib/live-client.ts` | `EventSource` com estados (connecting/live/reconnecting/down), backoff e watchdog de 35 s |
| `src/app/intelligence/` | BI V3 antigo em iframe, só **contingência**. Tem o botão "← Voltar ao BI" |
| `src/components/bi/` | Shell, filtros, gráficos, gavetas (ocorrência, intervalo, doação), primitivas e telas em `views/` |
| `src/modules/analytics/` | Filtro na URL (`analytics-filter.ts`), `getDashboard` (agregação no fuso de São Paulo), `getInterval`, `getLive`, `reportFigures` |
| `src/modules/monitoring/` | Ingestão de telemetria, regra de fluxo (`FlowAlertPolicy`), abertura de ocorrência com advisory lock, transições e conectividade |
| `src/modules/donations/` | Fluxo do lote (`DonationWorkflow`) e serviço com guarda otimista + auditoria |
| `src/modules/reports/` | PDF (`buildReportPdf`, 2 páginas A4) sobre o mesmo DTO do BI |
| `src/proxy.ts` | Basic Auth do operador; define o autor (`x-richards-actor`) e descarta o valor vindo do cliente |
| `prisma/` | `schema.prisma`, 3 migrations e `seed.ts`. O seed é idempotente e grava **só o cadastro-base** (empresa, unidade, sensor com o hash da chave e operador). O cenário fictício (`SIMULATED`) só entra com `SEED_DEMO_DATA="true"`, que é para teste e E2E |
| `src/modules/admin/` + `src/admin/` | Passagem para só dados reais (`limparSimulados`, inventário) e cadastro de instituição real, com auditoria (`pnpm dados:limpar-simulados`, `pnpm instituicao:cadastrar`) |
| `src/lib/ease.ts` | Contas de animação com progresso travado em [0, 1] (KPI, laço de quadro, pulso do 3D) |
| `iot/esp32_richards/` | Firmware: fila de 12, retentativa com a mesma `sequence`, NTP, 401 espera 30 s |
| `src/iot/` | Ponte MQTT: `mqtt-payload.ts` (JSON e configuração), `mqtt-ingestion.ts` (adaptador para os casos de uso, emite `sensor.live`), `mqtt-connection.ts` (fila em memória, retentativa, carta morta), `run-mqtt.ts`. Bancada virtual: `bancada-virtual.ts` (cenários determinísticos) e `run-bancada-virtual.ts` (`--checar`, `--preparar`, `--cenario`) |
| `scripts/` | `iot-simulator.mjs` (se comporta como o firmware), `e2e/` (jornadas no Chrome), `test-db-prepare.mjs`, `docs/` (geradores do dicionário e dos diagramas) |
| `tests/` | Unitários (`*.test.ts`) e integração no Postgres (`integration/`) |

## 7. Como rodar

```bash
# Demo (build de produção; aplica migrations e o seed do cadastro-base a cada start, sem dado fictício)
docker compose up -d --build           # http://localhost:3000 · saúde em /api/health
docker compose down                    # para SEM apagar dados (nunca usar -v)

# Só dados reais (docs/DADOS_REAIS.md): backup antes; sem --apagar só mostra o inventário
pnpm dados:limpar-simulados --apagar
pnpm instituicao:cadastrar --nome "Nome da instituição" --cidade "Ribeirão Preto"

# Desenvolvimento
pnpm install && pnpm db:generate && pnpm db:deploy && pnpm db:seed
pnpm dev

# Verificação
pnpm typecheck && pnpm lint && pnpm build
pnpm test                              # unitários, sem banco
pnpm test:integration                  # banco richards_test (nome precisa terminar em _test)
pnpm test:e2e                          # Chrome em :3100 no banco de teste
# --with-db-outage só num Postgres ISOLADO: E2E_DB_CONTAINER=<contêiner> + TEST_DATABASE_URL apontando para ele (o db da demo é recusado)
pnpm test:mqtt-broker                  # Mosquitto real em porta isolada (Docker), B1–B6

# Simulador do sensor (contingência no palco)
pnpm simulate --scenario leak --samples 14 --interval 4

# Ponte MQTT da bancada (processo separado; broker e variáveis MQTT_* no .env, ver .env.example)
pnpm mqtt

# Palco: conferir, liberar (DISMISSED/CANCELLED com auditoria, pede SIM) e bancada virtual (tudo SIMULATED)
pnpm palco:checar
pnpm bancada --preparar
pnpm bancada --cenario palco --inicio-em 5

# Documentação de dados
node scripts/docs/render-diagramas.mjs     # MER/DER → PNG, SVG e PDF (precisa de internet, Mermaid 11.12.0 via CDN)
python scripts/docs/dicionario_de_dados.py # dicionário em Excel (depois abrir no Excel e salvar para gravar as fórmulas)
```

**Acesso e credenciais** ficam no `.env` local, a partir do `.env.example`:
- `RICHARDS_OPERATOR_USER` e `RICHARDS_OPERATOR_PASSWORD`: login do BI (HTTP Basic de laboratório).
- `IOT_DEMO_DEVICE_KEY`: chave do sensor. Precisa ser igual à `RICHARDS_DEVICE_KEY` do `secrets.h` do ESP32.
- `POSTGRES_PASSWORD`, `DATABASE_URL` e `TEST_DATABASE_URL`: banco.

**Para trocar:**
1. Edite o `.env`.
2. Rode `docker compose up -d web`.
3. Se trocou a chave do sensor, rode também `pnpm db:seed`, que regrava só o hash, sem apagar nada. Depois atualize o `secrets.h` e grave o ESP32 de novo.

## 8. Estado por fase

| Fase | Commit | O que entregou |
|---|---|---|
| V3 original | `de7c41f` | Importação do kit V4 como recebido |
| 0 · Baseline | `c61e93c` | Instalação, Prisma, typecheck, lint, build e Docker verdes |
| 1 · Banco e contratos | `659344c` | Dados honestos, telemetria sem condição de corrida, auditoria, migrations versionadas |
| 2 · IoT e ocorrências | `d7809da` | Evidência real da ocorrência, conectividade calculada pelo último contato, simulador igual ao firmware |
| 3 e 4 · BI nativo e doações | `1ca4f63` | BI React com 6 telas, filtros na URL, gráficos sincronizados, mapa de calor e sinal ao vivo; doação com checklist, instituição, recebedor e motivo de cancelamento |
| 5 · PDF, QA e demo | `f999d81`, `f4a1a94` | PDF com os mesmos filtros e números do BI, E2E no repositório, roteiro de palco, favicon |
| Ajustes visuais | `f44dc3f`, `7aa9ba2` | Ponto de status no lugar de bordas coloridas; botão de volta na tela do V3; lint ignora `.e2e/` |
| Modelo de dados | `7cc89d1` | Dicionário em Excel (7 abas), MER (Chen) e DER (pé de galinha), conferidos contra o banco |
| Kit de pitch | `54d1e94`, `15ddc62`, `c9c14ef` | Pasta `presentation/` (slides, fala, roteiro, checklist de IoT, plano final), sem mudar o código |
| Memória | `ea40f3b`, `866e53b` | `MEMORIA.md` e `CLAUDE.md` |
| Galeria do pitch | `1940d59`, `012ebc5` | 10 imagens Full HD em `presentation/imagens/` |
| Unificação IoT (PR #3) | `37d5182` (Victor) + commits seguintes | Ponte MQTT do Victor passando pela ingestão existente: regra por dispositivo, regra 5 por tipo, lote da balança em `PENDING_REVIEW`, auditoria, origem SIMULATED para o potenciômetro |
| Tempo real e palco | branch `feat/tempo-real-palco`, integrada ao `main` em 06/11 | Stream ao vivo (LISTEN/NOTIFY + SSE) no BI inteiro; tema escuro com gêmeo digital esquemático; Sala ao vivo `/ao-vivo` para o telão; bancada virtual (`pnpm bancada`, `pnpm palco:checar`); revisão adversarial com 14 achados corrigidos; preparação do deploy na VPS (não publicado) |

| Auditoria final (prompt de hardening) | `7745513`, `99fe784`, `0e433b0`, `c6499f0`, `e8462ec` + commits da tarde de 06/11 | Ingestão, regra e ocorrência numa transação só; regra 5 por origem; ponte MQTT com fila e carta morta; auditoria de segurança da VPS com plano de HTTPS (aguarda autorização); E2E de queda só em banco isolado; ensaio do hackathon 14/14; revisão adversarial com 23 achados corrigidos; KPI sem número fora do intervalo; **só dados reais** no notebook e na VPS |

As branches `feat/fase-*` existem só na máquina de desenvolvimento e já estão incorporadas ao `main`. No GitHub existe também `feat/pitch-richards-hackathon-2026`, com o kit de pitch.

## 9. Testes (últimos resultados reais)

| Verificação | Resultado | Data |
|---|---|---|
| typecheck, lint e build de produção | PASSOU | 06/11/2026 (auditoria final, noite) |
| `pnpm test` (unitários) | PASSOU 112/112 | 06/11/2026 (auditoria final, noite) |
| `pnpm test:integration` (Postgres real, banco de teste) | PASSOU 98/98 na bateria final; depois, 30/30 em MQTT, tempo real e bancada com as correções da revisão de segurança (M3 12/12) | 06/11/2026 |
| `pnpm test:e2e --with-db-outage` (queda só num Postgres ISOLADO) | PASSOU 42/42 (inclui A2b: KPI nunca fora do intervalo; E1c: Sala diz que os números estão congelados) | 06/11/2026 |
| Ensaio do hackathon (12 passos do palco + duplicata, queda do banco isolado, SSE, retentativa) | PASSOU 14/14 com o código final | 06/11/2026 |
| `pnpm test:mqtt-broker` (Mosquitto real) | PASSOU 6/6 (B5: keepalive de 2 s, banco fora 9 s, 0 queda, 4/4 gravadas com a hora de chegada; B6: retida ignorada) | 06/11/2026 |
| Broker da VPS pela internet (auth + ACL) | PASSOU 7/7 (anônimo e senha errada recusados; dispositivo só no próprio tópico; ponte só lê; caminho broker → ponte confirmado sem gravar dado) | 06/11/2026 |
| Só dados reais (notebook e VPS) | PASSOU: backup, limpeza auditada, 0 SIMULATED depois, reinício não recria (notebook 170+3+3; VPS 168+4+3) | 06/11/2026 |
| `pnpm test:e2e` (sem queda de banco) | PASSOU 36/36. Inclui A2b (KPI nunca fora do intervalo), A2c (filtro mantém o foco), N1 (clique logo depois de navegar vale), S2–S5 (gêmeo SVG/3D, teclas 3 e P) | 06/11/2026 |
| Ensaio dos efeitos da Sala (`next start` + bancada + Chrome 1920×1080) | PASSOU 11/11. Água a 60 fps (p95 16,8 ms); hachura e contorno simulados; alarme pulse → steady ao assumir; P para o alarme piscando; reduzir movimento; 21 textos do número grande, todos de leituras reais; 4 pulsos em 8 s com a bancada; 0 erros | 06/11/2026 |
| Ensaio do gêmeo 3D (GPU Intel real, ANGLE D3D11) | PASSOU 16/16. three fora dos scripts iniciais das 7 rotas (pedaço sob demanda de 137,9 KB gzip); 60 fps (p95 16,8 ms, 15 draw calls); perda de contexto → loading em 8 ms → 3D num canvas novo em 369 ms; 2ª perda fica no SVG; religar passa por loading; maior tarefa longa ao religar 123 ms; reduzir movimento, sem WebGL e GPU desligada caem no SVG; 0 pedidos externos; 0 erros | 06/11/2026 |
| 3D no projetor real | **NÃO EXECUTADO** (sem acesso ao projetor do evento): ensaiar antes de ligar no palco | — |
| Ensaio de palco de ponta a ponta (`next start` + `pnpm bancada --cenario palco` + `/ao-vivo` no Chrome 1920×1080, banco de teste) | PASSOU: 91 leituras SIMULATED (0 perdidas), UNUSUAL_FLOW em T+30, TEMPERATURE_EXCURSION em T+48, lote de 6,0 kg PENDING_REVIEW; atraso servidor → tela de cada leitura: mediana 19 ms, máximo 69 ms; 0 erros de JavaScript | 06/11/2026 |
| Revisão adversarial do diff (4 lentes + verificadores) | 14 achados confirmados (2 P0, 1 P1, 11 P2/P3), todos corrigidos com teste; correções verificadas por um segundo cético (testes de mutação) | 06/11/2026 |
| Ponte MQTT de ponta a ponta (Mosquitto 2.1.2 em Docker + `pnpm mqtt` no banco de teste) | PASSOU: JSON inválido e id desconhecido descartados, 7 leituras SIMULATED, 1 ocorrência de temperatura e 1 lote PENDING_REVIEW de 6,2 kg, com auditoria | 04/11/2026 |
| ESP32 MQTT do Victor contra a ponte | **NÃO EXECUTADO** (sem placa nesta máquina; firmware MQTT fora do repositório) | — |
| Dicionário × banco (colunas, tipos, nulos, padrões, ordem, enums, FKs, índices) | PASSOU, 0 divergências | 03/11/2026 |
| Compilação do firmware | **NÃO EXECUTADO** (download do arduino-cli bloqueado) | — |
| ESP32 físico com a plataforma | **NÃO EXECUTADO** (sem placa) | — |
| Leitor de tela real | **NÃO EXECUTADO** (só teclado e atributos ARIA conferidos) | — |

## 10. Decisões tomadas, e por quê

**Interface e BI**
- **O BI é React nativo; o V3 em iframe virou contingência** (`/intelligence`). O iframe não compartilhava filtros, estado nem acessibilidade.
- **O filtro mora na URL**, para a investigação ser compartilhável. O mesmo objeto alimenta o dashboard, o detalhe de intervalo e o PDF, então os números são iguais por construção.
- **Volume e vazão ficam em gráficos separados**, nunca com dois eixos Y.
- **Intervalo sem leitura aparece como "sem dados"**, nunca zero. A variação contra o período anterior só aparece se o período anterior tiver pelo menos 50% das amostras.
- **Conectividade é calculada pelo último contato** (mais de 120 s sem leitura = sem comunicação). `Device.state` só vale para MAINTENANCE.

**Só dados reais (decisão do Ricardo, 06/11)**
- **Escopo:** a demo, no notebook e na VPS, fica sem dado fictício.
  - Saíram as leituras, ocorrências e lotes `SIMULATED` e as duas instituições "· Demonstração", com backup antes.
  - O comando foi `pnpm dados:limpar-simulados`: transação, auditoria `SIMULATED_DATA_PURGED` e trava que só apaga o que é SIMULATED.
  - Ele recusa se a bancada estiver ligada.
- **O seed não recria nada:** grava só o cadastro-base. O cenário fictício só entra com `SEED_DEMO_DATA="true"` (teste e E2E).
- **Instituição real:** cadastrada pelo terminal (`pnpm instituicao:cadastrar`), porque não há tela. Nome com "Demonstração" é recusado.
- **A simulação continua como reserva de palco:** tudo carimbado SIMULADO. Depois do evento, a mesma limpeza.
- **`palco:checar` no modo de dados reais:**
  - ocorrência REAL ativa no sensor é FALHA, porque impede o alerta ao vivo do sensor real;
  - lote REAL da balança pendente é FALHA (antes nem aparecia);
  - falta de instituição ativa é FALHA.
  - A preparação nunca toca no registro real: quem resolve é o operador, pelo BI.

**Broker MQTT (PR #4 do Victor, 06/11)**
- **O PR #4 não foi mesclado como veio.** Ele expunha o Postgres (`5432:5432`), abria o broker anônimo em todas as interfaces, punha Grafana `latest` com admin padrão e colocava as variáveis `MQTT_*` no `web`, que não roda a ponte: ninguém gravaria as mensagens.
- **A ideia entrou assim:**
  - `mosquitto/`: imagem própria, com senha e ACL geradas na partida;
  - `richards-mqtt` + `richards-ponte` no `docker-compose.vps.yml`;
  - perfil `iot` no `docker-compose.yml` local (`docker compose --profile iot up -d`, porta no loopback por padrão);
  - crédito ao Victor no commit.
- **Verificação do PR #4 (06/11, noite):** continua com 1 commit (`cb71160`), mira o `main` e **conflita** com ele no `docker-compose.yml`. O conteúdo seguro já está no `main` (`f39c917`, com o Victor como coautor). Fechar ou comentar o PR é decisão do Ricardo. Uma contribuição nova do Victor deve vir como PR para a `develop`.
- **Grafana fica de fora:** leria o banco sem o carimbo de origem (regra 1) e seria mais uma porta exposta.

**Regras de dados**
- **Uma ocorrência ativa por dispositivo, tipo e origem**, garantida por `pg_advisory_xact_lock` + verificação na mesma transação. Não há constraint no banco.
- **Ingestão atômica:** leitura, regra, ocorrência e `NOTIFY` numa transação só. Se a ocorrência falha, a leitura volta atrás e a retentativa do firmware não vira "duplicata" (antes a ocorrência se perdia).
- **Leitura simulada nunca sustenta alerta de leitura real**, nem o contrário: a regra só olha leituras da mesma origem.
- **Mudança de status usa guarda otimista**: atualiza só se o status ainda é o lido; senão responde conflito.
- **Kg entregues contam pela data de entrega** (`receivedAt`), não pela de cadastro.

**Ponte MQTT (PR #3)**
- **A ponte é só um adaptador** (revisão do ADR-004). Vazão, temperatura e balança passam por `ingestReading`, `openDeviceOccurrence` e `DonationService.createFromScale`, os mesmos caminhos e regras do HTTP. O código do PR que gravava direto no banco saiu.
- **Potenciômetro é SIMULATED** (`MQTT_SIMULATED_SENSORS="VAZAO"` por padrão). Ele não mede água. Com o YF-S201 ligado, troque para `""`.
- **Id desconhecido é descartado.** O PR caía no primeiro Device do banco; agora vale o mapa explícito `MQTT_DEVICE_ALIASES`.
- **Temperatura alerta só sustentada** (acima de 28 °C por 30 s, configurável), com no máximo uma ativa por dispositivo. As leituras ficam na auditoria; o BI ainda não grafa temperatura e não usa vazão como evidência dela.
- **Balança cria lote `PENDING_REVIEW`**, nunca `AVAILABLE`. O peso é a menor leitura estável, arredondada para baixo. Há um lote pendente por balança, e ela só rearma depois de esvaziada.
- **Gatilho da balança em 1,5 kg (07/11, HX711 de 5 kg) com tolerância de estabilidade.** "Estável" passou a exigir também leituras a até max(0,15 kg; 5%) da mais recente. Sem isso, a leitura parcial enquanto o objeto é colocado entrava na janela e o lote saía com o peso parcial (a caixa de 6 kg do palco virava 3,1 kg). Testes em `tests/scale-detector.test.ts`, com mutação. `REGRAS_PADRAO` da bancada acompanha o padrão de 1,5 kg.
- **Missões não são criadas** pela ponte, porque não têm tela (P2).
- **Fila em memória com PUBACK na chegada (revisão adversarial, 06/11).**
  - A 1ª versão da auditoria confirmava ao broker só depois de gravar. Isso segurava o laço de pacotes do MQTT.js, inclusive o ping: com o banco fora por 30 a 90 s, o keepalive derrubava a conexão e o represado se perdia sem aviso.
  - Agora a hora é carimbada na chegada e a retentativa tem prazo de relógio, com teto por tentativa.
  - Erro permanente, fila cheia e Ctrl+C vão para a carta morta, com `partial` (o que já foi gravado). Mensagem retida é ignorada.
  - Risco aceito: processo morto com fila cheia perde a fila.
  - Prova com broker real: B5, keepalive de 2 s, banco fora 9 s, 0 queda, 4/4 gravadas.
- **Tópico renomeado** para `richards/comercio/telemetria`, sem o nome antigo do produto. A consulta do histórico de fluxo passou a pegar as leituras mais recentes primeiro, para leituras a cada 2 s não cortarem a ponta da janela.

**Tempo real e palco (branch `feat/tempo-real-palco`)**
- **LISTEN/NOTIFY + SSE, sem dependência nova**: o `NOTIFY` sai dentro da transação da gravação, então só chega no COMMIT. Há um `pg.Client` dedicado por processo (hub em `globalThis`, com reconexão) e a rota `/api/live/stream`. Descartados: WebSocket, que exige servidor próprio, e Redis/serviço externo, que seria mais uma peça no palco.
- **O evento leva o mínimo; números sempre do servidor.** A tela refaz a busca quando chega um evento do seu recorte, e o navegador nunca soma evento. Sem stream, a tela volta à consulta periódica e a pílula diz isso.
- **O anel da regra acende só os segundos decididos pela `FlowAlertPolicy`** na última leitura (`reading.created.rule`). Nunca interpola entre leituras.
- **`sensor.live` é efêmero** (`persisted: false`): temperatura, umidade e peso ainda não têm série no banco e não entram em KPI.
- **Privacidade no stream e no telão:**
  - não saem quem recebeu a doação, quem verificou o lote, as notas nem o usuário do operador;
  - o autor passa por `publicActor`: `operador:<x>` vira "operador" e `preparacao:<x>` vira "preparação do palco".
- **Sala ao vivo (`/ao-vivo`)** é rota separada, sem BiShell, com CSS escopado em `.stage`. O "gêmeo" é **representação esquemática** em SVG próprio, rotulada assim.
- **Bancada virtual grava tudo como SIMULATED** (canal `bancada-virtual`), pelas mesmas regras e casos de uso da ponte MQTT. O `--preparar` não apaga nada: muda o status para DISMISSED/CANCELLED, com auditoria.
- **Tema escuro como padrão do BI** (tokens do conceito do Codex: fundo `#071217`, menta para dado e ação, laranja para alerta, **roxo só para simulado**). O selo de origem (`Seal`) é separado da etiqueta de estado. A prévia do relatório continua clara, igual ao PDF.
- **O link da Sala ao vivo fica no bloco "Sistema"** da barra lateral (nova aba). O ignore de "aba lateral" do `.impeccable` saiu, porque o trilho da linha do tempo agora é neutro.

**Efeitos visuais e gêmeo 3D (06/11, depois de pesquisa com 4 frentes e verificação cética das fontes)**
- **O SVG é o padrão e o plano B; o 3D é opcional** (`?3d=1` ou tecla 3, gravado no navegador).
  - O SVG fica sempre montado por baixo como elemento acessível.
  - Qualquer elo volta ao SVG na hora: chave desligada, reduzir movimento, sem WebGL2, renderização por software (WARP/SwiftShader), erro, perda de contexto (a 2ª em 60 s fica no SVG) e orçamento de quadro (mediana acima de 20 ms por 3 s).
- **three imperativo, sem React Three Fiber.**
  - A cena é gerada em código, sem arquivo nem CDN.
  - A água usa `advancePhase(waterSpeed(vazão medida))`, a mesma conta do SVG.
  - Nenhum número é desenhado no 3D.
  - O canvas é criado dentro do efeito, um novo por montagem: um canvas cujo contexto foi perdido nunca ganha outro.
- **O BI segue 2D**, no padrão de tela de operação ISA-101. Ele ganhou só ViewTransition e acabamento CSS.
- **Alarme no padrão ISA-18.2:**
  - pisca a 0,5 Hz só enquanto a ocorrência de fluxo do sensor está OPEN;
  - fica fixo depois de ACKNOWLEDGED;
  - ocorrência de outra origem não acende o cano.
- **Troca de dígito sem valor intermediário.** O dígito anterior sai em `::before` com texto alternativo vazio, então fica fora do innerText e do leitor de tela.
- **Tecla P** pausa todo movimento decorativo (WCAG 2.2.2). A WAAPI e o laço do three não obedecem ao CSS de reduzir movimento, então recebem `still` explícito.
- **KPI animado do BI** com um só escritor do texto, partindo do valor que está na tela. Contagem inteira troca direto. O E2E A2b vigia isso.
  - **A causa do 6.450,3 L entre 6.231 e 904 (06/11) era aritmética.** O tempo do 1º quadro do `requestAnimationFrame` vem ANTES do `performance.now()` do efeito, então k < 0 e `1 - (1-k)³` empurrava o número para o lado oposto.
  - Agora `src/lib/ease.ts` trava o progresso em [0, 1], no KPI, no laço de quadro da água e no pulso do 3D. Há teste e mutação.
- **Revisão adversarial do diff visual (06/11, 4 lentes + verificadores):** 21 de 26 achados confirmados e corrigidos.
  - O pulso do medidor era morto com a bancada/MQTT: o `sensor.live` apagava a chave. Agora a chave é `bootId:sequence` da última leitura do sensor em foco.
  - A tecla P não parava o alarme piscando (especificidade de CSS). A regra de pausa foi para o fim do arquivo, com `!important`.
  - A troca de filtro remontava a tela do BI, pela `key` do crossfade, e tirava o foco. Agora o crossfade é por tipo de transição (`bi-filtro`, via `router.replace`). O E2E A2c vigia o foco.
  - O pulso do 3D corria pela água. Agora é um anel no medidor, igual ao SVG.
  - O 3D aparecia vazio ao religar. Agora cada religada é uma tentativa nova.
  - O orçamento de quadro media a cadência da tela; agora é relativo à cadência-base (tela de 30 Hz não derruba).
  - Alarme de ocorrência simulada passa a carimbar o cano.
  - Acessibilidade: região viva da pausa, contraste da legenda de teclas e `?atalhos=0`.
- **Aceitos, com motivo:**
  - O `next/dynamic` guarda a falha de download do pedaço do three até recarregar a página. O pedaço é servido localmente; se falhar, a Sala segue no SVG.
  - O ambiente PMREM é gerado na criação da cena. Medido no ensaio (T7c, tarefas longas ao religar).

**Ferramentas e documentação**
- **E2E com `puppeteer-core` em vez de Playwright**: usa o Chrome instalado e não baixa navegador. O Edge headless não funcionou.
- **Diagramas em Mermaid**, para serem editáveis e versionáveis. A versão 11.4.1 desenha seta em linha que deveria ser reta, por isso fixamos a 11.12.0.
- **O detector de design (impeccable) tem duas exceções registradas** em `.impeccable/config.json`:
  - a fonte Plus Jakarta Sans, herdada do V3;
  - a regra de aba lateral (`side-tab`) desligada no `globals.css`, por causa do trilho da linha do tempo.

## 11. Antes da demo (resumo; o passo a passo está em `docs/ROTEIRO_DEMO.md`)

1. `docker compose up -d --build` e conferir que `/api/health` responde `"database":"up"`.
2. **Conferir o palco:** `pnpm palco:checar`.
   - Ocorrência REAL ativa de fluxo ou temperatura no sensor, ou lote REAL da balança pendente: resolva pelo BI, com nota.
   - Algo SIMULADO bloqueando: `pnpm bancada --preparar`, que pede "SIM" e não apaga nada.
   - **Telão:** abrir `/ao-vivo` na janela do projetor e apertar F.
3. **Só dados reais:**
   - O BI começa em "sem dados" e se enche com o ESP32; use o filtro **24 h**.
   - **Cadastre a instituição real** antes (`pnpm instituicao:cadastrar --nome "..." --cidade "..."`), senão a reserva da doação não tem destino.
   - Recriar o banco da demo apaga dados e exige autorização.
4. ESP32:
   - `secrets.h` com a mesma chave do `.env`;
   - Wi-Fi do evento;
   - NTP sincronizado;
   - ver `POST 202` na serial.
5. Contingência:
   - `pnpm bancada --cenario palco --inicio-em 5` move vazão, temperatura e balança, tudo SIMULATED. Dê Enter 25 s antes do momento em que a vazão deve subir.
   - `pnpm simulate --scenario leak --samples 14 --interval 4` move só a vazão, pelo HTTP.
6. Se a bancada MQTT for usada:
   - broker na rede isolada;
   - `.env` com `MQTT_BROKER_URL`, `MQTT_TOPIC` e `MQTT_DEVICE_ALIASES`;
   - `MQTT_SIMULATED_SENSORS` de acordo com o que está ligado;
   - `pnpm mqtt` mostrando `Ouvindo richards/comercio/telemetria`.
   - A balança (HX711) grava como DEVICE. Um lote pendente de outra origem não a bloqueia; um lote REAL pendente, sim (o `palco:checar` avisa).
7. Depois do evento, se a contingência foi usada: `pnpm dados:limpar-simulados --apagar`, com backup antes.

## 12. Pendências

**P0 (antes de 06/11)**
- Equipe de IoT: compilar e gravar o firmware na Arduino IDE e testar o ESP32 físico contra a plataforma.
- Victor: trocar o tópico do firmware MQTT para `richards/comercio/telemetria` (ou definir `MQTT_TOPIC`), conferir `dispositivo_id` × `MQTT_DEVICE_ALIASES` e rodar o teste de bancada MQTT do `presentation/CHECKLIST_VICTOR_IOT.md`.
- Victor: subir o `.ino` do firmware MQTT em `iot/esp32_richards_mqtt/`, com `secrets.h.example` e sem senha.
- Ensaiar o pitch 3 vezes com cronômetro, dentro de 5min40 (`presentation/FALA_5MIN40.md`).
- Fazer a preparação da seção 11 antes de subir no palco. Inclui:
  - `pnpm palco:checar` sem FALHA;
  - abrir a `/ao-vivo` no projetor.
- **Produção em 07/11 (manhã):** `main` = `765733b` publicado na VPS (backup antes em `/root/.richards-deploy/backups/richards-vps-antes-deploy-20261107T133327Z.dump`).
  - Instituição **Tétria · Ribeirão Preto** cadastrada no notebook e na VPS (autorizada pelo Ricardo; a cidade foi presumida).
  - Alerta REAL de temperatura das 06:53 (DHT11 da bancada do Victor, fora do evento) descartado pela API com nota (`operador:equipe`), para o alerta ao vivo poder abrir.
  - Ocorrência SIMULATED de fluxo do potenciômetro encerrada pela preparação de palco (`preparacao:root`).
  - `palco:checar` na VPS: só falta um lote RESERVED para confirmar a entrega ao vivo (pesagem na balança → verificar → reservar, pela tela).
- **RICHARDS Assist (PR #6) na VPS (07/11):** IA de explicação no BI (`/assistente`) e alertas/conversa no Telegram (`@Richardshack_bot`), por HTTP com limite de 100 perguntas/dia (risco aceito). Chave OpenAI do projeto Prospector/Iris. Ver `docs/DEPLOY_VPS_TETRIA.md`, "RICHARDS Assist na VPS". Depois do evento: trocar o token do bot (vazou num chat) e conferir o gasto na OpenAI.
- **Produção em 07/11, 12:56 (autorizada pelo Ricardo: "pode subir tudo para a main"):** `main` = `develop` = `6e658bc`, publicado na VPS. Coolify compilou esse commit, deploy `9hvx1izs5jxx5tcrc4oooce5`.
  - **O que entrou:** conversa natural do Assist, robô do Assist no BI e o PR #7 (3D industrial com início automático e celular), que o GitHub marcou como MERGED.
  - **Backup antes:** `/root/.richards-deploy/backups/richards-vps-antes-3d-robo-20261107T155432Z.dump` (880 leituras, 2 ocorrências, 1 assinatura do Telegram).
  - **Bateria no commit publicado:** typecheck, lint e build PASSOU; unitários 149/149; integração 116/116; E2E 36/36.
  - **Verificação pós-deploy:** 10/10.
    - O P3 deu 415 num POST sem JSON: o proxy recusa antes de pedir a senha. Com JSON e sem senha, 401.
    - "Bom dia" é respondido sem fonte e sem número, em 1,8 s. Pergunta de operação cita "Ocorrências ativas".
    - O robô anda no BI. A Sala liga o 3D sozinha; `?3d=0` volta ao SVG.
    - A plateia no celular conecta. 0 erros de JS.
  - **Carga de 70 conexões na plateia:**
    - Do host da VPS: 70/70 em 3 rodadas, conexão em até 37 ms.
    - Do notebook da Tracbel: 66 a 70 de 70. As falhas são `UND_ERR_CONNECT_TIMEOUT` na rede do notebook. No contêiner, ListenOverflows/ListenDrops = 0, então o servidor nunca descartou conexão.
  - **NÃO EXECUTADO:** 70 celulares reais, rede do Senac, 3D no projetor do evento e ESP32 físico.
  - **Rollback do 3D:** `/ao-vivo?3d=0` ou a tecla 3.
- **Produção em 07/11, 15:34 (o Ricardo escolheu "publicar PR #9"):** `main` = `develop` = `36495d4`, publicado e compilado pelo Coolify (deploy `o1qsplmhyeqe9je3qjtt64ge`).
  - **O que entrou:** instrumentos 3D de temperatura e balança, com as correções do aceite.
  - **Backup:** `richards-vps-antes-instrumentos-3d-20261107T183152Z.dump` (3.054 leituras).
  - **Testes no commit:** unitários 155/155 e E2E 36/36 (porta 3110: a 3100 estava ocupada por outra ferramenta).
  - **Verificação pós-deploy:** 12/12. A Sala sobe com 3 canvas no telão e no celular 390. Leituras do ESP32 do Victor (`esp32-787fa`, VAZAO como SIMULATED) voltaram logo depois do reinício.
  - **`palco:checar` na VPS, 2 FALHAS:**
    - uma UNUSUAL_FLOW SIMULATED aberta pelo potenciômetro bloqueia o alerta ao vivo pela regra 5;
    - falta um lote RESERVED.
  - **PR #10 (Circular, com migration):** ainda NÃO validado; deixado para depois do pitch.
- **ESP32 do Victor:** voltou a mandar leituras às 15h de 07/11. Antes disso, nada chegava desde 07:21.
- **Revisar a fala e os slides** (`presentation/`): eles ainda citam o histórico SIMULATED do seed ("carimbo roxo no histórico"). Desde 06/11 o histórico é só do sensor.
- Ensaiar uma vez a contingência `pnpm bancada --cenario palco --inicio-em 5` com o BI e a Sala abertos. Não use `--sensores VAZAO` com a ponte `pnpm mqtt` ligada.
- Montar o backup de palco: simulação identificada, prints, vídeo offline e cabo HDMI.
- **Conferir no regulamento do Hackathon Senac 2026** se é permitido usar material desenvolvido antes da abertura oficial, e ser transparente sobre o histórico do projeto.

**P1**
- A senha de acesso é de laboratório. Não expor a demo na internet aberta; trocar a senha depois do evento.
- A instituição não tem login próprio: quem confirma a entrega é o operador.
- Broker MQTT da bancada sem usuário e senha aceita leitura de qualquer equipamento da rede (a ponte só sobe assim com `DEMO_MODE="true"`). Configurar `MQTT_USERNAME`/`MQTT_PASSWORD` no Mosquitto. Autenticação por dispositivo no MQTT (usuário/ACL por dispositivo ou HMAC com a chave) fica para depois do evento.
- Firmware MQTT mandar `bootId` e `sequence` (idempotência igual à do HTTP).
- Temperatura no BI: guardar a série e mostrar a evidência na gaveta (hoje fica só na auditoria e na descrição).

- **HTTPS da VPS aguarda autorização** (`docs/DEPLOY_VPS_TETRIA.md`, "Auditoria de segurança ... plano de HTTPS"). As duas opções:
  - A: túnel + Access em subdomínio, com o Haroldo;
  - B: túnel rápido do cloudflared.

  Nas duas, depois vem `VPS_BIND_ADDR=127.0.0.1` e Redeploy.
- **Demo na VPS por IP** (`docs/DEPLOY_VPS_TETRIA.md`), riscos aceitos pelo Ricardo em 06/11:
  - o Basic Auth trafega em http, sem TLS;
  - a porta publicada pelo Docker passa por cima do `ufw`.
  - A senha é própria da VPS. **Desmontar até 08/11** (Stop no Coolify) e trocar a senha.
  - Publicar versão nova: levar a `develop` ao `main` (sem forçar) e clicar em Redeploy.
  - Não ligar o ESP32 na VPS: o firmware HTTP não tem TLS.
  - A 18082 do primeiro roteiro é do woodpecker-server.
- A linha do tempo das gavetas do BI mostra o autor completo (`operador:<usuário>`). Se o BI for projetado, considere usar um usuário de laboratório neutro.

**P2 (depois do hackathon)**
- Fase 6, que hoje é só proposta.
- Missões (a tabela `Mission` existe, mas não tem tela nem API).

## 13. Ideias de melhoria (o banco já prevê)

1. **Login por usuário:** a tabela `User` e os papéis (`Role`) já existem. Substitui a senha única e mostra quem fez cada ação.
2. **Painel da instituição:** o papel `RECIPIENT` já existe. A própria instituição confirmaria o recebimento.
3. **Missões:** ocorrência ou lote vira tarefa de inspeção ou coleta com responsável.
4. **Modo projetor:** tela cheia, letras maiores e sem menu, para o palco.

## 14. Armadilhas conhecidas

**Servidor e banco**
- **Porta 3100 ocupada** por `next start` ou `next dev` órfão serve build antigo e a página trava no esqueleto. O `run.mjs` já recusa porta ocupada. Antes de rodar, veja com `Get-NetTCPConnection` (sem `-State`).
- **`next dev` acrescenta um bloco ao `AGENTS.md`.** Já está commitado; não remova.
- **`next dev` no Next 16 bloqueia origem fora de `localhost`.** Por isso o container usa build de produção.
- **O container roda em UTC.** Toda data exibida precisa de `timeZone: "America/Sao_Paulo"`.
- **`--with-db-outage` derruba o container compartilhado do banco** por alguns segundos.

**Testes e ferramentas**
- **`innerText` respeita `text-transform`.** Nos testes, compare texto sem diferenciar maiúsculas.
- **Captura `fullPage` reinicia a animação do Recharts.** O gráfico sai vazio na imagem, mas não é bug.
- **Fontes padrão do pdf-lib só têm WinAnsi.** Por isso existe `safe()` no gerador do PDF.
- **Planilha gerada pelo openpyxl não guarda o resultado das fórmulas.** Abra no Excel e salve. Não há LibreOffice na máquina.
- **Python dentro de heredoc no Bash come barra invertida.** Use um arquivo `.py`.
- **Git Bash converte `/` em caminho do Windows.** Use `MSYS_NO_PATHCONV=1` quando precisar (inclusive no `docker run ... mosquitto -c /mosquitto-no-auth.conf`).
- **Parar `pnpm mqtt` rodando em segundo plano pelo terminal da IA deixa `node.exe` órfão no Windows.** Procure por `run-mqtt` na linha de comando dos processos e encerre.
- **O build do Next tipa `process.env` com `NODE_ENV` obrigatório** e checa também `tests/`. Rode `pnpm typecheck` depois de escrever os testes, não antes.
- **`networkidle0` nunca acontece com o stream SSE aberto.** No E2E, use o helper `go()` do `journeys.mjs`.
- **SSE precisa de `Cache-Control: no-cache, no-transform`.** Sem o `no-transform`, a compressão do `next start` segura os eventos até o fim.
- **Tailwind v4 gera utilitário para nome de classe genérico encontrado no código** (`ring`, `shadow`, `border`...). Em CSS próprio, use nomes específicos.
- **O `.stamp` do `globals.css` tem `position: absolute`.** Na Sala, o carimbo é `seal-stamp`.
- **`python -` (lendo script do stdin) trava o terminal da IA.** Escreva um arquivo `.py` ou `.cjs`.
- **O `globals.css` do BI é global.** Classe nova da Sala não pode repetir nome do BI. Em 06/11, um `.twin-stage` na Sala herdou o fundo do gêmeo do BI e desenhou um "cartão" escuro atrás do 3D. Hoje a classe da Sala é `.twin-slot`.
- **Teste com "N horas atrás" fixo depende da hora em que roda.** O T41 falhava nos 6 primeiros minutos de cada hora; agora as leituras são ancoradas dentro da hora.
- **Puppeteer 24: `page.screenshot()` devolve `Uint8Array`**, não Buffer. Use `Buffer.from()` antes de ler bytes.
- **WebGL no Chrome headless deste notebook usa a GPU real** (ANGLE D3D11). O 3D roda no E2E. Sem GPU (CI), o S3 aceita a reserva com o motivo.
- **O tempo do 1º quadro do `requestAnimationFrame` pode ser ANTERIOR ao `performance.now()` do efeito.** Toda animação por tempo decorrido trava o progresso em [0, 1] (`src/lib/ease.ts`).
- **No MQTT.js, segurar o callback do `handleMessage` para o laço de pacotes inteiro, inclusive o PINGRESP.** O keepalive derruba a conexão. Não usar para "confirmar só depois de gravar".
- **Aba de fundo no Chrome headless segura a troca do esqueleto do Next** (sem quadros de animação). Ensaio com BI e Sala ao mesmo tempo: dois navegadores, ou `bringToFront()` antes de esperar.
- **`git checkout -- arquivo` não restaura arquivo novo (fora do git).** Em teste de mutação, copie o arquivo antes e restaure da cópia.
- **Mapa sem protótipo (`Object.create(null)`) não é `deepEqual` a `{}`.** Compare `{ ...mapa }`.
- **`python -` e heredoc de `node -` travam o terminal da IA.** Escreva o script num arquivo.
- **Puppeteer: `goto` numa rota com Basic Auth sem senha lança `ERR_INVALID_AUTH_CREDENTIALS`** em vez de devolver o 401. Para provar que uma rota segue fechada, use `fetch` no próprio script (E2E B7).
- **Ler `innerText` logo depois do `goto` numa troca de página pode vir vazio**, mesmo com o HTML do servidor completo. Espere um seletor da página nova antes de ler.
- **Captura `fullPage` reinicia a animação CSS** (os carimbos do passaporte saem invisíveis). Capture com `prefers-reduced-motion: reduce` ou espere a animação e capture só a janela.


## Revisão incremental da entrega (06/11/2026)

Auditoria e limitações em `docs/entrega/AUDITORIA_2026-11-06.md`. Gerador com validação de PPTX de 10 slides, evidências obrigatórias no modo final, hash externo e verificador de extração. Pitch alinhado às 10 imagens e quatro participantes. Sala com controles visíveis e modo 2D/3D efetivo. Testes novos em `tests/test_entrega.py` e `tests/stage-controls.test.ts`. Firmware/diagrama/evidências físicos seguem pendentes. main e VPS preservadas; pacote desta revisão é PREVIA.

Em 07/11, a documentação `docs/ARQUITETURA.md` foi reconciliada com a implementação atual (BI nativo, MQTT, transação de ingestão, SSE e fallback SVG), removendo descrições da versão inicial que já não se aplicavam. Sem alteração de contratos, migrations ou infraestrutura.

## 07/11/2026 — RICHARDS Assist + Telegram (PR para develop)

Pedido do Ricardo: implementar assistente com OpenAI e monitor/Telegram, abrir PR e deixar handoff para Claude concluir a ativação. Branch temporária de revisão `feat/richards-assist-telegram`, alvo develop; main e VPS preservadas. Ver `docs/assistente/README.md` e `HANDOFF_CLAUDE.md` antes de continuar.

Implementados: página privada `/assistente`, API de chat com ferramentas somente leitura, cotas persistidas, vinculação Telegram por código temporário de uso único, preferências/stop, fila com chave única/lease/retry, inbox com offset persistido e worker contínuo opcional. OpenAI/Telegram reais NÃO foram chamados com credenciais. Flags ficam false por padrão. Migration aditiva de seis tabelas; aplicada apenas em Postgres 18.6 temporário de teste, nunca no banco real.

Validação após incorporar develop até `bd7bca15ac102d81da49a2c099ded883ddcd38f3`: 136 unitários, 109 integração, typecheck/lint/build e fumaça HTTP local passaram. Não validado: transporte externo real, Docker/PG16, navegador interativo, hardware, projetor e deploy. As atualizações concorrentes de balança, plateia, estimativa de custo e triagem sanitária foram preservadas. Este PR não altera detector/fixtures físicos nem stream público. Conferir HEAD remoto antes de continuar; outras sessões também estão publicando.

## 07/11/2026 — revisão 3D industrial e celular (PR para develop)

Ricardo pediu mais realismo e responsividade. Branch temporária `feat/palco-3d-industrial`, base develop integrada até `cff38f849d8cd53de29a73a72bdf062b706e3374`, incluindo o PR #6 de Assist/Telegram já integrado pela equipe. Este trabalho não alterou main, VPS, APIs, schema/migration ou dependências.

Cena com montagem mecânica detalhada, parafusos instanciados, luzes e shader de água advectado pela vazão; ampliador com o MESMO canvas, dois enquadramentos, pausa/foco/Esc e números no DOM. A Sala agora tenta 3D ao iniciar se não houver escolha contrária; `?3d=0` força SVG. Celular/tablet usa cartões com rolagem em vez de encolher o telão. Fallback/redução de movimento/performance preservados; primeiro nível reduz DPR e detalhes mecânicos.

Na base final passaram 144 unitários, 116 integração em PG18.6 temporário, typecheck/lint/build, HTTP SSR local e 6 testes Python. A correção concorrente do lint do painel de escolas foi preservada. Browser/WebGL/visual/mobile/projetor NÃO aprovados: Chromium local bloqueado pelo ambiente e prévia data: bloqueada pelo navegador conectado. Scripts de ensaio e matriz de aceite em `docs/entrega/3D_MOBILE_HANDOFF_2026-11-07.md`. Não liberar esta revisão para banca/deploy antes do aceite visual. Preservar as atualizações dos trabalhos paralelos.

## 07/11/2026 — robô do RICHARDS Assist no BI (develop)

Pedido do Ricardo ("um robozinho andando pela tela"). Componente `src/components/bi/assist-robot.tsx` (lógica pura em `assist-robot-state.ts`, testes em `tests/assist-robot.test.ts`), montado no `BiShell`; CSS `robo-*` no fim do `globals.css`.
- Desenho SVG próprio, sem dependência nem arquivo externo. Anda no rodapé do BI só com `transform`; o percurso para antes do canto direito, onde ficam os avisos. Fica abaixo das gavetas (z 120) e dos avisos (z 200).
- Clique abre um menu: **Conversar com o Assist** (`/assistente`), **Parar de andar** e **Esconder o robô** (WCAG 2.2.2). A escolha fica no navegador (`richards.robo`). Escondido, a barra lateral mostra "Mostrar o robô do Assist".
- Para no hover/foco. "Reduzir movimento" deixa parado. Não aparece em `/assistente`, na Sala (`/ao-vivo`) nem na `/plateia`.
- A fala usa só a contagem de ocorrências ativas do servidor (a mesma do sino). A antena fica laranja com ocorrência ativa e cinza com o servidor fora.
- Armadilha: pausar com `animation-play-state` em `.robo-walker *` congelava a entrada do menu (`pop`) na opacidade 0. O menu existia mas ficava invisível. A pausa vale só para o passeio e para `.robo-figure`.
- Ensaio no Chrome (servidor local, banco de teste): 18/18. Inclui p95 de 16,9 ms com o robô andando, menu visível, Esc devolve o foco, parado gravado, esconder/mostrar, celular 360 e 390 e 0 erros. Celular físico: NÃO EXECUTADO.

## 07/11/2026 — extensão dos instrumentos 3D e proposta Circular

Após as capturas enviadas por Ricardo, implementada em `feat/instrumentos-3d` a extensão da Sala: balança e instrumento térmico Three.js sob demanda, fallbacks SVG acessíveis, estado neutro para dados antigos, moldura do anel e nós/eventos com profundidade. Sem laço contínuo nos novos modelos, até dois contextos adicionais criados por interseção, DPR limitado e fallback. Estabilidade continua vindo da ponte; não avança pelo relógio. Dados e selos ficam no DOM. Base develop `95511de`, main consultada `07b92f4`; este trabalho não alterou main/VPS/APIs/banco/migrations/dependências.

PASSOU nesta revisão: 155 unitários (seis novos de instrumentos), generate/typecheck/lint/build, HTTP SSR local e seis testes Python. Renderer/layout/GPU/celular/projetor desta extensão NÃO executados; aceites anteriores do cano continuam históricos. Scripts, matriz e orientação ao Claude em `docs/entrega/INSTRUMENTOS_3D_HANDOFF_2026-11-07.md`.

Ricardo trouxe a ideia RICHARDS Circular e confirmou que 5 kg/dia é exemplo ilustrativo. Recomendação: mostrar roadmap e rastreabilidade futura, consolidando a operação atual antes de implementar outro módulo. Conceito, aritmética e referências primárias verificadas em `docs/propostas/RICHARDS_CIRCULAR.md`. Não há módulo Circular implementado nem resultado real de redução/destinação; não misturar estimativas, doação confirmada e tratamento documentado.
