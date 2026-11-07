# RICHARDS Circular — piloto de rastreabilidade

MVP privado em `/circular`, integrado ao monólito Next.js/Prisma existente. Organiza **declarações humanas e documentos** de sobras, triagem, coleta e destinação. Não exige chave de IA, não controla equipamento e não aprova alimento ou operador automaticamente.

## Piloto proposto

Começar com uma unidade já cadastrada e um operador de resíduos orgânicos cuja documentação, processo e materiais aceitos tenham sido conferidos pelo responsável. Não existem parceiros, licenças, coletas ou resultados reais pré-cadastrados por este módulo. Os 5 kg/dia, 26 dias/mês e 50% de redução permanecem em um calculador **ilustrativo**, sem gravação ou participação nos indicadores.

1. Registrar descrição, peso em kg (até três casas), unidade, origem, material, motivo e data da sobra.
2. Fazer triagem humana: classificar como resíduo conhecido ou encaminhar à verificação de doação. Um candidato cria um único `DonationBatch` **PENDING_REVIEW**; todo o checklist sanitário existente continua obrigatório. No MVP, buffet, prato e origem desconhecida ficam bloqueados para encaminhamento à doação por cautela operacional, sem alegar proibição legal universal.
3. Para resíduo, selecionar operador, processo e coleta planejada, justificando a compatibilidade. Operador ativo, conferência vigente e materiais/processos declarados devem coincidir. A declaração cadastral tem prazo de revisão interno de até 366 dias; isso **não é prazo legal de licença**.
4. Registrar a quantidade efetivamente coletada e o responsável. Coletas parciais são permitidas.
5. Anexar comprovante de recebimento com massa de entrada correspondente, data, referência e conferente.
6. Anexar comprovação final: tratamento para compostagem/biodigestão ou disposição para rejeito. O peso é o **resíduo de entrada coberto pelo documento**, não o peso de composto, biogás ou outro produto resultante.

O sistema mantém `comprovado ≤ recebido ≤ coletado ≤ peso registrado`, em gramas inteiras no cálculo e Decimal no banco. Documentos e coletas parciais deixam saldo pendente; status `EVIDENCED` pode significar comprovação **parcial**. Doação encaminhada não significa alimento entregue, e coleta não significa tratamento.

## Indicadores e origem dos dados

- Filtros independentes **MANUAL** e **SIMULATED**, sem soma conjunta e sem entrada `DEVICE`. Manual significa declarado pelo operador, não medição física certificada.
- Períodos móveis de 24h, 7 ou 30 dias usam a **data de cadastro dos lotes**. As massas são acumuladas desses lotes até a consulta; não são toneladas tratadas durante o mês civil.
- Resíduo declarado, coletado, recebimento documentado, tratamento orgânico documentado, rejeito com disposição documentada e saldo sem comprovação final são separados. Cadastro sem triagem, candidato à doação e cancelado não entram na massa de resíduo.
- Totais cobrem toda a coorte. A tela exibe até 100 lotes e 100 operadores; detalhe até 300 eventos de auditoria. Paginação/relatório de períodos anteriores são evolução posterior.
- Não há indicador de desperdício evitado, circularidade certificada, redução de CO₂ ou economia comprovada. O anexo e a conferência humana fundamentam o registro documental; o software não comprova a execução física por conta própria.

## Operação e integridade

Criação de lote, coleta e anexo usam chave de retentativa e impressão do conteúdo. Retentativa idêntica não duplica a massa; reaproveitar chave com outros dados é recusado. Alterações de etapa bloqueiam o lote em transação e conferem versão, evitando dupla triagem/doação ou recebimentos simultâneos indevidos. O mesmo arquivo não pode ser contado duas vezes na mesma etapa do mesmo lote. Um documento pode abranger etapas/lotes distintos; **a alocação entre documentos continua sendo responsabilidade do conferente**.

Eventos de auditoria são gravados na mesma transação. Não existe exclusão de lotes/anexos. Cancelamento exige motivo e só ocorre antes de movimentação ou encaminhamento à doação. Conferência cadastral permite renovar referências e reativar operador; destinações já planejadas preservam uma fotografia do cadastro. Depois de coleta, não se troca a rota pelo fluxo comum. Correções de massa ou substituição de comprovantes já contabilizados exigem evolução com estorno auditado; não editar o banco manualmente.

## Documentos e acesso

PDF, PNG ou JPEG até **2 MiB por arquivo**, armazenados em `bytea` no PostgreSQL. São conferidos tamanho, base64 e assinatura do formato. Isso não substitui antivírus, conferência de conteúdo ou autenticidade documental. Download exige o mesmo acesso privado do BI, usa `attachment`, `nosniff`, política de sandbox, sem cache e SHA256. O arquivo não é renderizado dentro da aplicação. Consultas comuns retornam metadados, sem bytes do anexo.

A proteção existente é Basic Auth de laboratório; a organização é a fixa do MVP, como nos demais serviços. As rotas conferem esse escopo e exigem ator autenticado, inclusive quando `AUTH_MODE=none`. Não representa RBAC completo nem um SaaS multi-tenant validado. `/plateia` não recebe esses dados. Não anexar dados pessoais desnecessários. Backup do banco passa a incluir documentos; avaliar retenção, espaço e acesso no piloto. O ZIP de código não exporta banco nem comprovantes privados.

## Ativação em homologação

O recurso vem com `CIRCULAR_ENABLED=false`. A migration `20261107180000_circular` é aditiva: cinco enums, três tabelas, índices, FKs e restrições. Revisar e validar em PostgreSQL 16 isolado antes de ativar. **A flag bloqueia o uso, não a execução de migrations pelo startup padrão do container.** Não atualizar o deploy ativo só para testar.

```sh
pnpm install --frozen-lockfile
pnpm db:generate
# DATABASE_URL deve apontar EXCLUSIVAMENTE para homologação nesta etapa.
pnpm db:deploy
pnpm build
# Configurar CIRCULAR_ENABLED=true e credenciais de operador no ambiente local.
pnpm start
```

Compose opcional, após revisão da migration e configuração local da flag:

```sh
docker compose -f docker-compose.yml -f compose.circular.yml up -d --build web
```

Não editar main/VPS para concluir este PR. Desligar a flag interrompe uso do módulo e preserva dados/tabelas. Não há rollback destrutivo automático. Se usar também `compose.assistant.yml`, acrescentar ambos os overrides; o worker existente não consulta Circular nesta etapa.

## APIs privadas

| Método | Rota | Função |
|---|---|---|
| GET | `/api/circular?source=MANUAL&range=30d` | Coorte, totais, operadores e unidades |
| POST | `/api/circular/batches` | Cadastro idempotente |
| GET / PATCH | `/api/circular/batches/:id` | Detalhe / triagem, plano, coleta ou cancelamento |
| POST | `/api/circular/batches/:id/evidence` | Documento + massa + conferência |
| GET | `/api/circular/evidence/:id` | Download privado com hash |
| POST / PATCH | `/api/circular/partners` | Cadastro / nova conferência ou desativação |

Contratos estritos: `src/modules/circular/domain/contracts.ts`. Erros: 400 JSON, 401 autenticação pelo proxy, 403 ator/CSRF, 409 conflito/etapa/saldo, 413 limite, 422 contrato, 503 feature desligada/indisponibilidade. Corpo padrão limitado a 16 kB; anexo em JSON base64 até 3 MiB. Chaves de retentativa e versão devem ser preservadas na repetição exata; conflito de versão pede consulta atualizada.

## Base normativa e decisão humana

Referências primárias: [Lei 15.224/2025, Câmara](https://www2.camara.leg.br/legin/fed/lei/2025/lei-15224-30-setembro-2025-798048-publicacaooriginal-176570-pl.html) e [PNRS, texto atualizado na Câmara](https://www2.camara.leg.br/legin/fed/lei/2010/lei-12305-2-agosto-2010-607598-normaatualizada-pl.html). A referência à compostagem/biomassa não autoriza qualquer material, instalação ou processo. Responsável deve conferir enquadramento, regras sanitárias/ambientais e disponibilidade local. Não existe recomendação de alimentação animal ou promessa de parceiro habilitado.

## Próximas etapas

Lembretes de coleta e comprovante pelo bot, consulta do Circular pelo assistente, sensor/balança alimentando o cadastro, autenticação granular, paginação, estornos e integrações externas **não estão implementados neste PR**. O worker Telegram existente continua com seu escopo anterior. Ensaiar primeiro o fluxo completo com registros SIMULATED e, depois, incorporar as evidências do piloto real.
