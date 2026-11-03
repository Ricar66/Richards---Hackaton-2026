# Gaps, riscos e hipótese de viabilidade

## Riscos técnicos priorizados
| Risco | Prob. | Impacto | Redução de risco | Responsável |
|---|---|---|---|---|
| V3 BI usa iframe e recebe só leitura parcial | Alta | Alta | refatorar para React por vertical slice, fallback `/operacao` | Dev 1 |
| Falha de build/Prisma no ambiente real | Média | Crítico | fase 0 com Docker, typecheck, build, seed | Dev 2 |
| Sensor não mede pequena vazão | Alta | Alta | calibrar e documentar faixa, não prometer microvazamentos | IoT 1 |
| Wi-Fi/NTP instáveis no palco | Média | Alta | hotspot local, fila, simulador rotulado | IoT 2 |
| Vazão contínua é consumo normal | Alta | Alta | regra simples + horários + verificação humana | Dev 2 / IoT 1 |
| Ingestão duplicada por retentativa | Média | Alta | UNIQUE e tratamento de corrida | Dev 2 |
| Dashboard inventa vínculo entre pico e alerta | Média | Alta | join por dispositivo/janela; dizer sem ocorrência quando não houver | Dev 1 / Dev 2 |
| Lote sem avaliação sanitária | Média | Crítico | verificação humana obrigatória e bloqueio de estados | Todos |
| Filtros divergem entre BI e PDF | Alta | Média | mesmo serviço de agregação e testes cruzados | Dev 2 |
| Fallback demo oculta indisponibilidade de banco | Média | Alta | warning visível e origem nos DTOs/PDF | Dev 1 / Dev 2 |
| Autenticação Basic exposta à internet | Média | Crítico | lab isolado apenas; session/RBAC para ambiente real | Dev 2 |
| Escopo excessivo para prazo | Alta | Crítico | freeze P0, cortar P1/P2, ensaiar com fallback | Todos |

## Objeções prováveis e respostas
**“Isso detecta qualquer vazamento?”** Não. Detecta fluxo acima dos limiares dentro das características do sensor; exige calibração, configuração e verificação.

**“Qual a economia de água?”** Ainda não é possível quantificar. Mostraremos volume monitorado e tempo de reação; economia requer estudo antes/depois em instalação real.

**“O que impede um funcionário de receber um alerta falso?”** Período/límites configuráveis e verificação humana; antes de produção serão testadas taxas de falso positivo.

**“Como provam doação?”** Lote com verificação sanitária humana, aceite e confirmação de recebimento; a demonstração será rotulada.

**“Existe concorrência?”** Sim, plataformas de doação e monitoramento existem; a hipótese de diferencial é a operação integrada e rastreabilidade da ocorrência até ação. Validar posicionamento com usuários, não alegar pioneirismo mundial.

**“Quanto custa instalar?”** O kit de bancada é diferente de um produto comercial; instalação, sensor certificado, energia, manutenção, cloud, backup, suporte, conectividade e tributos precisam entrar na planilha real.

**“Por que pagariam?”** Hipótese B2B: redução potencial de prejuízo e gestão operacional. Validar intenção de compra, frequência do problema e economia comprovada com pilotos.

## Valores de referência para discussão, não cotação atual
O pacote anterior estimou bancada **R$ 215–585** em outubro/2026. Não usar como preço final nem como orçamento confirmado em novembro. Solicitar 2 cotações por componente antes de apresentar valores comerciais.

### Tabela que deve ser cotada
| Item | Unidade | Status |
|---|---|---|
| ESP32 | 1 | cotar |
| Sensor vazão apropriado | 1 | cotar + datasheet |
| Bomba baixa tensão + fonte | 1 | cotar |
| Mangueira/conexões/vedação | 1 conjunto | cotar |
| Proteções elétricas e caixa | 1 conjunto | cotar |
| Cabos/conversão de nível | 1 conjunto | cotar |
| Balança HX711/célula de carga | opcional | cotar |
| Hospedagem/banco/dominio | mensal | cotar |
| Instalação e manutenção | por ponto | cotar com parceiro |

## Fórmula de viabilidade a validar
`payback_meses = investimento_instalado / (economia_mensal_comprovada - mensalidade - manutenção_mensal)` se denominador positivo. Se não houver medição de economia, retorno é **não calculável**. Não atribuir valor monetário a alimentos doados sem metodologia, regras e evidências.

## Plano de validação pós-evento
3 entrevistas com comerciantes/escolas/operadores, 1 organização de doações, 1 instalador e 1 profissional de segurança alimentar. Perguntar perda recente, como detectaram, tempo para agir, sistemas que já usam, capacidade de implantação, restrições, preço/valor percebido. Medir taxa de falsos alertas e desempenho do sensor por período antes de propor contratos.

## Fontes para pitch (validar edições e contexto)
- PNUMA — *Food Waste Index Report 2024*; estimativas globais 2022, incluindo partes não comestíveis. Não transformar dado mundial em índice local.
- Ranking do Saneamento 2026 — perdas da distribuição pública de Ribeirão Preto. Não atribuir a vazamentos em unidades comerciais.
- Estudo da USP sobre bancos de alimentos de Ribeirão Preto, publicado em 2025 — dificuldades logísticas; trazer a referência bibliográfica específica no slide.
- Regulamento Senac Hackathon 2026 — confirmar critérios e regras sobre trabalhos prévios antes de usar artefatos.
