# Plano de qualidade — o que precisa passar para chamar de pronto

## Gates de projeto
- `pnpm install` com lockfile consistente; `pnpm typecheck`; `pnpm lint`; `pnpm test`; `pnpm build`.
- `docker compose up --build` com banco healthy e seed idempotente (não duplicar entidades).
- Script de simulação e fluxo real quando placa estiver disponível.
- Testes de API não devem depender do HTML V3.
- Log de resultados e evidências no PR/comentário da IA. Não afirmar teste que não foi executado.

## Matriz de testes
| ID | Cenário | Esperado |
|---|---|---|
| T01 | Aplicação sobe após clone | setup documentado; health respondendo |
| T02 | Banco reinicia | registros preservados |
| T03 | Seed executado duas vezes | não duplica org, site e sensor |
| T04 | Payload JSON válido | 202, leitura salva com `source` correto |
| T05 | `x-device-key` inválida | 401; sem leitura |
| T06 | JSON fora de faixa | 422; sem leitura |
| T07 | Mesmo `bootId+sequence` duas vezes | duplicata sem volume extra |
| T08 | Duas requisições simultâneas iguais | unique não produz volume duplicado |
| T09 | Fluxo abaixo do limiar | não cria alerta |
| T10 | Fluxo persistente acima limiar | uma ocorrência após janela |
| T11 | Fluxo interrompido | reinicia janela |
| T12 | Fluxo persistente enquanto alerta aberto | não cria ocorrências repetidas |
| T13 | ACK e RESOLVE | timeline registra ambos |
| T14 | RESOLVE sem nota | 409, status inalterado |
| T15 | Criar lote | PENDING_REVIEW |
| T16 | Disponibilizar sem verificação | 409 |
| T17 | Reservar sem entidade | 409 |
| T18 | Confirmar entrega válida | entregue registrado, KPI soma peso |
| T19 | Lote disponível não entregue | não entra no KPI entregues |
| T20 | Filtrar DEVICE | sem SIMULATED na soma |
| T21 | Alterar período/unidade | KPI/gráfico/tabela recalculam juntos |
| T22 | Clicar pico sem ocorrência | mensagem honesta, sem vínculo inventado |
| T23 | Clicar pico com ocorrência | drawer traz dispositivo, hora e timeline |
| T24 | Export PDF para período | números iguais ao dashboard |
| T25 | Erro de conexão com banco | UI mostra falha, não troca silenciosamente por demo |
| T26 | Usuário de outra organização | 403/404 e sem dados alheios |
| T27 | Telemetria sem TLS fora do laboratório | implantação bloqueada/revisão exigida |
| T28 | Navegação teclado/`Escape` no drawer | sem aprisionamento; foco retorna |
| T29 | Mobile 375px | sem corte de controles essenciais |
| T30 | Reiniciar ESP32 | bootId novo, sequência nova e sem colisão |

## Critérios para gráficos
- X axis datetime representando dados reais do banco; sem labels apenas arbitrárias.
- Y axis com unidade (L / L/min / kg); não cruzar litros e L/min sem explicitar.
- Mesmo filtro gera mesmos totais no backend e nos cards.
- Todos os valores DEMO com rótulo visível.
- Na ausência de leituras, mostrar estado vazio e recomendação operacional, não série falsa.

## Testes automáticos recomendados
- Unit: `FlowAlertPolicy`, `DonationWorkflow`, formatação, intervalos; Vitest ou node test runner atual.
- Integration: Prisma com Postgres de teste em container; idempotência sob concorrência; transações.
- API: validação Zod, erros HTTP, permissões.
- E2E: Playwright para filtros, drawer, fluxos de ocorrência/doação e PDF.
- Firmware: serial + requests em bancada, com 10 ciclos de envio e 3 testes de desconexão.

## Validação final do pitch
- Parâmetros do hardware e da regra registrados; técnico explica limitação do sensor.
- Os dois fluxos se sustentam mesmo sem internet externa, dependendo de infraestrutura local.
- Backup: 2 capturas do BI, 1 vídeo de até 60s, simulador pronto.
- Todos os apresentadores sabem o que é real vs demonstrativo e não afirmam economias não medidas.
