# Pitch e demonstração — roteiro de palco 5 a 6 minutos

## Tese comercial
"Quanto custa perceber tarde demais?" RICHARDS converte leitura de sensores em ocorrências que pessoas podem investigar e documentar, além de organizar o destino de excedentes alimentares. **Não anunciar como inteligência artificial preditiva**, nem afirmar economia não comprovada.

## Roteiro sugerido para 4 apresentadores
| Tempo | Integrante | Conteúdo | Tela/ação |
|---|---|---|---|
| 00:00–01:05 | Apresentador 1 | Abertura curiosa (água + alimentos), custo de perceber tarde, problema global e local com contexto | slide escuro, sem logo; depois revelar RICHARDS |
| 01:05–02:20 | IoT | Circuito fechado, dados de sensor, limite técnico, momento do alerta | ESP32 e tela de monitoramento |
| 02:20–03:50 | Dev 1 | Clique no gráfico -> detalhe -> ocorrência -> resolução; registrar lote -> doação | BI nativo ou fallback operacional |
| 03:50–05:20 | Dev 2 | KPIs, relatório PDF, modelo de receita hipotético, validação, limites e proposta de piloto | PDF e panorama do produto |
| 05:20–05:40 | Todos | Fechamento e slogan | marca RICHARDS |

## Script-guia de abertura (adapte para fala natural)
"Antes de contar o que desenvolvemos, quero fazer uma pergunta: quanto custa uma falha que ninguém percebe a tempo? Uma tubulação pode continuar liberando água e um lote de alimentos pode perder a chance de ser aproveitado. Nos dois casos, o problema não é apenas o recurso: é o intervalo entre o sinal e a decisão. E se conseguíssemos transformar esse sinal em uma ação rastreável? Foi dessa pergunta que nasceu RICHARDS." 

## Demo coreografada (2 minutos)
1. Selecionar unidade, origem dos dados e período; explicar claramente `DEVICE` vs `SIMULATED`.
2. Abrir série hídrica; ligar circuito e aguardar regra gerar ocorrência (ou simular e rotular fallback).
3. Clicar no pico, mostrar amostra e ocorrência; marcar como verificada e resolver com nota.
4. Abrir fluxo alimentar, selecionar lote de demonstração, registrar verificação humana, entidade aceita e confirma recebimento.
5. Retornar KPI e exportar PDF; conferir mudanças.

## O que precisa estar no material de apoio
- 1 slide de problema com fonte e contexto, 1 de solução/fluxo, 1 de diferenciação, 1 de viabilidade, 1 de impacto, 1 de fechamento.
- Lista de respostas a objeções na pasta `12_RISCOS_CUSTOS_E_VIABILIDADE.md`.
- Backup offline com prints do sistema em Full HD e roteiro sem hardware, caso internet/placa falhe.
- Não declarar números simulados como resultados de piloto; anunciar data e amostra de cada referência externa.

## Ensaios
Rodar cronômetro **com cliques e hardware**, repetir 3 vezes, atribuir tempo extra para falhas. As falas precisam preencher o intervalo sem acelerar demais, mantendo 5:30 como teto confortável dentro de 6:00.

## Critério visual e de impacto
A frase memorável não é “nós usamos Next.js e ESP32”; é "a informação não termina no gráfico — ela vira uma ação que podemos comprovar".
