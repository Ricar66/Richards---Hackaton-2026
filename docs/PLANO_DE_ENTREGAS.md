# Plano de execução por equipe · RICHARDS 0.1

| Sprint / dono | Entrega | Aceite objetivo |
|---|---|---|
| IoT 1 | circuito fechado, sensor, proteção 3,3V | vazão medida repetida 3 vezes com margem anotada |
| IoT 2 | firmware + credencial + NTP | 10 pacotes consecutivos, 401 com chave errada |
| Dev 2 | Docker Compose PostgreSQL e Prisma | DB saudável, schema criado, seed idempotente |
| Dev 2 | API IoT, alertas, ocorrências e doações | casos 202/401/422/503; alertas e transições |
| Dev 1 | dashboard executivo responsivo | KPI, linha temporal, donut, alertas, impacto |
| Dev 1 | páginas de monitoramento/doações/PDF | fluxo demonstrável em tela de notebook e celular |
| Dupla Dev + IoT 2 | ensaio ponta a ponta | sensor → API → DB → BI < 20 segundos além do período de detecção |
| Todos | pitch e plano de contingência | apresentação em até 6 minutos, simulador pronto |

## Definição de pronto (MVP)

- `docker compose up --build` inicia banco e web em máquina preparada.
- Usuário faz login temporário HTTP Basic; acesso de dispositivo usa chave individual.
- Hardware envia pacote real; painel mostra leitura e ocorrência do mesmo `deviceCode`.
- Ao reconhecer uma ocorrência, persiste `OccurrenceEvent`.
- Lote começa PENDING_REVIEW e não é marcado entregue diretamente.
- PDF exibe fonte dos dados e não declara água economizada.
- Com Wi-Fi indisponível, simulador CLI serve de contingência, com origem informada.

## Fora do escopo inicial

- Machine learning de vazamentos; sensores de precisão certificados; pagamentos; logística de transporte em tempo real; reconhecimento de alimentos por câmera; RBAC multi-organização de produção; envio de push.

## Caminho para implantação real

1. Conversar com 3 comércios e 1 entidade receptora.
2. Piloto hidráulico controlado, sem alterar encanamento comercial.
3. Medir taxa de falsos alarmes e estabilidade.
4. Levantar custo real de instalação/manutenção, aderência sanitária e disponibilidade de internet.
5. Definir consentimentos, retenção de dados, autenticação robusta, backups e precificação.
