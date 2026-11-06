# Só dados reais: limpeza do cenário fictício e cadastro de instituição

Em 06/11/2026 o Ricardo decidiu que a demonstração fica **só com dados reais**. Isso vale para o notebook e para a VPS.

- **O que sai:** tudo o que é `SIMULATED` e as duas instituições "· Demonstração".
- **O que fica:** o cadastro-base, isto é, a empresa, a unidade, o sensor `RICHARDS-FLOW-001` com o hash da chave e o operador.
- **A simulação** (bancada virtual, simulador e botão Simular) continua como **reserva de palco**. O que ela gerar sai carimbado SIMULADO e é apagado depois com o mesmo comando.

## O que mudou no código

- **`prisma/seed.ts`** roda a cada start do contêiner e grava **só o cadastro-base**.
  - O cenário fictício (histórico de 7 dias, 3 ocorrências, 3 lotes e as instituições de demonstração) só entra com `SEED_DEMO_DATA="true"`.
  - Use essa opção só em banco de teste: o `pnpm test:e2e` já a define.
- **`pnpm dados:limpar-simulados`** (`src/admin/run-dados-reais.ts` e `src/modules/admin/application/dados-reais.ts`). Ele tem 4 travas:
  - apaga só linhas com `source = SIMULATED`: leituras, ocorrências (com eventos, auditoria e missões ligadas) e lotes. Leitura, ocorrência ou lote `DEVICE` ou `MANUAL` nunca é tocado (regra 12 do prompt mestre e Fase 4);
  - só remove a instituição de demonstração que ainda tem "Demonstração" no nome e que não está ligada a nenhum lote real;
  - recusa se chegou leitura SIMULATED nos últimos 2 min, o que indica bancada, simulador ou ponte ligados;
  - roda tudo numa transação e grava `SIMULATED_DATA_PURGED` na auditoria, com as contagens e o autor `admin:<usuário>`. O "último contato" do sensor volta para a leitura real mais recente; sem leitura real, o sensor fica sem comunicação até o próximo pacote.
- **`pnpm instituicao:cadastrar`** cadastra a instituição real que recebe doações, com auditoria. Não há tela para isso.

Testes: `tests/integration/dados-reais.test.ts` (D1–D7). Num teste de mutação, apagar todas as leituras faz o D2 FALHAR.

## Passo a passo (notebook)

```bash
# 1. backup (fora do repositório)
docker exec richards-platform-db-1 pg_dump -U richards -d richards -Fc -f /tmp/antes.dump
docker cp richards-platform-db-1:/tmp/antes.dump E:/CraftOps/backups/richards/richards-antes-limpeza-<data>.dump

# 2. código novo no contêiner (o seed antigo recriaria o histórico no próximo start)
docker compose up -d --build web

# 3. pare bancada, simulador e `pnpm mqtt`; veja o inventário (não apaga nada)
pnpm dados:limpar-simulados

# 4. apaga (pede SIM; no contêiner, sem terminal: --apagar --confirmar)
pnpm dados:limpar-simulados --apagar

# 5. instituição real que vai receber as doações
pnpm instituicao:cadastrar --nome "Nome da instituição" --cidade "Ribeirão Preto"
pnpm instituicao:cadastrar --listar
```

**Na VPS:** o mesmo, com os comandos dentro do contêiner `web` do recurso `richards-demo` (`docker exec <contêiner> pnpm dados:limpar-simulados ...`). O backup vai para `/root/.richards-deploy/backups/` (modo 600). O código novo entra pela branch `deploy/vps-hackathon` e pelo Redeploy, como em `docs/DEPLOY_VPS_TETRIA.md`.

## Depois da limpeza

- **O BI começa vazio.** Os KPIs de água mostram "sem dados", nunca zero, até o ESP32 enviar.
  - O histórico nasce do sensor.
  - O filtro **24 h** é o que mostra a bancada ao vivo.
- **A doação precisa de uma instituição real** para reservar, cadastrada no passo 5.
- **Se a contingência for usada no palco,** a tela mostra o carimbo roxo SIMULADO. Depois do evento, rode o passo 4 de novo.
- **Bancada MQTT do Victor:** a vazão do potenciômetro é SIMULATED por padrão (`MQTT_SIMULATED_SENSORS="VAZAO"`). Vazão real só sai com o YF-S201 ligado e `MQTT_SIMULATED_SENSORS=""`.

## Volta atrás (sem perder o que veio depois)

O backup é um `pg_dump -Fc`. Para trazer de volta **só** o cenário fictício, sem apagar dado real gravado depois, restaure o backup num banco **separado** e copie de lá o que precisar:

```bash
docker exec richards-platform-db-1 createdb -U richards richards_restauro
docker exec -i richards-platform-db-1 pg_restore -U richards -d richards_restauro < E:/CraftOps/backups/richards/<arquivo>.dump
```

Restaurar por cima do banco da demo (`pg_restore --clean`) apaga o que foi gravado depois do backup. Só com autorização expressa.
