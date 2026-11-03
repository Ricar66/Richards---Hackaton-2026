# Escopo funcional detalhado — RICHARDS

**Legenda**: P0 = indispensável para a demonstração; P1 = bom ter; P2 = após o hackathon. `CONCLUÍDO` somente após teste real.

## F01 — Inicialização do ambiente [P0]
- PostgreSQL em container; aplicação Next.js no mesmo compose; variáveis documentadas; seed de organização, unidade e dispositivo de laboratório.
- Endpoints de saúde GET `/api/health`, erros compreensíveis e logs sem credenciais.
- **Aceite**: container sobe em máquina limpa, seed é reproduzível, `/api/health` responde; restart não apaga dados do volume.

## F02 — Painel executivo [P0]
- KPIs: litros monitorados, alertas ativos, ocorrências resolvidas, kg efetivamente entregues; comparação com período anterior **somente se calculada de dados reais**.
- Filtros globais: intervalo (24h/7d/30d), unidade, sensor e origem; sincronizados por URL e repassados ao backend.
- Estados: carregamento, vazio, erro, sem permissão, desconectado e modo DEMO.
- **Aceite**: mudar filtro altera todos os números e séries coerentemente; URL preserva filtro ao atualizar; sem mixar orgs.

## F03 — Monitoramento IoT [P0]
- Identidade do dispositivo, último contato, vazão atual, série temporal, contagem de pacotes e origem da leitura.
- Gráfico zoom/pan ou brush; tooltip com hora em `America/Sao_Paulo`, unidade e indicação de amostra.
- **Aceite**: 202 na ingestão, leitura visível; 401 para chave inválida; duplicata não soma litros.

## F04 — Ocorrências [P0]
- Abrir automaticamente por regra de vazão contínua; severidade configurável em laboratório.
- `OPEN -> ACKNOWLEDGED -> RESOLVED` e `OPEN/ACKNOWLEDGED -> DISMISSED` com justificativa.
- Timeline imutável de ações, origem do evento, equipamento, leituras que motivaram alerta.
- **Aceite**: não abrir alerta duplicado enquanto houver outro ativo do mesmo tipo/dispositivo; ação exige autorização; resolver exige nota com justificativa.

## F05 — Drilldown BI investigativo [P0 para uma jornada]
- Selecionar ponto de gráfico -> side panel com horário e valores -> link da ocorrência da janela -> timeline -> detalhes do dispositivo.
- Linha de referência e destaque de trechos suspeitos com legenda clara.
- **Aceite**: não inventar associação entre ponto e incidente; se não houver relação, mostrar “Nenhuma ocorrência associada”.

## F06 — Lotes alimentares [P0]
- Criar `PENDING_REVIEW`, registrar responsável, verificação humana, oferta `AVAILABLE`, reserva `RESERVED`, confirmação `DELIVERED`.
- Não permitir `DELIVERED` sem `RESERVED` e destinatário; não permitir `AVAILABLE` sem verificação documentada; recusas/cancelamentos não entram em kg entregues.
- **Aceite**: transições inválidas retornam 409; entregue só contabiliza após confirmação; rótulo DEMO visível.

## F07 — Relatório PDF [P0]
- Cabeçalho marca, organização/unidade, período, data de geração, filtros e fonte do dado.
- Página 1 indicadores e tendência; página 2 ocorrências e doações (listas resumidas), metodologia e limitações.
- **Aceite**: dados coerentes com o mesmo filtro do dashboard, números reais/demonstrativos separados, PDF legível em A4.

## F08 — Dispositivos e calibração [P1]
- Lista de dispositivos com estado; fator pulsos/litro; min L/min; duração exigida; indicação de última sincronização.
- Regra de offline baseada em último contato e janela configurada, executada em job/check dedicado (não confundir valor persistido com estado em tempo real).
- **Aceite**: painel exibe `lastSeenAt` e status correto; configurações validadas no servidor.

## F09 — Acesso e auditoria [P0 mínimo / P1 produção]
- Em demo restrita: senha de operador e dispositivo com chave única por máquina, nunca em JS cliente.
- Autorizações por operação e organização; separar `DEVICE` de usuário.
- Registrar quem alterou ocorrência e doação. **Aceite**: usuário de outra organização recebe 404/403 e não acessa dados alheios.
- Aviso: o Basic Auth atual do starter é **somente laboratório**; arquitetura definitiva pede sessão, RBAC e tenant.

## F10 — Simulação [P0 como contingência]
- Simulador produz leituras marcadas `SIMULATED`, nunca `DEVICE`.
- Botão “Simular evento” visível apenas no demo e em área identificada.
- **Aceite**: dados demo e dados reais podem ser filtrados; textos dos relatórios preservam origem.

## F11 — Acessibilidade e mobile [P1]
- Desktop prioritário para pitch projetado, mas layout responsivo 375px/768px/1440px.
- Controle por teclado, foco visível, contraste AA, legendas sem depender só de cor e opção reduzir movimento.
- **Aceite**: navegação por teclado e gráficos com resumo tabular acessível.

## Regras de negócio inegociáveis
1. `observedLiters` ≠ `savedLiters`.
2. Dado simulado deve ser identificável de ponta a ponta.
3. Um sensor de vazão não localiza, diagnostica ou certifica um vazamento.
4. Dados de organização A nunca aparecem para B.
5. Doação depende de avaliação humana e cumprimento das normas sanitárias.
6. Usuário sem autorização não confirma entrega nem apaga trilha de auditoria.
7. As métricas são agregadas no backend, não em dezenas de mapas locais no browser.
8. Filtros têm semântica consistente, inclusive fuso horário e limites do intervalo.
