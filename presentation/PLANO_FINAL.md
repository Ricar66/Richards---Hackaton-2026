# Plano final de excelência — 6 e 7 de novembro de 2026

## Gancho de demonstração (sem prometer o que não foi medido)
Colocar uma bancada com sensor ESP32 e circuito de água seguro à frente da banca. Começar com uma pergunta: **“Quanto custa perceber tarde demais?”**. O Victor gera vazão sustentada; a tela filtra a origem **DEVICE**; a regra cria uma ocorrência; a pessoa responsável investiga e resolve; o PDF comprova os registros. Em seguida, mostrar lote alimentar percorrendo verificação humana até entrega confirmada.

## Prioridades: primeiro provar, depois impressionar

| Ordem | Entrega | Evidência / aceite |
|---|---|---|
| P0 | Docker local estável | `docker compose up --build`; health DB=up; sem apagar volumes |
| P0 | IoT do Victor | pacote real 202, data UTC, calibração e origem DEVICE visível |
| P0 | Alerta | vazão persistente conforme limiar → só uma ocorrência; queda de vazão isolada não alerta |
| P0 | Investigação | OPEN → ACKNOWLEDGED → RESOLVED com justificativa, no banco |
| P0 | Doação | verificação humana → reserva → entrega; apenas DELIVERED entra no KPI |
| P0 | PDF | mesmos filtros e origem do BI; dados simulados rotulados |
| P0 | Backup | simulação identificada + prints + vídeo offline + cabo HDMI |
| P1 | Design | revisar tipografia a 1920 × 1080 e testar retroprojetor |
| P1 | Narrativa | ensaiar 3 vezes a apresentação, dentro de 5:40 |
| P2 | Futuro ML | registrar hipótese e métricas; não afirmar que está em produção |

## Riscos de palco
- Histórico de seed 27/10–03/11: no dia 06/11, **24h ficará vazio** se não houver telemetria recente. Usar 30 dias para o passado e 24h para o sensor ao vivo.
- Ocorrência existente do mesmo sensor impede abertura de nova ocorrência; encerrar a anterior no ensaio.
- API com HTTP Basic é apenas para laboratório; não expor em internet pública.
- Regra de vazão sinaliza **suspeita**, não diagnóstico nem medição de água economizada.
- Firmware ainda precisa ser compilado e testado com hardware físico pelo Victor.

## Testes e estado das afirmações
A documentação do repositório descreve fases e contratos prontos; **este pacote de apresentação não executou o build, não validou o ESP32 real e não mediu qualquer economia de recursos**. Testar `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:integration`, `pnpm test:e2e` no ambiente da equipe antes de anunciar status como concluído.

## Atenção
Confirmar o regulamento do Hackathon Senac 2026 quanto ao uso de artefatos desenvolvidos antes da abertura oficial. Transparência sobre o histórico do projeto evita problemas na avaliação.
