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

## Aceite executado por Claude — 07/11/2026, tarde

**Ambiente:**
- máquina: notebook Tracbel, Chrome 156 headless;
- GPU real: Intel(R) Graphics, ANGLE Direct3D11;
- dados: `next start` local na porta 3100, banco de teste `*_test`, bancada virtual (tudo SIMULATED);
- base: develop `95511de` + este PR.

| Verificação | Resultado |
|---|---|
| install, generate, typecheck, lint e build | PASSOU |
| Unitários | PASSOU 155/155 |
| Integração (Postgres de teste) | PASSOU 116/116 |
| E2E das jornadas | PASSOU 36/36 |
| `instruments-scene.mjs` (SwiftShader, só no harness) | PASSOU nos dois instrumentos |
| `twin-responsive.mjs` | PASSOU 7/7 depois das correções abaixo. O teste agora também confere os rótulos da viagem (até 2 linhas e sem sobreposição) |
| Ensaio na GPU real | PASSOU 16/16 (detalhes abaixo) |
| Capturas durante a bancada (temperatura contando e em alarme, balança instável e com lote pendente; telão e celular 390) | PASSOU depois das correções abaixo |
| Projetor do evento, celulares físicos (iOS/Safari, Android), zoom de texto e rotação real | **NÃO EXECUTADO** |

**Ensaio na GPU real:**
- **Abertura:** com 3D automático, o cano e os dois instrumentos ficam em 3D em cerca de 2,2 s, com 3 canvas. Com `?3d=0`, 0 canvas.
- **Desempenho:** com a água correndo e os 3 contextos, 60 fps, p50 16,7 ms, p95 16,8 ms, máximo 16,9 ms.
- **Imobilidade:** sem dado novo, os instrumentos ficam parados (imagem idêntica com o CSS congelado), antes e depois da bancada.
- **Estados:** temperatura sustentada e balança com lote de 6 kg aparecem SIMULADAS e em 3D.
- **Perda de contexto da balança:** só ela vai ao 2D (motivo `lost`); o cano e a temperatura seguem em 3D.
- **Liga/desliga:** 10 ciclos terminam com 3 canvas. Heap JS de 11,3 para 11,0 MB.
- **Celular 390×844 (DPR 3):** o contexto dos instrumentos só nasce ao rolar até eles (1 canvas antes, 3 depois), sem rolagem horizontal.
- **Recaídas para o 2D:** "reduzir movimento", sem WebGL e GPU desligada deixam tudo em 2D, com 0 canvas.
- **Rede e erros:** 0 pedidos externos e 0 erros de JavaScript.

**Correções feitas no aceite (`stage.css`, `twin-responsive.mjs`):**
1. **Abaixo de 640 px, os rótulos da Viagem quebravam letra por letra** (por exemplo "p o n t e / A P I").
   - Causa: o rótulo é absoluto dentro de um nó de largura ~0. Com `overflow-wrap: anywhere`, a largura disponível era ~0.
   - Correção: `width: max-content`.
   - Prova de mutação: sem a correção, o teste falha (4, 9 e 5 linhas); com ela, passa.
2. **Em 360 px, "dispositivo" e "ponte / API" se encostavam.** Agora o 2º e o 4º rótulo ficam acima da linha.
3. **No telão, com a ocorrência de temperatura aberta,** o termômetro fica compacto e a etiqueta "3D · sob demanda" ficava por cima dele. A etiqueta agora some só nesse estado.

**Observação:** no telão, o termômetro 3D é pequeno, sobretudo com alarme. Os números grandes continuam sendo a leitura principal; o instrumento é ilustrativo.
