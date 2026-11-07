# Arquitetura lógica — do sinal à decisão

**Referência do código:** [develop @ 57cdd0ab](https://github.com/Ricar66/Richards---Hackaton-2026/tree/57cdd0ab40cacecdc68a31c9b3137fdea3478be0). Data: 07/11/2026. Implementação em código não equivale a testes de campo aprovados.

## Monitoramento de água e manutenção

~~~mermaid
flowchart TD
  A[Sensor de vazão calibrado] --> B[API HTTP ou MQTT com origem]
  B --> C{Fluxo contínuo acima do limiar?}
  C -->|Sim| D[Ocorrência suspeita]
  C -->|Não| E[BI e gráficos]
  D --> F[Operador verifica e registra intervenção]
  F --> G[Comparar antes e depois, com base válida]
  B --> H[Análise 72h apenas DEVICE]
  H --> I{Sinal atual e cobertura suficientes?}
  I -->|Não| J[Não inferir falta de uso]
  I -->|Sim| K{Fluxo mensurável?}
  K -->|Sim| E
  K -->|Não| L[Operador confirma ponto dedicado e uso esperado]
  L --> M[Solicitar vistoria MANUAL auditada]
~~~

## Excedentes alimentares

~~~mermaid
flowchart TD
  A[Excedente identificado e pesado] --> B[Verificação pendente]
  B --> C{Origem, inspeção e responsável registrados?}
  C -->|Não| D[Manter pendente ou cancelar]
  C -->|Sim| E[Disponível conforme política do MVP]
  E --> F[Reserva para instituição ativa]
  F --> G[Entrega com recebedor]
  G --> H[kg recebidos entram no impacto]
~~~

Os fluxos são descrição do produto, não certificado de sensores físicos, de licenciamento sanitário ou de eficiência financeira comprovada.
