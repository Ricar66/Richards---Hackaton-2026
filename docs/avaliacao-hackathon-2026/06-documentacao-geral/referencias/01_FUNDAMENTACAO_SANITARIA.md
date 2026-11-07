# Fundamentação sanitária das doações — requisitos para o RICHARDS

**Referência do código:** [develop @ 57cdd0ab](https://github.com/Ricar66/Richards---Hackaton-2026/tree/57cdd0ab40cacecdc68a31c9b3137fdea3478be0). Data: 07/11/2026. Implementação em código não equivale a testes de campo aprovados.

**Atenção:** compilação para desenvolvimento e apresentação; não é parecer jurídico, atestado sanitário nem permissão automática para doar.

## Legislação e fontes a conferir

1. [Lei Federal nº 15.224/2025, art. 14 e §1º (Câmara)](https://www2.camara.leg.br/legin/fed/lei/2025/lei-15224-30-setembro-2025-798048-publicacaooriginal-176570-pl.html): disciplina doação de alimentos seguros, inclusive preparados e in natura, conforme requisitos sanitários e atuação de profissional habilitado nas hipóteses previstas.
2. [Lei Estadual SP nº 11.575/2003 (Alesp)](https://www.al.sp.gov.br/repositorio/legislacao/lei/2003/lei-11575-25.11.2003.html): considera sobras conservadas adequadamente e distingue restos de alimentos já distribuídos ou ofertados ao consumidor. Aplicar norma sanitária ao caso específico.
3. [Lei Estadual SP nº 18.420/2026 (Alesp)](https://www.al.sp.gov.br/repositorio/legislacao/lei/2026/lei-18420-13.03.2026.html): políticas de prevenção de desperdício e destinação adequada de excedentes.
4. [CRN-3 — prorrogação da Portaria CVS nº 3/2026 pela CVS nº 9/2026](https://www.crn3.org.br/noticia/crn-3-destaca-conquista-com-prorrogacao-da-portaria-cvs-no-32026): alerta para início previsto em 01/02/2027. Confirmar o texto oficial e as regras municipais vigentes.

## Regras de produto

1. Todo lote nasce PENDING_REVIEW, inclusive quando a balança o registra automaticamente.
2. Antes de AVAILABLE, o backend exige origem/categoria, inspeção, conservação, validade/embalagem quando aplicável, transporte, nome e cargo/habilitação declarada.
3. Restos de prato são recusados. Buffet exposto fica bloqueado por **política conservadora do MVP**; isso não constitui proibição legal universal para qualquer buffet.
4. Selecionar apenas instituição ativa, registrar reserva e confirmação de recebimento.
5. Impacto social usa **somente peso efetivamente entregue**, com registro do lote e da instituição.
6. Checklists e sensores não atestam a segurança alimentar de forma autônoma.

## Antes de receber ou doar alimentos reais

Revisar responsável habilitado, condições sanitárias municipais, armazenamento e cadeia fria, transporte, documentação, validade, origem e responsabilidade de doador e receptor. Solicitar verificação com Vigilância Sanitária e profissional técnico habilitado. Nunca afirmar que todas as categorias são automaticamente aptas.
