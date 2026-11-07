# Arquitetura — RICHARDS Intelligence hídrico

Monólito modular Next.js App Router, TypeScript strict, Prisma/PostgreSQL e DDD-lite. BI React nativo, Three.js imperativo para o cano industrial e SVG para mapa/perspectiva/fallbacks.

| Área | Responsabilidade |
|---|---|
| monitoring | Validar/gravar vazão, aplicar regra configurada e registrar investigação |
| analytics / reports | Agregações PostgreSQL, filtros, proveniência e PDF |
| water-map | Topologia, vínculo por unidade, versões/auditoria e projeção de últimas amostras |
| realtime / audience | Eventos hídricos privados e projeção pública mínima da vazão |
| assistant | Ferramentas de leitura, cotas e notificações determinísticas |
| audit | Autor e mudanças na mesma transação do fato |

HTTP e MQTT compartilham ingestReading, idempotência por dispositivo/bootId/sequence e regra por origem. Potenciômetro é simulação. Ocorrência é suspeita a investigar, sem fechar válvula.

HydraulicMap é tabela aditiva ligada a Site, com JSON validado, versão, autor e data. Serviço bloqueia unidade antes de salvar e registra layout anterior/novo na auditoria. Só FLOW da organização/unidade fixas do MVP podem ser vinculados. Não há inferência de vazão em ramais sem medidor nem balanço de pressão.

Proteção existente: Basic Auth de laboratório, origem/JSON para escrita, mapa privado; a plateia não recebe cadastro interno ou responsáveis. Não é RBAC/multi-tenant completo. Polling do mapa a cada 5 s com aba visível, no-store e validade temporal. Movimento respeita pausa/redução de movimento e desempenho do cano 3D.

Schema/migrations antigos preservam histórico. Arquivo retirado não entra na entrega. Escopo: agua/ESCOPO.md. Resultados/pendências: agua/HANDOFF_CLAUDE.md. Main/VPS não são alteradas por este PR.
