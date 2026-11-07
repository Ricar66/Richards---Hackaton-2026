# Revisão 3D e mobile — RICHARDS, 07/11/2026

Ricardo pediu mais realismo no 3D ao vivo e adaptação ao celular. Implementação incremental em `feat/palco-3d-industrial`, PR para develop. O PR #6 do assistente foi integrado pela equipe durante esta revisão e foi preservado na base. Este trabalho não alterou main, VPS, contrato de telemetria, banco operacional, migration ou dependências. Sem novo motor/framework 3D.

## Base e comportamento

HEAD remoto inicial: develop `5189f9a898c867ab453db8dea1c72085b2194bfc`, main `f13cbc5ee4e66aa43e08039a752abe45e52af8ae`. Integramos develop até `cff38f849d8cd53de29a73a72bdf062b706e3374`, preservando escolas/doações/assistente/IoT. A última consulta também mostrou main em `cff38f8`, atualização externa a este trabalho. Conferir HEADs novamente antes de continuar. Não misturar esta revisão com deploy automático.

- Montagem industrial: mangas metálicas nos cotovelos, flanges com furos reais, juntas, bordas, 48 parafusos instanciados, apoios, base e cabo. Geometria esquemática, não réplica dimensional da bancada.
- Materiais PBR e três direções de luz. Água com profundidade visual e veios advectados pela mesma fase da vazão. Sem relógio independente para fazer a água parecer ativa; zero/ausência de leitura interrompem o fluxo.
- **Ampliar gêmeo** usa o mesmo canvas/contexto. Enquadramentos Isométrica/Inspeção, leitura atual no DOM, origem, pausa do desenho, foco contido e Esc/fechamento com retorno de foco. Não é nova fonte de dados.
- 3D solicitado automaticamente após carregar o cliente, salvo opção gravada/URL contrária. `?3d=0` é rollback imediato; `?3d=1` força a solicitação, nunca ignora a sonda.
- SVG sempre montado, movimento reduzido, perda de contexto e orçamento de quadros preservados. A pausa agora também cancela o pulso WAAPI 2D já em andamento.
- DPR inicial limitado a 1,25 em canvas estreito e 1,5 nos demais. Primeiro nível de degradação usa DPR 1 e oculta detalhes mecânicos opcionais; o próximo volta ao SVG. Não há bloom, sombras dinâmicas ou câmera em órbita automática.
- Layout de celular/tablet deixa de reduzir o telão inteiro: até 1024 px de largura ou 600 px de altura usa cartões com rolagem; abaixo de 640 px empilha todos. Canvas acompanha ResizeObserver, controles de toque têm 44 px e a ampliação respeita safe areas.

## Validação realmente executada

Ambiente Node 24.22.1, pnpm 10.16.1, Next 16.4.4:

| Verificação | Resultado |
|---|---|
| Unitários completos | PASSOU — 144 testes após integrar a base atualizada |
| Integração em PostgreSQL 18.6 isolado, banco `richards_assist_test` descartável | PASSOU — 116 testes, incluindo os 9 do assistente incorporados pela base |
| Prisma generate, typecheck e build de produção | PASSOU |
| ESLint dos componentes stage, novos testes/scripts e página ao-vivo | PASSOU |
| ESLint completo | PASSOU na base final. O erro preexistente de `fixture-activity-panel.tsx:60` foi corrigido pela equipe no commit `0c1e670`, incorporado sem sobrescrever o trabalho paralelo |
| Geometria Three.js real em CPU | PASSOU — matrizes/vértices finitos, dimensões delimitadas, 48 parafusos em uma InstancedMesh, montagem abaixo de 32 objetos desenháveis e 20 mil triângulos |
| HTTP sobre next start local com Basic | PASSOU — 401 sem auth; Sala/flags/controles SSR 200; ausência de dados explicitada. Não verifica layout/canvas |
| Testes Python do ZIP | PASSOU — 6 testes |
| Preview isolado gerado com componentes reais | PASSOU — bundle estático gerado; dados integralmente SIMULATED, sem conexão com banco/hardware |
| Renderer WebGL e interação/layout em navegador | NÃO EXECUTADO com sucesso — Chromium local recusou iniciar (`socket() Operation not permitted`); navegador conectado bloqueou abertura `data:` pela política de URL. Não houve contorno dessas restrições |
| Celulares reais, Safari/iOS, GPU do notebook e projetor | NÃO EXECUTADO |

Não anunciar fotorrealismo, 100% de compatibilidade, FPS ou aprovação de responsividade com base em typecheck/build/testes de geometria. A inspeção visual e a matriz abaixo são critérios de aceite pendentes antes de liberar para a banca.

## Claude — concluir o aceite visual

1. Ler AGENTS/MEMORIA, conferir HEADs e preservar mudanças concorrentes. PR #6 já está na base; conservar as atualizações dos dois trabalhos ao resolver eventual conflito futuro de documentação.
2. Rodar `pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm typecheck`, `pnpm lint`, `pnpm build` e unitários.
3. Para renderizar/inspecionar componentes reais sem API ou hardware: `node scripts/e2e/twin-preview.mjs`; abrir `.e2e/twin-preview/index.html` no navegador local autorizado. A adaptação de `next/dynamic` para React.lazy é só deste harness. Os botões de fixture não fazem parte da aplicação.
4. Em servidor LOCAL de homologação, executar `E2E_BASE_URL=http://localhost:3100 node scripts/e2e/twin-responsive.mjs`. Windows PowerShell: definir `$env:E2E_BASE_URL` e então rodar o script. Informar `CHROME_PATH` se necessário e credenciais locais somente no ambiente.
5. Executar `node scripts/e2e/twin-scene.mjs` em ambiente que permita Chromium. Esse harness testa o shader real, pausa/zero/stale, pulso sem fluxo, resize e dispose; usa SwiftShader explicitamente somente no harness. Nunca remover a recusa a software da aplicação. Esse ensaio não comprova desempenho de GPU real.
6. Medir em GPU real com Diagnóstico: FPS/p50/p95/DPR, perda de contexto e fallback. Repetir ligar/desligar/ampliar para conferir uso de memória e ausência de canvas duplicado. Verificar o wrap da fase da água, cores por origem/alarme e cancelamento imediato da pausa.
7. Provar no mesmo ensaio que leitura SIMULATED continua identificada; sem dado recente há ausência explícita e água parada; zero recente fica parado com pulso somente na chegada de novo pacote. O bot não participa deste fluxo.

| Viewport CSS | Aceite a registrar |
|---|---|
| 320×568 e 360×640 | Sem rolagem horizontal; texto e botões acessíveis; ampliar/fechar com alvo de toque; canvas visível |
| 390×844 | Retrato: gêmeo, gráfico e instrumentos por rolagem, sem números minúsculos |
| 768×1024 | Tablet: cartões e inspeção sem corte |
| 844×390 | Paisagem: controles/legendas cabem; inspeção utilizável |
| 1920×1080 | Telão: operação e selos legíveis; ampliação mantém hierarquia e enquadramento |

Nos aparelhos: testar zoom de texto, teclado/foco/Esc, redução de movimento, perda de conexão e rotação. Registrar navegador/modelo, screenshots, origem dos dados, diagnóstico e resultado. Até completar, manter este PR em rascunho e usar a versão estável ou `?3d=0` na demo. Não promover main/deploy sem autorização.
