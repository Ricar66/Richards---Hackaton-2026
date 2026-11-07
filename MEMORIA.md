# MEMÓRIA ATUAL — RICHARDS Intelligence

## Decisão de Ricardo — 07/11/2026

Produto passa a monitorar **exclusivamente água**, com mapeamento de pontos em casa, comércio ou edifício em construção. Alimentos, doações, Circular/resíduos, balança, temperatura e umidade foram retirados da operação. PR #10 do Circular foi encerrado sem merge; sua branch histórica foi preservada.

Base remota conferida: develop e main em `29cb92fc2ec7ba68d5b96eb4250bed4aafa52f66`. Trabalho em branch temporária de revisão `feat/water-flow-mapping`, alvo develop. Nenhuma autorização de main/VPS é inferida. Nenhum dado real foi apagado e nenhuma migração do banco da operação foi executada.

## Implementação atual

- `/mapa`: três modelos esquemáticos, planta 2D/perspectiva vetorial, pontos editáveis, vínculo explícito com medidor FLOW da própria unidade. Sem sensor, sem leitura. Não é simulação hidráulica ou projeto executivo.
- `HydraulicMap`: cadastro JSON validado, versão, autor e auditoria transacional com layout anterior. Migração `20261107190000_water_map` é aditiva.
- Telemetria HTTP/MQTT, regra configurada, investigação e PDF continuam. O cano industrial Three.js permanece com fallback/pausa/desempenho. Instrumentos retirados estão arquivados.
- MQTT exige VAZAO; ignora campos extras antigos e não cria outras jornadas. HTTP/MQTT só aceitam cadastro FLOW. Bancada virtual agora é exclusivamente vazão, SIMULATED, sem comandos de encerramento/limpeza de fatos reais.
- APIs antigas respondem 410; `/doacoes` e `/circular` levam ao mapa. Ocorrências térmicas históricas não entram nas consultas/eventos/assistente/notificações atuais.
- Histórico do banco, migrations e codecs de mensagens antigas são preservados. DTOs internos ainda têm slots vazios de compatibilidade; APIs atuais removem essas chaves. Código/material retirado está em `archive/previous-scope/`, fora da entrega e da compilação.
- Leituras são UTC: mapa usa `NOW() AT TIME ZONE 'UTC'` na comparação SQL, inclusive com PostgreSQL no fuso de São Paulo. Não voltar ao NOW() implícito para TIMESTAMP sem timezone.

## Entrega e validação

O ambiente anterior ficou indisponível e seu diretório de trabalho foi removido na manutenção. A implementação foi reaplicada nesta sessão; os resultados daquela sessão são históricos. Consultar `docs/agua/HANDOFF_CLAUDE.md` para os resultados atuais e aceites pendentes. Não atribuir um teste da cópia anterior a uma revisão nova sem executá-lo de novo.

Deck visual anterior arquivado. Roteiro hídrico alvo 5min40 existe; novo deck/PDF/PPTX ainda precisa ser produzido/aprovado. O gerador bloqueia FINAL sem esse aceite. Fotos, firmware MQTT do Victor, calibração, hardware, celular físico e projetor dependem de evidência própria.

## Resultados reexecutados nesta reconstrução

PASSOU: instalação frozen/generate, typecheck, lint, build, 132 unitários, 87 integrações em PG18.6 isolado (timezone America/Sao_Paulo), 6 testes Python e fumaça HTTP contra Next produção. Corpo limitado/401/CSRF/410, persistência/conflito, telemetria 202/duplicata, origem e projeções verificados.

NÃO EXECUTADO/pendente: Chromium encerrou ao conectar (Target.setDiscoverTargets: Target closed); layout/GPU/mobile não aprovados. PG16, celular físico, hardware/calibração, projetor, carga de público e API externa permanecem sem aceite desta sessão. Prévia extraída com CRC/hashes e seleção de conteúdo; não é ZIP FINAL aprovado. Checkpoint remoto preservado antes da tentativa de browser; PR de revisão para develop, sem merge automático.
