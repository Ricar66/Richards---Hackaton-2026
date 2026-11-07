# Escopo atual — exclusivamente água

Decisão de Ricardo em 07/11/2026. Produto passa a monitorar vazão e organizar pontos hidráulicos de casa, comércio e obra. As jornadas de alimentos, doações, resíduos/Circular e os instrumentos de balança/temperatura/umidade foram retirados. PR #10 foi encerrado sem merge.

## Mapeamento

Três modelos são **esquemas sem escala**, sem vínculo presumido com sensor e sem cálculo físico de pressão. Até 32 pontos, 20 ambientes e 40 ramais; uma entrada, grafo conectado, sem ciclos e sem múltiplos pais. Nome/posição/vínculo de ponto são editáveis. Novos pontos saem da distribuição. Edição CAD e desenho livre de ramais não estão implementados.

Um medidor FLOW representa no máximo um ponto da mesma unidade/organização. A configuração não comprova sua instalação física. Só a leitura do medidor vinculado aparece naquele ponto. Não estimar cada cômodo com o medidor da entrada. Medidores em série não devem ser somados como consumos independentes; o mapa não soma vazões. Nos agregados do BI, filtrar um sensor ao investigar sobreposição.

Perspectiva é **vetorial**, não uma nova cena Three.js. Planta SVG 2D acessível permanece disponível; cano industrial Three.js da Sala continua. Animação exige amostra finita, positiva e recente (até 120 s), da origem selecionada; leitura antiga/futura indevida fica neutra. Há pausa e prefers-reduced-motion. Filtros DEVICE e SIMULATED separados. Pontos não instrumentados não recebem números.

HydraulicMap persiste por unidade, com versão, autor e auditoria na mesma transação. Bloqueio da unidade evita gravação concorrente silenciosa. Rascunhos são identificados e não alteram telemetria. Consultas usam PostgreSQL DISTINCT ON para última amostra por medidor/origem, sem levar a série inteira ao navegador. TIMESTAMP de captura é UTC; comparação SQL usa NOW() AT TIME ZONE 'UTC', independente do fuso do servidor.

## Retirada e preservação

APIs antigas: 410; páginas antigas: redirecionamento para /mapa. MQTT exige VAZAO e descarta campos extras antigos, sem outros efeitos. Só dispositivos FLOW são aceitos nos canais. Ocorrências térmicas antigas saem de consultas, eventos, assistente e Telegram atuais. Resumo pendente é regenerado antes de enviar; avisos antigos sem vínculo hídrico válido são ignorados, sem excluir a fila.

Migrations, tabelas/enums e codecs legados permanecem por preservação do histórico. Slots vazios em DTOs internos servem à compatibilidade; projeções JSON atuais removem essas chaves. Código/material retirado está em archive/previous-scope/, como texto não executável ou ativo histórico, fora do ZIP. Nenhuma linha de banco real foi removida/resetada.

## Evidências e limites

Não há localização automática de sensor, simulação de pressão, diagnóstico conclusivo, fechamento remoto de válvula ou economia comprovada. Planta não substitui projeto executivo. Aplicação em prédios/obras é proposta de uso, não implantação física comprovada. Calibração, firmware MQTT atualizado, diagrama/fotos do Victor, teste físico, celular real, projetor e carga de público exigem evidências próprias.

O deck anterior de dez imagens foi arquivado. Novo roteiro para quatro integrantes mira 5min40, sem ensaio humano cronometrado. Novo deck/PDF/PPTX precisa ser produzido e aprovado antes de FINAL.
