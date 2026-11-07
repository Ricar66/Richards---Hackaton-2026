# Controle de 3D e da Sala ao vivo — uso no palco

**Objetivo:** o visual acompanha os dados; ele não pode parecer mais confiável que a medição.

## Estado atual do código
- Rota `/ao-vivo` é a Sala ao Vivo separada do BI.
- O desenho **SVG 2D** é o padrão. O **Three.js 3D** é opcional e carregado sob demanda.
- Tecla **3** liga/desliga o 3D. **P** pausa o movimento, não os números. **D** mostra diagnóstico GPU, FPS e motivo do fallback. **F** alterna tela cheia quando os atalhos estiverem habilitados.
- `/ao-vivo?3d=1` pede 3D; `/ao-vivo?3d=0` volta ao 2D. `?atalhos=0` desativa atalhos de uma tecla.
- A água para sem leitura recente, e sua velocidade vem da vazão recebida. Uma leitura simulada recebe selo e tratamento visual de simulação.
- Sem WebGL2, GPU inadequada, preferência por movimento reduzido, perda de contexto ou problema de orçamento de quadros: deve haver retorno ao SVG, sem inventar dados.

## Controles visíveis

A Sala tem botões de pausa, solicitação de 3D e diagnóstico mesmo com `?atalhos=0`. O selo junto ao desenho mostra o modo efetivo e explica a volta ao SVG. Solicitar 3D não significa que ele foi ativado: a cadeia de desempenho continua decidindo. Movimento reduzido mantém SVG. Os novos controles precisam de ensaio interativo e no projetor.

## Ensaio obrigatório no projetor
1. Abrir a Sala no notebook em 1920×1080 com a fonte real prevista para o palco.
2. Verificar que o selo indica a origem correta: DEVICE ou SIMULATED.
3. Ativar 3D com 3; conferir legibilidade dos números, sem cortes ou queda de FPS.
4. Aumentar/reduzir a vazão real e verificar correspondência da animação.
5. Interromper a vazão e conferir que ela para. Desconectar sensor/rede e verificar aviso de indisponibilidade.
6. Assumir uma ocorrência e verificar que o alarme muda de estado.
7. Pressionar P e conferir que só o movimento pausa.
8. Pressionar 3 e verificar o retorno imediato ao SVG 2D.
9. Se o 3D não passar, **deixar 2D na apresentação**. O backup é uma prova de maturidade, não falha.

**Não mudar a física visual nem refazer o 3D na véspera do evento** sem um teste que comprove o ganho e um rollback rápido.

**Resultado do teste no projetor:** NÃO EXECUTADO

**Responsável / equipamento / data:** PENDENTE
