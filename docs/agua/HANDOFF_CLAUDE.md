# Handoff — pivô hídrico, 07/11/2026

## Decisão e autorização

Ricardo retirou alimentos/doações/Circular, balança, temperatura e umidade. Produto passa a focar vazão e mapeamento de casa, comércio e obra. PR #10 do Circular foi encerrado sem merge; branch preservada. Base develop e main conferidas em `29cb92fc2ec7ba68d5b96eb4250bed4aafa52f66`.

Trabalho em branch de revisão `feat/water-flow-mapping`, alvo develop. Nenhuma alteração de main, VPS, deploy, banco real, firmware físico ou chave de produção foi executada. Não interpretar este PR como autorização para implantação.

## Implementação

- Nova página privada /mapa e GET/PUT /api/water-map. Planta SVG 2D e perspectiva **vetorial**, não nova simulação Three.js. O cano industrial Three.js permanece na Sala.
- Três modelos sem escala/vínculo presumido. Até 32 pontos, 20 ambientes e 40 ramais. Entrada única, árvore conectada, sem ciclos. Nome/posição/vínculo de ponto editáveis; novos pontos ligados à distribuição. Edição CAD/desenho livre de segmentos não implementados.
- Medidor FLOW só pode vincular um ponto da mesma unidade/organização. Ponto não instrumentado não recebe leitura. Atualização a cada 5 s em aba visível, fonte DEVICE/SIMULATED separada, leitura antiga/futura indevida neutra, pausa e prefers-reduced-motion.
- HydraulicMap ligado a Site, versão, responsável e auditoria com layout anterior/novo na mesma transação. Bloqueio da unidade + versão evitam sobrescrita silenciosa. A recarga da planta é explícita, preservando o rascunho durante polling; nova edição com versão antiga recebe 409.
- MQTT exige VAZAO e ignora campos extras antigos; não abre outras jornadas. HTTP/MQTT recusam dispositivos não FLOW. Bancada virtual é só vazão SIMULATED e não encerra fatos existentes.
- UI/BI/PDF/plateia/assistente/Telegram alinhados à água. APIs antigas 410; páginas antigas redirecionam ao mapa. Ocorrências térmicas históricas ficam fora das consultas atuais. Resumos de fila são regenerados; avisos antigos sem vínculo hídrico válido são ignorados sem excluir a fila.
- Código e material anterior arquivados, sem compilar/executar/exportar. Schema/migrations e alguns tipos/codecs internos legados preservam histórico; campos vazios de compatibilidade são removidos das projeções API atuais. Não editar banco manualmente para apagar esse histórico.

## Migração e operação

Migration aditiva `20261107190000_water_map`: somente HydraulicMap e FK para Site, versão não negativa. Não modifica/elimina tabelas ou registros antigos. **Startup padrão aplica migrations automaticamente.** Revisar SQL e testar em PostgreSQL 16 isolado antes de qualquer atualização do container. Não executar reset, db:push, TRUNCATE ou migração destrutiva no banco da operação.

O teste local usa banco novo `richards_water_test`, PostgreSQL 18.6 isolado, sem acesso à VPS. Servidor de teste explicitamente em America/Sao_Paulo: captura TIMESTAMP é UTC e SQL do mapa usa `NOW() AT TIME ZONE 'UTC'`. Não restaurar comparação implícita com NOW(), que excluiria amostras recentes quando o servidor estiver em outro fuso.

## Validação atual da reconstrução

O ambiente anterior tornou-se indisponível e seus arquivos locais foram removidos por manutenção antes da publicação. Código foi reaplicado a partir da base e dos registros da conversa. Resultados anteriores são históricos; os comandos abaixo foram executados novamente nesta cópia.

| Verificação | Resultado |
|---|---|
| Instalação frozen, Prisma generate | PASSOU |
| pnpm typecheck / lint / build | PASSOU |
| node --import tsx --test tests/*.test.ts | PASSOU: 132/132, sem ignorados |
| node --import tsx --test --test-concurrency=1 tests/integration/*.test.ts, migrations aplicadas no banco isolado | PASSOU: 87/87, sem ignorados |
| HTTP/Chromium/empacotamento da versão final | Em conclusão; consultar complemento abaixo e descrição do PR |
| PostgreSQL 16 / celular físico / hardware / projetor / API externa / carga de público | NÃO EXECUTADO nesta sessão |

Os testes dedicados às jornadas retiradas foram arquivados; não contam como testes do produto atual. As regressões do novo escopo verificam inclusive a exclusão do histórico da projeção, sem removê-lo do banco. Fixture DEVICE em teste é um registro controlado de software, nunca evidência de hardware.

## Reprodução e aceite

- [ ] Conferir HEADs atuais e preservar commits concorrentes antes da integração.
- [ ] Rever migration em PG16 isolado, instalação frozen, generate, typecheck, lint, unitários, integração e build.
- [ ] TEST_DATABASE_URL deve terminar em _test. O helper limpa **somente esse banco**. `pnpm test:e2e` exige schema migrado/build pronto; inicia Next isolado com credenciais de ensaio e IA/Telegram desligados. `--browser` acrescenta Chromium; indisponibilidade é relatada, nunca aprovada automaticamente. WATER_BROWSER_REQUIRED=true torna ausência de navegador falha.
- [ ] Em /mapa cadastrar modelo, selecionar ponto físico e medidor correto; salvar/recarregar. Testar duas abas, outra unidade/organização, dispositivo não FLOW, medidor duplicado e entrada/ramais inválidos.
- [ ] Confirmar fonte, timestamp, zero real, falta de amostra, leitura antiga e ponto sem sensor. Não multiplicar um medidor entre cômodos. Medidores em série podem sobrepor volume; filtrar sensor no BI e PDF.
- [ ] Ensaiar 1920×1080, 390×844, 360×800 e tablet, teclado/foco, rótulos, pausa/movimento reduzido e navegação pelo celular real. Não prometer responsividade universal por build.
- [ ] Conferir Sala, QR e PDF só com água. Não herdar aceite de instrumentos retirados. Confirmar transporte Telegram externo com credenciais apenas em ambiente autorizado.
- [ ] Victor fornecer firmware MQTT atualizado, diagrama, fotos, calibração e telemetria física correlacionada. Não aprovar testes físicos antes dessas evidências.
- [ ] Produzir/revisar novo deck hídrico PDF/PPTX. Deck antigo está arquivado; roteiro 5min40 é alvo sem ensaio humano. FINAL bloqueado até `presentation/agua/APROVADA.md` após aprovação real.

## Limites

Basic Auth de laboratório e organização fixa do MVP; não é RBAC/multi-tenant completo. Planta não é projeto executivo, não simula pressão nem diagnostica vazamento/entupimento. Não fecha válvula, não comprova economia ou calibração. Vínculo cadastral não prova instalação física. Main/VPS continuam dependentes da aprovação de Ricardo.
