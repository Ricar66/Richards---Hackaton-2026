# RICHARDS Intelligence — inteligência hídrica

Protótipo do Hackathon Senac Ribeirão Preto 2026. Conecta **vazão de água → ponto da instalação → ocorrência suspeita → investigação humana → relatório**.

O escopo atual é exclusivamente água. A plataforma organiza instalações de **casa, comércio e edifício em construção**. Jornadas anteriores foram retiradas, preservando o histórico existente. Regras e limites: [docs/agua/ESCOPO.md](docs/agua/ESCOPO.md).

## Funcionalidades

- BI nativo em `/`, `/monitoramento`, `/ocorrencias`, `/dispositivos` e `/relatorios`.
- `/mapa`: três modelos, planta SVG 2D/perspectiva vetorial, nome/posição/vínculo editáveis, novos pontos e cadastro compartilhado por unidade, com versão e auditoria.
- `/ao-vivo`: cano industrial Three.js, regra e eventos, com fallback SVG, pausa, movimento reduzido e desempenho adaptativo.
- `/plateia`: vazão pública por QR, somente leitura, com origem e validade temporal. `/convite` é privado.
- `/assistente`: consulta somente leitura e Telegram opcional para ocorrências hídricas e comunicação dos medidores.
- HTTP/MQTT: identidade, idempotência e regra configurável por sensor/origem.

Ponto sem medidor fica **não instrumentado**. A planta é esquemática e sem escala; não simula pressão nem certifica projeto executivo. Não distribuir a vazão de um único medidor para todos os cômodos. Medidores em série podem sobrepor volumes: filtre um sensor para investigar sua medição. Volume registrado não é economia e ocorrência não confirma vazamento.

## Instalação local

Node.js compatível com Next 16/Prisma 7 (20.19+), pnpm 10.16.1 e PostgreSQL 16; ou Docker Compose. Criar `.env` a partir de `.env.example` e preencher credenciais localmente. Nunca versionar segredos.

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
# Configure DATABASE_URL, AUTH_MODE=basic, credenciais do operador e IOT_DEMO_DEVICE_KEY.
pnpm db:generate
pnpm db:deploy
pnpm db:seed
pnpm build
pnpm start
```

Migração nova `20261107190000_water_map`: somente tabela `HydraulicMap`. Revisar em homologação e manter backup autorizado antes de implantar. **O startup padrão do container aplica migrations.** Não atualizar a VPS só para experimentar a página.

```sh
docker compose up -d --build
```

Seed mantém o cadastro existente e não inventa leituras por padrão. `SEED_DEMO_DATA=true` acrescenta histórico SIMULATED somente em ambiente de teste. Em `/mapa`, escolher unidade/modelo, selecionar o ponto físico correto, vincular o medidor e salvar. Nada é vinculado automaticamente. Conflito de versão exige recarregar a planta, sem sobrescrita silenciosa.

## IoT e demonstração

Firmware HTTP em `iot/esp32_richards/`. [Contrato hídrico](docs/CONTRATO_IOT.md). Ponte `pnpm mqtt` exige vazão e ignora campos extras antigos. Potenciômetro é SIMULATED; DEVICE não aprova calibração.

```sh
pnpm palco:checar       # somente leitura
pnpm bancada vazao     # exige DEMO_MODE=true, apenas dados SIMULATED
```

Páginas antigas `/doacoes` e `/circular` redirecionam para o mapa; APIs retiradas respondem 410. Tabelas/enums antigos permanecem para preservar dados. Fontes/materiais arquivados não entram no ZIP.

## Qualidade e entrega

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration   # TEST_DATABASE_URL deve terminar em _test; limpa só esse banco
pnpm build
pnpm test:e2e           # build e banco de teste migrado prontos
python -m unittest discover -s tests -p test_entrega.py
python scripts/entrega/gerar_zip.py --saida dist
python scripts/entrega/verificar_zip.py dist/ARQUIVO.zip --extrair pasta_nova
```

Resultados e revisão: [handoff para Claude](docs/agua/HANDOFF_CLAUDE.md). [Arquitetura](docs/ARQUITETURA.md). [Demonstração](docs/ROTEIRO_DEMO.md).

**O deck visual anterior foi arquivado.** O novo roteiro hídrico não é um deck aprovado; nova apresentação visual, PDF e PowerPoint ainda precisam ser produzidos/revisados. FINAL fica bloqueado até esse aceite. Nenhum teste automatizado substitui calibração, bancada, celular físico ou projetor.
