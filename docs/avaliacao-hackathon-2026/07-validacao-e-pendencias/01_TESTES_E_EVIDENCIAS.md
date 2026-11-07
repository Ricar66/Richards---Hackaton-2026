# Plano de testes e evidências para a avaliação

**Referência do código:** [develop @ 57cdd0ab](https://github.com/Ricar66/Richards---Hackaton-2026/tree/57cdd0ab40cacecdc68a31c9b3137fdea3478be0). Data: 07/11/2026. Implementação em código não equivale a testes de campo aprovados.

**Estado deste dossiê: NÃO EXECUTADO.** Os testes abaixo são procedimentos propostos e só podem mudar para PASSOU mediante logs e evidências reais.

| ID | Procedimento | Evidência exigida | Estado |
|---|---|---|---|
| AG-01 | pnpm typecheck e pnpm build | SHA, saída e data | NÃO EXECUTADO |
| AG-02 | pnpm test e pnpm test:integration em banco _test | Relatório de resultados | NÃO EXECUTADO |
| AG-03 | ESP32 real em vazão zero, normal e persistente | Vídeo e série DEVICE | NÃO EXECUTADO |
| AG-04 | Sensibilidade a 0,2 e 1 L/min | Curva de calibração e tolerância | NÃO EXECUTADO |
| AG-05 | Sensor offline e simulação não geram conclusão de ausência de uso | Logs e resultado de teste | NÃO EXECUTADO |
| AG-06 | 72h com cobertura suficiente e sem fluxo físico | Dataset e vistoria MANUAL | NÃO EXECUTADO |
| AG-07 | Declarações obrigatórias antes de abrir vistoria | Teste de API/UI | NÃO EXECUTADO |
| AG-08 | Não criar duas vistorias MANUAIS ativas iguais | Teste de repetição/concorrência | NÃO EXECUTADO |
| AG-09 | API recusa restos de prato e buffet exposto no MVP | Testes e trilha sanitária | NÃO EXECUTADO |
| AG-10 | Conferência de responsável habilitado e protocolo de doação | Parecer e procedimento aprovado | NÃO EXECUTADO |
| AG-11 | Apenas entrega confirmada soma kg sociais | Lote e comprovante | NÃO EXECUTADO |
| AG-12 | Estimativa financeira usa tarifa correta e comparação válida | Fatura e método de cálculo | NÃO EXECUTADO |
| AG-13 | UI responsiva e acessível em celular | Capturas e observação | NÃO EXECUTADO |
| AG-14 | Público simultâneo via QR | Teste de carga com 70 clientes reais/simulados controlados | NÃO EXECUTADO |

Para cada teste preencher o modelo de registro já existente nesta pasta: data, responsável, ambiente, hardware, versão, procedimento, resultado esperado e observado, status, evidências e riscos. Não apresentar valores do seed ou simulações como medições de escola ou como impacto social real.
