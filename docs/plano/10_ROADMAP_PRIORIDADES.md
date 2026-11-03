# Cronograma de execução e regras de corte — Hackathon 2026

**Data atual do pacote:** 03/11/2026. **Evento:** 06–07/11/2026. **Regulamento:** confirmar versão vigente e se desenvolvimento prévio, bibliotecas prontas e uso de IA são permitidos. Se não forem, não reutilizar entregas proibidas; replanejar dentro das regras oficiais.

## Ordem técnica (por dependência, não por estética)

### Fase 0 — Auditoria e execução (prioridade absoluta)
**Entrada:** V3 existente. **Saída:** projeto sobe na máquina, env documentado, banco e seed íntegros.
- Inspecionar `package.json`, lockfile (não há no starter), `Dockerfile`, `docker-compose.yml`, `prisma.config.ts` e `prisma/schema.prisma`.
- Executar `pnpm install`, `pnpm db:generate`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` em máquina com dependências (registrar saídas e correções).
- Validar `docker compose up --build`, health, seed, navegação, uma query de banco e persistência de volumes.
- Não rodar reset destrutivo sem perguntar; migrations versionadas em vez de `db push` quando possível.
- Checkpoint: app executa, duas rotas funcionam, dado do banco aparece.

### Fase 1 — Telemetria verdadeira e ocorrência
- ESP32 ou simulador chama `/api/iot/telemetry` com `bootId+sequence`, validações e fonte. Criar leitura no banco.
- Medir faixa do sensor; configurar regra de fluxo constante. Abrir uma única ocorrência.
- Resolver com nota; timeline e status atualizados.
- Checkpoint: POST 202, GET mostra leitura/ocorrência, PATCH resolve, sem duplicações.

### Fase 2 — BI nativo mínimo (a parte que impressiona)
- Converter layout V3 em componentes React nativos, começando por shell, filtros, 4 KPIs, gráfico de vazão/consumo e drawer de investigação.
- URL com filtro de data/unidade/dispositivo/fonte; API agrega por período; métricas e gráfico mudam juntas.
- Sem redesign excessivo. Manter visual V3 como referência, retirar iframe só quando paridade funcional for alcançada.
- Checkpoint: selecionar pico mostra amostra real e ocorrência vinculada, com reload persistindo seleção/filtro.

### Fase 3 — Doações e relatório
- Fluxo `PENDING_REVIEW -> AVAILABLE -> RESERVED -> DELIVERED`, com testes de transições inválidas.
- `DELIVERED` aumenta KPI de kg confirmados; PDF gerado com dados do mesmo período/fonte.
- Checkpoint: uma entidade demo confirma entrega e relatório lista evento.

### Fase 4 — Resiliência, apresentação e acabamento
- Operação sem internet, fallback simulado com marca DEMO, documentação para ligar o ESP32.
- Teste de teclado, responsividade, estados de erro, dados vazios, e2e principal.
- Pitch com 4 apresentadores e cronômetro; sequência de demo roteirizada com backup de captura em vídeo (somente se regras permitirem).
- Checkpoint: todos sabem rodar os 2 fluxos em menos de 3 minutos.

## Janelas sugeridas antes do evento (sujeitas ao regulamento)
| Dia | Foco | Responsável principal |
|---|---|---|
| 03/11 | Auditoria de código, escopo, inventário IoT e critérios da banca | Dev 2 / IoT 1 |
| 04/11 | Ambiente estável, simulação ponta a ponta, prototipagem física permitida | Dev 2 / IoT 2 |
| 05/11 | Design/filtros mínimos, ensaio e plano B documentado | Dev 1 / equipe |
| 06/11 | Oficinas, mentoria, validação do problema e adequação ao regulamento | Todos |
| 07/11 | Implementação e entrega conforme o regulamento, integração, testes, pitch | Todos |

**Regra crítica:** a banca recebe um protótipo de hackathon. Não sacrificar fluxo comprovável por módulos extras.

## Critério de corte por tempo no dia 7
- T-6h: se BI nativo ainda não lê banco, congelar redesign e usar V2 operacional; priorizar prova end-to-end.
- T-4h: se hardware não responde, usar simulador `SIMULATED` e continuar teste da regra e persistência.
- T-3h: se PDF falhar, disponibilizar tela de relatório e versão simples com fonte e filtros.
- T-2h: parar funcionalidades novas; corrigir erros e ensaiar.
- T-1h: congelar branch de demo e testar backup offline.

## Não comprometer
- Pitch entre 3 e 6 min (conforme resumo fornecido).
- Regras de origem dos dados, segurança alimentar e não confundir litros monitorados com litros economizados.
- A equipe IoT não fica à espera do frontend: firmware/simulador com contrato fechado é tarefa paralela.
- Backlog separado P0/P1/P2; nada de inventar dados apenas para preencher dashboard.
