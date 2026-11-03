# Fase 2 — IoT ponta a ponta e ocorrências

**Data:** 03/11/2026. **Branch:** `feat/fase-2-iot-ocorrencias`. **Base:** Fase 1 (`docs/FASE_1_BANCO_CONTRATOS.md`).

## Resultado

| Verificação | Resultado |
|---|---|
| `pnpm typecheck`, `pnpm lint`, `pnpm build` | PASSOU (lint sem avisos) |
| `pnpm test` (unitários) | PASSOU 15/15 |
| `pnpm test:integration` (Postgres real, `richards_test`) | PASSOU 27/27 |
| Jornada A no navegador (Chrome headless, instância isolada na porta 3100 com o banco de teste) | PASSOU 15/15 |
| Teste de rede: banco derrubado por ~10 s no meio do envio do simulador | PASSOU: 503 → fila → reenvio; 10 linhas, 10 sequences, 0,500 L |
| Teste de repetição: 4 falhas de rede + 1 reenvio proposital | PASSOU: 8 leituras para 8 sequences, 1 `duplicate:true` |
| Firmware: checagem de sintaxe/tipos com `g++` e stubs Arduino | PASSOU, 0 avisos (o original tinha 1 aviso de indentação enganosa) |
| Firmware: compilação para ESP32 (`arduino-cli` + core esp32) | **NÃO EXECUTADO**: o download do toolchain foi bloqueado pela política de permissões desta sessão |
| ESP32 físico (IOT-01..IOT-11) | **NÃO EXECUTADO**: sem placa |

## O que mudou

### Evidência real no drawer (antes a timeline era ilustrativa)
- O drawer da V2 mostrava uma timeline **fixa e inventada** ("Alerta registrado", "Próxima ação") e só permitia resolver via `window.prompt`.
- Novo `GET /api/occurrences/:id` (`get-occurrence-detail.ts`):
  - **Evidência**: as leituras da janela que a regra avaliou, lidas da auditoria `CREATED` gravada na Fase 1, com regra, amostras, volume e pico.
  - **Acompanhamento**: as leituras depois da abertura, para ver se o fluxo parou após a intervenção.
  - **Timeline**: os eventos reais com autor.
  - **Sem janela registrada** (botão de simular, seed ou registro manual): `evidence: null` com explicação. Nada é associado por proximidade (T22).
- Novo `occurrence-drawer.tsx`:
  - Ações: ACK, resolver e descartar, com nota obrigatória (o botão fica desabilitado sem ela).
  - Mostra o erro da API dentro do drawer.
  - Ao fechar, recarrega a ocorrência e os KPIs.
  - Teclado: `role="dialog"`; Escape fecha e devolve o foco a quem abriu (T28).
  - Cabe em 375 px (T29).

### Conectividade honesta
- `device-connectivity.ts` (domínio puro): ONLINE até 120 s após o último contato; depois OFFLINE; NEVER_SEEN se nunca chegou pacote; MAINTENANCE só por decisão humana.
- A telemetria não grava mais `state: ONLINE`. Antes, o sensor aparecia "Conectado" para sempre e sobrescrevia MAINTENANCE.
- O seed não grava mais `lastSeenAt = agora` (fingia um contato que não aconteceu).
- A V2 mostra "Comunicando / Sem comunicação / Nunca comunicou / Em manutenção" e o horário do último contato.

### Simulador = comportamento do firmware
- `scripts/iot-simulator.mjs` reescrito:
  - fila de 12 com DROP logado;
  - retentativa com a **mesma sequence**;
  - a mesma tabela de status do firmware;
  - cenários `leak`, `normal` e `low`;
  - `--duplicate-rate` e `--drop-rate` para os testes de repetição e de rede;
  - resumo final e código de saída (0 se a fila zerou).
- Ocorrência aberta por leituras simuladas registra o actor `simulador:<código>` e a nota "leituras SIMULADAS".

### Firmware (`iot/esp32_richards/esp32_richards.ino`)
- **400** agora é descartado como o 422. Antes, travava a fila para sempre.
- **401** loga orientação (conferir `secrets.h` × `IOT_DEMO_DEVICE_KEY`) e espera 30 s.
- **Falha temporária** (503 ou rede) espera 5 s antes do reenvio. Antes, a API era martelada a cada 1,5 s.
- O contador de descartes por fila cheia (`DROP … total descartado: N`) aparece na serial.
- O log de envio mostra a sequence.
- **Precisa ser compilado e gravado pela equipe de IoT**: aqui só passou na checagem de sintaxe com stubs.

### Regra e política
- `FlowAlertPolicy`: buraco máximo entre amostras configurável (`maxGapSeconds`, padrão 45 s = 3× o intervalo de 15 s).
- Política de horário documentada em `docs/CONTRATO_IOT.md`: a tolerância de ±5 min fica. A fila do firmware cobre cerca de 3 min, e queda maior perde as leituras mais antigas com log, sem reconstrução.

### Visual (defeito anterior, visto nos screenshots)
- Os títulos caíam em fonte **serifada** (a `Plus Jakarta Sans` nunca é carregada e 4 regras não tinham alternativa). Foi adicionada uma cadeia de fallback para fontes do sistema, sem depender de internet.

## Como demonstrar a Jornada A (roteiro de palco)

```powershell
cd E:\CraftOps\apps\web\richards-platform
docker compose up -d --build                  # http://localhost:3000 (usuário/senha do .env)
# 1. Em /ocorrencias, abra "Fluxo contínuo fora de horário" (seed) e resolva com uma nota.
#    Isso libera o sensor: só pode haver UMA ocorrência de fluxo ativa por vez.
# 2. Gere fluxo contínuo SIMULADO (ou use o ESP32 real):
pnpm simulate                                 # ~60 s; abre uma ocorrência após 30 s de fluxo
# 3. Em /ocorrencias, abra "Fluxo contínuo fora do padrão": evidência com as leituras da janela,
#    "Assumir investigação (ACK)", descreva a ação e "Resolver". A timeline mostra quem fez o quê.
```

## Pendências

**Fase 2 que depende de hardware ou permissão (P0 para o palco)**
- Compilar o firmware (`arduino-cli compile --fqbn esp32:esp32:esp32`) e gravar na placa. Rodar IOT-01..IOT-11 em bancada e registrar a calibração (`PULSES_PER_LITER`).
- ESP32 real na rede: usar `compose.iot-lab.yml` (porta 3001 em LAN isolada) e conferir no drawer uma ocorrência com origem DEVICE.

**Próximas fases**
- Fase 3:
  - Abrir automaticamente uma ocorrência `DEVICE_OFFLINE` exige um job; hoje o estado OFFLINE é só exibido.
  - O BI V3 (iframe) ainda tem drawer próprio e não usa a evidência real; isso fica para a migração para React.
  - Filtros, buckets em America/Sao_Paulo, a linha de referência fixa de 120 L e o dia corrente parcial.
- Lista paginada `GET /api/occurrences` (o overview ainda traz as 30 mais recentes).
- E2E no repositório (Playwright). Os roteiros desta fase rodaram com scripts fora do repo (`puppeteer-core` + Chrome instalado).
