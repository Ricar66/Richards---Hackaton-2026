# Instrumentos 3D — revisão complementar de 07/11/2026

Pedido de Ricardo após as capturas da Sala: estender o acabamento à balança, temperatura, anel da regra, eventos e viagem do pacote. Branch de revisão `feat/instrumentos-3d`, PR para develop. Base inicial develop `95511dea10da1e1c353b87b203c59f2ffcf656c6`; main consultada `07b92f41ef0a4bb313c57fe83ae3385c034724fc`. Conferir novamente antes de continuar. Nenhuma alteração de main/VPS/banco/API, migration ou dependência por este trabalho.

## Comportamento

- Balança Three.js com prato metálico, pés, caixa de madeira e carga ilustrativa proporcional à fração já calculada pela view existente. As frutas não identificam nem contam alimentos; não representam a capacidade física da célula.
- Instrumento térmico Three.js com corpo, escala, coluna e módulo esquemático. Coluna e cor vêm da fração/estado existentes; não são termômetro físico ou nova medição.
- Sem laço de animação nos novos modelos. Renderiza por mudança de leitura, resize ou retorno à visibilidade; não mantém RAF/setAnimationLoop. Atualizações são discretas, sem avançar estabilidade pelo relógio.
- Sem leitura recente: remove carga/coluna ativa. O DOM conserva eventual último valor explicitamente rotulado. Nunca confundir ausência de sinal com leitura zero.
- SVG continua montado e acessível, com marcação de SIMULATED. `?3d=0`, tecla 3 e movimento reduzido também controlam os novos instrumentos. Sem IntersectionObserver/WebGL2, GPU por software, erro, perda de contexto ou orçamento excedido, fica no SVG. Para tentar de novo, desligar e religar 3D.
- Novos contextos são criados só após interseção do cartão com a região visível/próxima. Limite desta tela: um canvas do cano e até dois dos instrumentos, nunca um canvas por fruta. DPR dos novos instrumentos limitado a 1,25, reduzido a 1 se a submissão CPU permanecer lenta; depois fallback. O diagnóstico desses instrumentos mede a última submissão CPU, não FPS nem tempo GPU.
- Anel da regra ganha moldura/face com profundidade em SVG; mantém os mesmos segundos confirmados. Eventos e nós do pacote ganham acabamento CSS, sem WebGL adicional. Pulso WAAPI do pacote passa a cancelar ao pausar/reduzir movimento.
- Layout estreito preserva valores no DOM e reorganiza as legendas da viagem em três colunas abaixo dos nós. Temperatura mantém regras/alarme em largura total; o gráfico decorativo se compacta com alarme. Revisar o encaixe visual em cada viewport.

## Validação desta revisão

PASSOU: **155 testes unitários**, incluindo seis novos cenários de instrumentos: atualidade, zero versus ausência, estabilidade sem interpolação, origem simulada, fallback/movimento reduzido, cor de alarme no SVG, geometria Three.js finita, limite de malhas/triângulos, pose idempotente e descarte de recursos compartilhados uma vez. Cada modelo ficou abaixo dos limites testados de 75 objetos desenháveis e 20 mil triângulos. Isso não comprova FPS.

PASSOU: Prisma generate, typecheck, lint completo, build Next.js; seis testes Python de empacotamento; prévia HTML isolada compilada com fixture SIMULATED de temperatura/peso; fumaça HTTP em next start local com Basic: 401 sem autenticação, Sala 200, dois instrumentos acessíveis no SSR, flags 2D/3D, ausência honesta de dados e nenhum canvas criado no SSR.

NÃO EXECUTADO nesta revisão: renderer WebGL dos instrumentos, pixel/layout/interação de navegador, celular físico, Safari/iOS, GPU real e projetor. As restrições do ambiente já registradas no PR #7 continuam conhecidas; não foram contornadas. Não atribuir aos novos modelos o aceite de GPU/36 jornadas executado pelo Claude anteriormente para o cano. Integração PostgreSQL/hardware não foi reexecutada nesta etapa de interface; os contratos e serviços de ingestão não foram alterados.

## Claude — aceite antes de liberar

1. Ler AGENTS/MEMORIA e este arquivo; preservar os aceites anteriores como histórico, e conferir os HEADs atuais.
2. Rodar install congelado, generate, typecheck, lint, unitários e build.
3. `node scripts/e2e/twin-preview.mjs`: abrir o HTML local gerado e clicar **Fixture: temperatura/peso**. Esse botão só existe no harness. Todos os dados são SIMULATED; nenhum banco/API/hardware é usado. O evento é efêmero como no produto. Aguardar a expiração da leitura e comprovar neutralização dos modelos.
4. `node scripts/e2e/instruments-scene.mjs`: harness local do renderer real, com SwiftShader explicitamente só no teste. Confere imobilidade sem dado novo, alteração discreta por leitura, estado stale, resize e dispose. A recusa a software da aplicação permanece.
5. Contra Next LOCAL: `E2E_BASE_URL=http://localhost:3100 node scripts/e2e/twin-responsive.mjs` (PowerShell: definir variável no ambiente primeiro). Matriz: 320×568, 360×640, 390×844, 768×1024, 844×390, 1920×1080 e movimento reduzido. Testar também temperatura em alarme, peso estabilizando, bloqueio de lote, número comprido e origem SIMULATED.
6. Medir na GPU real com cano e dois instrumentos juntos. Esperar até três canvases nesta versão, um por instrumento, e ZERO com 2D forçado. Verificar 10 ciclos de liga/desliga, rolagem, resize, perda de contexto, heap/contextos e frame time do cano. Não reutilizar a antiga asserção de um canvas para a página inteira.
7. Conferir que regras e valores não ficam cortados em Full HD, celular/zoom/rotação. Pausa interrompe movimento decorativo; dados e poses discretas por leitura continuam atualizando. Sem leitura nova não há movimento nos instrumentos.
8. Registrar screenshots e resultados antes de sair de rascunho. Não fazer merge em main nem publicar VPS sem autorização. Rollback imediato: `?3d=0`.

Proposta adicional trazida durante este trabalho: [RICHARDS Circular](../propostas/RICHARDS_CIRCULAR.md), apenas roadmap e cenário ilustrativo. Não há módulo Circular implementado neste PR.
