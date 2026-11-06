# RICHARDS Intelligence — Roteiro de palco e execução

**Hackathon Senac Ribeirão Preto · 6–7 de novembro de 2026**  
**Proposta de apresentação:** 5 min 40 s, incluindo demonstração de 2 min.  
**Tese:** *Perceber antes. Agir melhor. Comprovar resultados.*

## História que queremos contar

**Hook:** “Quanto custa perceber tarde demais?” Um fluxo de água anormal pode continuar sem investigação. Um lote de alimentos aproveitáveis pode perder a oportunidade de destino. O problema comum não é só o desperdício, mas o intervalo entre um sinal e uma decisão.

**Referência humana:** O projeto recebeu o nome **RICHARDS** em homenagem a **Ellen Swallow Richards (1842–1911)**, cientista pioneira da química sanitária, do estudo da água e da relação entre ambiente, alimentação e saúde. A inspiração não é uma citação fabricada: é o princípio de aplicar ciência à vida cotidiana e à gestão responsável de recursos.

**Solução:** RICHARDS recebe a telemetria de uma bancada com ESP32 e sensor de vazão, valida os dados e sua origem, identifica fluxos suspeitos persistentes por **regra configurável**, gera ocorrência, registra a investigação humana e consolida indicadores e relatórios. Em paralelo, rastreia lotes alimentares da verificação humana à entrega confirmada.

**Diferencial proposto:** o dado não morre no dashboard: existe uma trilha rastreável de leitura → evidência → ocorrência → ação → relatório. É uma hipótese de posicionamento, não alegação de exclusividade no mercado.

## Minutagem para 5:40

| Tempo | Slides/ação | Responsável sugerido | Frase-chave |
|---|---|---|---|
| 00:00–00:35 | 01–02, pergunta de abertura | Apresentação / Ricardo | “Quanto custa perceber tarde demais?” |
| 00:35–01:05 | 03–04, dado global e história do nome | Apresentação | “Richards enxergou água, alimento e ambiente como uma questão científica.” |
| 01:05–01:40 | 05–06, fluxo e tecnologia | Ricardo + Victor | “Do mundo físico ao registro verificável.” |
| 01:40–03:40 | 07–09 + demonstração real ou simulação declarada | Victor ativa bancada; Ricardo opera o BI | “A leitura vira ocorrência, ação e evidência.” |
| 03:40–04:20 | 10–11, diferencial e evolução com IA | Ricardo | “IA preditiva só depois de dados e validação.” |
| 04:20–05:00 | 12–13, impacto e piloto | Equipe | “Impacto se comprova; não se inventa.” |
| 05:00–05:40 | 14, conclusão e convite ao piloto | Equipe | “Perceber antes. Agir melhor. Comprovar resultados.” |

## Roteiro de demo — com cliques

0. **Telão:** `/ao-vivo` (Sala ao vivo) em tela cheia (tecla F). O anel da regra, a temperatura, a balança e a viagem do pacote mudam a cada leitura gravada, pelo stream. Antes do palco: `pnpm palco:checar` (e, se acusar bloqueio, `pnpm bancada --preparar`).
1. Abrir `/` e mostrar filtro por origem. Lembrar: dados do seed = **SIMULATED**.
2. Abrir `/monitoramento?range=24h`; filtrar origem **DEVICE** quando o ESP32 estiver enviando.
3. **Victor:** ativar o circuito de bancada. Em regra de demonstração, vazão ≥ 1,5 L/min por 30 s pode gerar uma ocorrência — confirmar configuração antes do palco. Não chamar de vazamento confirmado.
4. **Ricardo:** abrir a ocorrência, verificar amostra, assumir investigação, fechar a torneira e resolver com nota. A ação fica registrada.
5. Em `/doacoes`, mostrar um lote com validação humana e confirmar a entrega ao receptor no fluxo correto. Só entram nos indicadores de impacto os quilos `DELIVERED`.
6. Em `/relatorios`, exportar PDF com os filtros e fonte identificada.

### Plano de contingência

- Falhou a bancada (placa, Wi-Fi, broker ou sensor):
  - parar a ponte (Ctrl+C no `pnpm mqtt`) e executar `pnpm bancada --cenario palco --inicio-em 5`, que move vazão, temperatura e balança pelas mesmas regras;
  - a ponte não descarta um sensor só: se a vazão falhou, a ponte precisa estar parada (com ela parada, `--sensores VAZAO` também serve). Se só a temperatura ou a balança falhou, a ponte pode seguir e a bancada simula só esse sensor (`--sensores TEMP` ou `--sensores PESO`);
  - com a ponte parada há menos de 10 s, a bancada espera até 6 s para ver se ainda chega leitura dela e então começa. Ela só recusa se a ponte continuar gravando;
  - mostrar o selo **SIMULADO** na Sala e afirmar que é simulação;
  - último recurso: `pnpm simulate --scenario leak --samples 14 --interval 4`.
- Há ocorrência ativa: encerrar a anterior antes de demonstrar. Uma ocorrência ativa do mesmo dispositivo impede nova abertura.
- Histórico não aparece em 24h: usar 30 dias para seed e 24h para leituras novas.
- Banco indisponível: não fingir dados em tempo real; mostrar estado de erro e utilizar vídeo/capturas preparadas como plano B.

## Perguntas da banca — respostas honestas

**“A IA já prevê vazamentos?”** Ainda não. O MVP usa regras configuráveis para sinalizar fluxos suspeitos persistentes. O futuro ML exige histórico confiável, rótulos de eventos, baseline e validação de falsos positivos.

**“Quantos litros economizaram?”** Ainda não medimos a economia. Temos volume **monitorado**, alertas e histórico de intervenções. Para afirmar economia, será necessário piloto antes/depois com contexto comparável.

**“Quem diz que o alimento pode ser doado?”** Uma pessoa habilitada e o processo sanitário aplicável, não o algoritmo. O sistema organiza o fluxo e registra a confirmação da entrega.

**“Como tornar comercial?”** Começar com pilotos em comércios/escolas, validar instalação, custo, manutenção, taxa de falsos alertas e valor percebido. ROI só após medição real.

**“E o diferencial?”** União de monitoramento físico, investigação auditável, fluxo de doação e relatório com proveniência. Isso ainda precisa ser testado frente a usuários e concorrentes.

## O que NÃO falar

- “IA que prevê vazamentos em tempo real” — **não implementada no MVP**.
- “Economizamos N litros” — litros medidos não são litros economizados.
- “Salvamos N kg” — usar apenas kg efetivamente entregues e confirmados.
- “O sistema garante segurança alimentar” — verificação sanitária é humana.
- “Tudo foi testado no ESP32 real” — apenas depois que Victor tiver realizado testes e registrado evidências.

## Fontes

- MIT Libraries — https://digital-exhibits.libraries.mit.edu/s/under-the-lens/page/Richards
- Science History Institute — https://www.sciencehistory.org/education/scientific-biographies/ellen-h-swallow-richards/
- PNUMA / UNEP — https://www.unep.org/en/news-and-stories/press-release/world-squanders-over-1-billion-meals-day-un-report (estimativas de 2022 publicadas em 2024; incluem partes não comestíveis)
- Contratos/limites técnicos: `docs/CONTRATO_IOT.md`, `docs/ARQUITETURA.md`, `docs/ROTEIRO_DEMO.md`, `docs/plano/01_PRODUTO_E_OBJETIVOS.md` deste repositório.