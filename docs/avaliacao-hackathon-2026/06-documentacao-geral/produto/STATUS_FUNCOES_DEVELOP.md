# Inventário de funcionalidades do RICHARDS

**Referência do código:** [develop @ 57cdd0ab](https://github.com/Ricar66/Richards---Hackaton-2026/tree/57cdd0ab40cacecdc68a31c9b3137fdea3478be0). Data: 07/11/2026. Implementação em código não equivale a testes de campo aprovados.

Código-fonte: https://github.com/Ricar66/Richards---Hackaton-2026

| Funcionalidade | Situação documental | Limite |
|---|---|---|
| /monitoramento e /dispositivos | Implementado no código | Precisa de execução e calibração física |
| GET /api/monitoring/fixture-activity | Implementado no código | Janela 72h, DEVICE, cobertura temporal e sinal recente |
| POST /api/monitoring/fixture-inspections | Implementado no código | Requer declaração humana e grava ocorrência MANUAL |
| Regra de fluxo contínuo | Implementada | Defeito e desperdício devem ser confirmados |
| Calculadora financeira | Cenários na UI | Tarifa exemplo; não comprova economia ou ROI |
| Triagem de doações na API | Implementada no código | Habilitação profissional e segurança são avaliadas fora do software |
| Reserva e entrega de lotes | Implementadas no código | Só recebimento confirmado conta nos kg de impacto |
| 3D, QR e telão | Fluxos e componentes no código | Não alegar teste de carga nem hardware validado sem ensaio |
| Sensor para transbordamento/entupimento | **Planejado** | Vazão não diagnostica obstrução |
| Calendário escolar/feriados automático | **Planejado** | Expectativa de uso é declarada pelo operador no MVP |
| Economia real e doação real em escola piloto | **Não comprovadas neste dossiê** | Precisam de medições e documentos |
| Assistente com IA e alertas | Evolução em curso no repositório principal | Não assumir diagnóstico autônomo ou operação externa validada |

## Compromissos técnicos

- DEVICE = leitura de sensor físico; SIMULATED = demonstração; MANUAL = ação humana.
- A análise 72h não considera dados de simulação e exige cobertura suficiente.
- Sensor offline não prova ausência de uso.
- A abertura de vistoria por 72h exige ponto dedicado/calibrado e ocupação esperada.
- Ausência de vazão mensurável não determina entupimento.
- Triagem de alimentos documenta origem e verificações mas não substitui profissional habilitado.

**Testes:** este envio não executou pnpm test, pnpm test:integration, pnpm typecheck, build ou ensaio físico. Registrar evidências antes de declarar PASSOU.
