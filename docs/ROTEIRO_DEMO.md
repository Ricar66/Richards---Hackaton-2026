# Roteiro de palco — RICHARDS Intelligence (Hackathon Senac RP, 6–7/11/2026)

Complementa `docs/plano/13_PITCH_JORNADA_DEMO.md` (tese, falas de abertura, slides). Aqui estão os **cliques exatos** do BI nativo.

## Na véspera (30 min)
1. `docker compose up -d --build` e depois conferir `http://localhost:3000/api/health`. Precisa responder `"database":"up"`.
2. `pnpm build && pnpm test:e2e`. As 26 verificações precisam passar. Use banco de **teste**: o banco da demo não é tocado.
3. ESP32:
   - `secrets.h` com a mesma chave de `IOT_DEMO_DEVICE_KEY`;
   - Wi-Fi do evento;
   - NTP sincronizado;
   - abrir a serial e ver `POST 202`.
4. No BI (`http://<ip>:3000`), em **Ocorrências**, resolva a ocorrência do seed "Fluxo contínuo fora de horário". A regra permite **uma ocorrência ativa por sensor**; sem isso, o alerta ao vivo não abre.
5. Navegador:
   - zoom de 100% e janela de 1440 px ou mais;
   - Basic Auth já digitada;
   - abas abertas: `/`, `/monitoramento?range=24h`, `/doacoes` e `/relatorios`.
6. Deixar o terminal pronto com `pnpm simulate --scenario leak --samples 14 --interval 4` (contingência).

## Demonstração (2 min, Dev 1, depois da fala de IoT)

| Tempo | Clique | Fala-guia |
|---|---|---|
| 0:00 | **Centro de controle**, filtro **7 dias** | "Tudo aqui vem do banco. Este carimbo roxo diz que o histórico é simulado. A plataforma nunca esconde a origem." |
| 0:10 | Passar o cursor no gráfico; mostrar o **mapa de calor** e a faixa da madrugada | "Vazão na madrugada é onde o desperdício contínuo aparece primeiro." |
| 0:20 | Filtro **24 h** + origem **Sensor** | "Agora só o que o sensor mediu, sem simulação." |
| 0:25 | IoT abre a torneira da bancada (fluxo ≥ 1,5 L/min por 30 s) | "A regra não dispara com um pico: espera fluxo contínuo." |
| ~0:55 | Aparece o aviso **"Nova ocorrência · Investigar"**; clicar em **Investigar** | "Em até 5 segundos a operação fica sabendo." |
| 1:00 | Na gaveta: gráfico da evidência acima do limiar; **Assumir investigação** | "Suspeita não é vazamento comprovado. Alguém assume e verifica." |
| 1:10 | IoT fecha a torneira; escrever a nota "Registro fechado; vazão zerou" → **Resolver** | "A resolução exige descrever a verificação. Fica na trilha, com autor." |
| 1:20 | **Doações & impacto** → lote "Hortaliças" em *Reservado* → **Confirmar entrega**, com o nome de quem recebeu | "Só conta como impacto o que a instituição confirmou ter recebido." |
| 1:40 | Mostrar o KPI **Kg entregues** subindo | |
| 1:45 | **Relatórios** → **Gerar PDF deste recorte**; abrir o arquivo | "Mesmos números do painel, mesmo filtro, origem carimbada." |

## Contingências

| Falhou | Faça | Diga |
|---|---|---|
| ESP32 não envia (Wi-Fi, chave) | Rodar `pnpm simulate --scenario leak --samples 14 --interval 4` | "Agora com o simulador, que usa o mesmo protocolo do firmware. Os dados entram carimbados como SIMULADOS." |
| Aviso de ocorrência não aparece | Ver se ficou ocorrência ativa do mesmo sensor (preparação, passo 4) | |
| BI nativo com problema | Abrir `/intelligence` (BI V3 de contingência, link no rodapé do menu) | |
| Banco caiu | A tela mostra "Dados indisponíveis". Reiniciar com `docker compose start db` | "Sem banco, a plataforma não inventa número." |
| Sem rede no palco | Rodar tudo em `localhost` no notebook (Docker local) | |

## Não diga
- "Economizamos X litros". Diga "volume observado".
- "Vazamento detectado". Diga "suspeita de fluxo contínuo".
- "Inteligência artificial" ou "tempo real". Diga "regra configurável" e "consulta a cada 5 s".
- Números do seed como resultado de piloto.
