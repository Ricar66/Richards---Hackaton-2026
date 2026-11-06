# Roteiro de palco — RICHARDS Intelligence (Hackathon Senac RP, 6–7/11/2026)

Complementa `docs/plano/13_PITCH_JORNADA_DEMO.md` (tese, falas de abertura, slides). Aqui estão os **cliques exatos** do BI nativo.

## Na véspera (30 min)
1. `docker compose up -d --build` e depois conferir `http://localhost:3000/api/health`. Precisa responder `"database":"up"`.
2. `pnpm build && pnpm test:e2e`. As 29 verificações precisam passar, inclusive A0/A5b (atraso medido em ms) e S1 (Sala ao vivo). Use banco de **teste**: o banco da demo não é tocado.
3. ESP32:
   - `secrets.h` com a mesma chave de `IOT_DEMO_DEVICE_KEY`;
   - Wi-Fi do evento;
   - NTP sincronizado;
   - abrir a serial e ver `POST 202`.
4. Liberar o palco. A regra permite **uma ocorrência ativa por sensor e tipo**: sem isso, o alerta ao vivo não abre.
   - `pnpm palco:checar`. É só leitura e sai com código 1 se algo bloquear o palco.
   - Se acusar bloqueio, rode `pnpm bancada --preparar`. Ele mostra o que vai encerrar e pede "SIM": passa a `richards-oc-01` do seed e as outras ativas de fluxo e temperatura para DISMISSED, com nota e auditoria, e **não apaga nada**.
   - A alternativa manual: no BI, em **Ocorrências**, resolver a "Fluxo contínuo fora de horário".
5. Navegador:
   - **Notebook (operador):** zoom de 100%, janela de 1440 px ou mais, Basic Auth já digitada, abas `/`, `/monitoramento?range=24h`, `/doacoes` e `/relatorios`.
   - **Telão:** `/ao-vivo` (Sala ao vivo) numa segunda janela, arrastada para o projetor. Clique na página e aperte **F** para tela cheia (**Esc** sai). Para fixar o sensor da vazão: `/ao-vivo?dispositivo=RICHARDS-FLOW-001`.
   - Conferir que a pílula do BI e o canto da Sala dizem **Ao vivo**.
6. Deixar dois terminais prontos (contingência, ver abaixo):
   - `pnpm bancada --cenario palco --inicio-em 5`, que move vazão, temperatura e balança (só depois de parar a ponte `pnpm mqtt`: `pnpm palco:checar --sensores VAZAO` acusa FALHA se houver leitura de vazão dela nos últimos 10 s; se você acabou de pará-la, espere 10 s e rode de novo);
   - `pnpm simulate --scenario leak --samples 14 --interval 4`, que só move a vazão, pelo HTTP.
7. **O histórico do seed envelhece.** Ele cobre de 27/10 a 03/11. Em 06/11, o filtro "7 dias" mostra só a parte final dele, e "24 h" fica vazio até o sensor ou o simulador enviar.
   - Use **30 dias** para mostrar o histórico.
   - Recriar o banco da demo apaga dados: só com autorização expressa da equipe.

## Demonstração (2 min, Dev 1, depois da fala de IoT)

| Tempo | Clique | Fala-guia |
|---|---|---|
| 0:00 | **Centro de controle**, filtro **7 dias** | "Tudo aqui vem do banco. Este carimbo roxo diz que o histórico é simulado. A plataforma nunca esconde a origem." |
| 0:10 | Passar o cursor no gráfico; mostrar o **mapa de calor** e a faixa da madrugada | "Vazão na madrugada é onde o desperdício contínuo aparece primeiro." |
| 0:20 | Filtro **24 h** + origem **Sensor** | "Agora só o que o sensor mediu, sem simulação." |
| 0:25 | IoT abre a torneira da bancada (fluxo ≥ 1,5 L/min por 30 s) | "A regra não dispara com um pico: espera fluxo contínuo." |
| ~0:55 | Aparece o aviso **"Nova ocorrência · Investigar"**; clicar em **Investigar** | "Assim que a ocorrência é gravada, a operação fica sabendo: o aviso chega pelo stream ao vivo." Só cite um tempo ("em menos de N s") se o E2E mediu no ensaio: checks A0 e A5b do `pnpm test:e2e` imprimem os ms. Se a pílula mostrar "Consulta a cada 5 s", diga "em até 5 segundos". |
| 1:00 | Na gaveta: gráfico da evidência acima do limiar; **Assumir investigação** | "Suspeita não é vazamento comprovado. Alguém assume e verifica." |
| 1:10 | IoT fecha a torneira; escrever a nota "Registro fechado; vazão zerou" → **Resolver** | "A resolução exige descrever a verificação. Fica na trilha, com autor." |
| 1:20 | **Doações & impacto** → lote "Hortaliças" em *Reservado* → **Confirmar entrega**, com o nome de quem recebeu | "Só conta como impacto o que a instituição confirmou ter recebido." |
| 1:40 | Mostrar o KPI **Kg entregues** subindo | |
| 1:45 | **Relatórios** → **Gerar PDF deste recorte**; abrir o arquivo | "Mesmos números do painel, mesmo filtro, origem carimbada." |

## Sala ao vivo (telão)

A `/ao-vivo` é a tela do projetor durante a fala de IoT e a demonstração. Ela mostra:

- A **vazão** da última leitura gravada, grande, com o selo da origem: TELEMETRIA REAL, SIMULADO ou POTENCIÔMETRO · SIMULADO.
- Uma faixa de 120 s. Buraco sem amostra fica sem linha.
- O **anel da regra**: um traço aceso por segundo **decidido pela regra** na última leitura, que nunca anda sozinho entre leituras. Os estados são OBSERVANDO, CONTANDO, OCORRÊNCIA ABERTA e BLOQUEADO PELA REGRA 5.
- **Temperatura** e **balança** (bancada MQTT ou virtual).
- Os números de **hoje** vindos do servidor.
- O **feed** de eventos. Mostra a instituição, nunca quem recebeu.
- A **viagem do último pacote**, com os trechos medidos em ms. Trecho sem relógio aparece como "não medido".

Falas:

| Momento | Diga |
|---|---|
| A vazão sobe | "Cada leitura gravada chega aqui pelo stream." |
| O anel conta | "A regra não dispara com um pico: ela conta segundos de fluxo contínuo, decididos no servidor a cada leitura." |
| OCORRÊNCIA ABERTA | "Suspeita, não vazamento comprovado. Agora uma pessoa verifica." Em seguida, troque para o notebook e clique em **Investigar**. |
| Viagem do pacote | Leia o número que **está na tela**, que é a medição daquela leitura. Não arredonde para baixo nem prometa outro valor. |

Selos: se a Sala mostrar **SIMULADO** ou **MISTO**, diga "SIMULAÇÃO" em voz alta.

## Contingências

| Falhou | Faça | Diga |
|---|---|---|
| Bancada física falha (placa, Wi-Fi, broker, sensor) | **Pare a ponte** (Ctrl+C no `pnpm mqtt`) e rode `pnpm bancada --cenario palco --inicio-em 5` (Enter 25 s antes do momento em que a vazão deve subir), com os três sensores. A ponte não descarta um sensor só: se a vazão falhou, ela precisa estar parada (só `--sensores VAZAO` também serve, com a ponte parada). Se só a temperatura ou a balança falhou, a ponte pode seguir e a bancada simula só esse: `--sensores TEMP` ou `--sensores PESO`. Com a ponte parada há menos de 10 s, a bancada confere por até 6 s se ainda chega leitura dela e começa (some isso ao horário do Enter). Ela só recusa o palco se a vazão de outra fonte continuar chegando | "SIMULAÇÃO: a bancada virtual manda o mesmo pacote do firmware, pelas mesmas regras. Os selos dizem SIMULADO." |
| ESP32 não envia (Wi-Fi, chave) | Rodar `pnpm simulate --scenario leak --samples 14 --interval 4` | "Agora com o simulador, que usa o mesmo protocolo do firmware. Os dados entram carimbados como SIMULADOS." |
| Sala ao vivo sem sinal ("sinal perdido" ou "consulta a cada 5 s") | Seguir a demonstração no BI do notebook. A Sala volta sozinha quando o stream reconecta | "A tela não inventa sinal: sem stream, ela diz isso e consulta o servidor." |
| Aviso de ocorrência não aparece | Ver se ficou ocorrência ativa do mesmo sensor (preparação, passo 4) | |
| BI nativo com problema | Abrir `/intelligence` (BI V3 de contingência, link no rodapé do menu) | |
| Banco caiu | A tela mostra "Dados indisponíveis". Reiniciar com `docker compose start db` | "Sem banco, a plataforma não inventa número." |
| Sem rede no palco | Rodar tudo em `localhost` no notebook (Docker local) | |

## Não diga
- "Economizamos X litros". Diga "volume observado".
- "Vazamento detectado". Diga "suspeita de fluxo contínuo".
- "Inteligência artificial". Diga "regra configurável".
- "Tempo real" ou "ao vivo" sem olhar a pílula do topo. Com ela em **Ao vivo**, diga "ao vivo: cada leitura gravada chega pelo stream". Com **Reconectando…** ou **Consulta a cada 5 s**, diga "consulta a cada 5 s". Tempo em milissegundos, só o que o E2E mediu.
- Números do seed como resultado de piloto.
- "Gêmeo digital" como cópia fiel do prédio. Diga "representação esquemática": o desenho é ilustrativo, e o valor ao lado dele é o gravado.
