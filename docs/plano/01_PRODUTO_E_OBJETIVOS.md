# RICHARDS Intelligence — Produto, personas e resultado esperado

**Versão de referência:** 2026-11-03. **Estado:** protótipo em desenvolvimento, não produto comercial comprovado.

## Tese
RICHARDS é uma plataforma de inteligência operacional que transforma sinais de desperdício em **ocorrências verificáveis**, ações responsáveis e relatórios rastreáveis. Começa com água e alimentos em um estabelecimento-piloto; pode ser adaptada, no futuro, para outras organizações e tipos de recursos. Não vender a ideia como “IA que adivinha vazamentos” nem como certificação de alimentos.

**Promessa comunicável:** "Perceber antes. Agir melhor. Comprovar resultados."

## Problemas / trabalhos a realizar
- Operação: “Quando há fluxo de água fora da rotina, preciso saber, investigar e documentar a intervenção.”
- Gestor: “Quero identificar padrões de consumo, comparar períodos, verificar a origem dos dados e entender o custo de não agir.”
- Equipe: “Preciso saber quais ocorrências estão abertas, quem verificou e o que resolveu.”
- Responsável por excedentes: “Preciso organizar um lote apto a doação com verificação humana e registrar a entrega.”
- Entidade receptora: “Preciso saber se o lote está disponível, verificar a aceitação e confirmar o recebimento.”
- Banca: “Preciso ver o hardware gerar dados e uma ação mudar o sistema, não apenas telas animadas.”

## Público inicial, sem restringir a visão da marca
Validação inicial com um comércio de alimentos, escola ou unidade operacional participante. Produto potencialmente B2B/B2G em versão futura. Não alegar aderência já validada a todas as indústrias. Atender o primeiro fluxo comprovadamente, depois ampliar.

## Perfis
- OWNER: gestão da organização, configuração e relatórios.
- OPERATOR: investigação e acompanhamento de alertas, registro de intervenções e lotes.
- ANALYST: acesso de leitura, filtros, drilldown e relatórios.
- RECIPIENT: usuário de uma instituição receptora, restrito às ofertas e entregas autorizadas (necessita modelagem de autorização específica; não presumir que já exista).
- DEVICE: credencial de máquina, somente telemetria da própria placa, nunca acesso a painéis.

## Jornada A — Água
1. ESP32 instalado em bancada segura mede pulsos do sensor em intervalo definido.
2. Firmware calcula `flowLpm` e `deltaLiters` e envia UTC, `bootId` e `sequence`.
3. API valida credencial, esquema, horário, idempotência e dispositivo.
4. Regra configurável sinaliza **fluxo suspeito** persistente (não diagnóstico de vazamento).
5. Gestor abre alerta, investiga gráfico/leituras e registra `ACKNOWLEDGED`.
6. Operador informa intervenção e encerra `RESOLVED` ou descarta com justificativa.
7. BI mostra volume monitorado, tempo de resposta, eventos e origem dos registros. Sem chamar volume observado de água economizada.

## Jornada B — Alimentos
1. Operador cria lote e informa peso, descrição, local, disponibilidade e observações.
2. Profissional/responsável habilitado verifica condição e critérios sanitários fora da automação.
3. Depois da verificação documentada, lote muda para `AVAILABLE`.
4. Entidade aprovada aceita/reserva (`RESERVED`) e coleta.
5. Recebimento é confirmado (`DELIVERED`) com horário e responsável.
6. BI soma **somente entregas confirmadas**. `PENDING_REVIEW` ou `AVAILABLE` não entram em “kg entregues”.

## Métricas de produto e regras de interpretação
| Indicador | Definição | O que não é |
|---|---|---|
| Volume monitorado (L) | Soma de `deltaLiters` aceitos, filtrados por período/dispositivo/origem | Economia comprovada |
| Ocorrências abertas | `OPEN` + `ACKNOWLEDGED` no escopo | Número de vazamentos confirmados |
| Tempo de resposta (min) | `openedAt` até primeira confirmação ou resolução, com rótulo explícito | Tempo de conserto sem medição |
| Entregas (kg) | Peso dos lotes `DELIVERED` no período | Alimento “salvo” sem verificação |
| Saúde IoT | Última conexão, idade da leitura, erros, sinal se disponível | Certeza sobre a hidráulica |
| Economia estimada | **Fase futura**, metodologia documentada, antes/depois comparáveis | Resultado automático do MVP |

## Diferenciais buscados
- Do dado bruto até a evidência da ação: série -> ponto -> dispositivo -> ocorrência -> timeline -> PDF.
- Proveniência em todo dado (`DEVICE`, `SIMULATED`, `MANUAL`), nunca misturar silenciosamente.
- Duas jornadas dentro de uma plataforma consistente, sem vender dois sistemas desconectados.
- Protótipo físico fácil de demonstrar e fallback para modo simulado, rotulado.

## Critérios de sucesso para hackathon
- `docker compose up --build` inicia a aplicação em ambiente da equipe com orientação reproduzível.
- Pelo menos uma leitura aceita do ESP32 real aparece no sistema; se hardware falhar, demonstrar simulador **explicitamente**.
- Fluxo anormal persistente cria uma ocorrência única; repetições idempotentes não duplicam volume.
- Um operador investiga e resolve a ocorrência com evidência.
- Um lote de demonstração percorre validação humana, aceite e entrega confirmada.
- BI reflete o mesmo banco da API (sem números fixos disfarçados de realidade).
- PDF com período, filtros, origem e timestamp; fontes de dados demonstrativos identificadas.
- Pitch entre 3 e 6 minutos, com história e limitações honestas.

## Fora do MVP
IA preditiva treinada, machine learning sem conjunto de dados real, fluxo financeiro de contratação, mercado público de freelancers, geolocalização de coletas, integração SENAC, mapa real de perdas de Ribeirão Preto, controle hidráulico remoto, validação sanitária automatizada e sensores profissionais certificados.
